import type { Archive } from "./model";
import { importArchive } from "./importer";
import { removeMusic, storeMusic, type MusicPack } from "./music";
import { ensureSpace } from "./storage";
import { record } from "./telemetry";
import { zipEntries } from "./zip-index";
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
  await ensureSpace(bytes);
  checkCancelled(signal);
  const requestId = crypto.randomUUID();
  const result = await new Promise<{ archive: Archive; pack?: MusicPack }>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("./source-worker.ts", import.meta.url),
        { type: "module" },
      );
      let timer: ReturnType<typeof setTimeout>;
      const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          end();
          reject(Error("파일 등록 응답 시간 초과. 기존 데이터는 유지됩니다."));
        }, 60000);
      };
      const end = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.terminate();
      };
      const abort = () => {
        end();
        reject(new DOMException("등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      reset();
      worker.onmessage = (e) => {
        reset();
        if (e.data.progress) {
          progress(e.data.progress, e.data.totalBytes === undefined ? undefined : e.data);
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
    await discardStagedMusic(requestId).catch(() => {});
    throw e;
  });
  try {
    checkCancelled(signal);
    if (result.pack) {
      await storeMusic(result.pack);
    }
    checkCancelled(signal);
  } catch (e) {
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
