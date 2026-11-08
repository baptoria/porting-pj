import type { Archive } from "./model";
import { importArchive } from "./importer";
import { removeMusic, storeMusic, type MusicPack } from "./music";
import { ensureSpace } from "./storage";
import { record } from "./telemetry";
import { zipEntries } from "./zip-index";
import { ImportMeter, IMPORT_SILENCE_MS, rememberImport, importTrace, failImport, importCommit, timeoutMessage, stageLabels, importOperation } from './import-trace';
export interface SourceInput {
  path: string;
  file: Blob;
}
export interface ImportProgress {
  completedBytes: number;
  totalBytes: number;
  currentFile: string;
}
export const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.", "AbortError");
};
export async function discardStagedMusic(id: string) {
  for (let attempt = 0; ; attempt++) {
    try { await removeMusic(id); return; }
    catch (error) { if (attempt >= 3) throw error; await new Promise(r => setTimeout(r, 50)); }
  }
}
export async function importSources(
  input: SourceInput[] | File,
  name: string,
  musicOnly = false,
  progress: (s: string, details?: ImportProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<{ archive: Archive; pack?: MusicPack }> {
  checkCancelled(signal);
  const bytes = Array.isArray(input)
    ? input.reduce((n, f) => n + f.file.size, 0)
    : input.size;
  if (bytes > 768 * 1024 * 1024)
    throw Error("등록 입력은 768 MiB 이하여야 합니다. 본체와 음악을 나누세요.");
  const initial = new ImportMeter(Array.isArray(input)?'folder':'zip', data=>rememberImport(data,true));
  try { await initial.async('space',0,()=>ensureSpace(bytes)); initial.publish(true); }
  catch(error){failImport(error);throw error;}
  checkCancelled(signal);
  const requestId = crypto.randomUUID();
  const result = await new Promise<{ archive: Archive; pack?: MusicPack }>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("./source-worker.ts", import.meta.url),
        { type: "module" },
      );
      let timer: ReturnType<typeof setTimeout>;
      let lastResponse=performance.now(), maxGap=0;
      const workerStart=performance.now();let lastProgress=workerStart,maxProgressGap=0;
      const visibilityChanges=[{state:document.visibilityState as string,elapsedMs:0}];
      const visibility=()=>{visibilityChanges.push({state:document.visibilityState,elapsedMs:performance.now()-workerStart});if(visibilityChanges.length>30)visibilityChanges.shift();};
      document.addEventListener('visibilitychange',visibility);
      const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          end();
          const d=importTrace();
          if(d){d.maxResponseGapMs=Math.max(d.maxResponseGapMs,performance.now()-lastResponse);d.elapsedMs=performance.now()-workerStart;d.visibility=document.visibilityState;d.visibilityChanges=visibilityChanges;rememberImport(d,true);}
          reject(Error(timeoutMessage(d)));
        }, IMPORT_SILENCE_MS);
      };
      const end = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        document.removeEventListener('visibilitychange',visibility);
        worker.terminate();
      };
      const abort = () => {
        end();
        reject(new DOMException("등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      reset();
      worker.onmessage = (e) => {
        maxGap=Math.max(maxGap,performance.now()-lastResponse);lastResponse=performance.now();
        reset();
        // Small stage-entry breadcrumbs identify a stalled synchronous operation.
        // They do not trigger DOM updates or serialize the entire metrics object.
        if(e.data.operation){importOperation(e.data.operation,e.data.fileIndex);return;}
        if(e.data.progress){maxProgressGap=Math.max(maxProgressGap,performance.now()-lastProgress);lastProgress=performance.now();}
        if(e.data.trace){e.data.trace.maxResponseGapMs=maxGap;e.data.trace.maxProgressGapMs=maxProgressGap;e.data.trace.visibility=document.visibilityState;e.data.trace.visibilityChanges=visibilityChanges;rememberImport(e.data.trace,e.data.trace.status!=='working');}
        if (e.data.progress) {
          const trace=e.data.trace;
          const message=trace?.stage ? `${stageLabels[trace.stage as keyof typeof stageLabels]} · ${e.data.currentFile || '전체 ZIP'} · ${Math.round(trace.elapsedMs/1000)}초` : e.data.progress;
          progress(message, e.data.totalBytes === undefined ? undefined : e.data);
          return;
        }
        end();
        if (e.data.error) {
          reject(
            e.data.errorName === "QuotaExceededError"
              ? new DOMException(e.data.error, "QuotaExceededError")
              : new Error(e.data.error),
          );
          return;
        }
        record(e.data.measurement);
        resolve(e.data);
      };
      worker.onerror = (e) => {
        end();
        reject(Error("파일 처리 Worker 실패: " + e.message));
      };
      worker.postMessage({ input, name, musicOnly, requestId });
    },
  ).catch(async (e) => {
    failImport(e);
    await discardStagedMusic(requestId).catch(() => {});
    throw e;
  });
  try {
    checkCancelled(signal);
    if (result.pack) {
      progress('음악 IndexedDB 확정 중…');
      await importCommit('musicDb',()=>storeMusic(result.pack!));
    }
    checkCancelled(signal);
  } catch (e) {
    failImport(e);
    await discardStagedMusic(requestId).catch(() => {});
    throw e;
  }
  return result;
}
export async function importGameZip(
  file: File,
  progress: (s: string) => void = () => {},
) {
  // Preserve Phase 2 bounded fast path and its telemetry for small, core-only ZIPs.
  if (file.size <= 128 * 1024 * 1024) {
    const index = await zipEntries(file);
    if (!index.some((e) => !e.directory && e.path.endsWith(".RAW")))
      return { archive: await importArchive(file, file.name) };
  }
  return importSources(file, file.name, false, progress);
}
