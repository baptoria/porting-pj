import { zipEntries } from "./zip-index";
import { Inflate } from "fflate";
import { canonicalPath, validateTree, analyzeFiles, LIMITS } from "./archive";
import { Sha256 } from "./sha-stream";
import { musicDirectory, type MusicPack, type Track } from "./music";
import { rawInfo } from "./raw-audio";
import type { Files } from "./model";
import type { SourceInput } from "./source-import";
import { ensureSpace } from "./storage";
import { ImportMeter } from "./import-trace";
const CHUNK = 256 * 1024,
  MAX = 768 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let n = 0; n < 8; n++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
  return i;
});
const crcStep = (crc: number, b: Uint8Array) => {
  for (const x of b) crc = (crc >>> 8) ^ crcTable[(crc ^ x) & 255];
  return crc;
};
self.onmessage = async (e) => {
  const { input, name, musicOnly, requestId } = e.data as {
    input: SourceInput[] | File;
    name: string;
    musicOnly: boolean;
    requestId: string;
  };
  const start = performance.now(),
    files: Files = Object.create(null),
    tracks: Track[] = [],
    originalPaths: Record<string, string> = Object.create(null),
    manifest: string[] = [];
  let coreBytes = 0,
    total = 0,
    maxChunk = 0,
    maxInflateOutput = 0,
    dir: FileSystemDirectoryHandle | undefined;
  let currentFile = '';
  let hashingZip=false;
  const meter = new ImportMeter(Array.isArray(input) ? 'folder' : 'zip', trace => self.postMessage({
    progress: `${trace.stage ?? 'index'} · ${currentFile}`, currentFile,
    completedBytes: hashingZip ? trace.stages.zipSha?.bytes ?? 0 : trace.completedBytes,
    totalBytes: hashingZip ? (input as File).size : trace.totalBytes, trace,
  }), stage=>self.postMessage({operation:stage,fileIndex:meter.data.fileIndex}));
  const read = async (blob: Blob) => new Uint8Array(await meter.async('read', blob.size, () => blob.arrayBuffer()));
  try {
    const entries = Array.isArray(input)
      ? input.map((f) => ({
          path: canonicalPath(f.path),
          originalPath: f.path.replace(/\\/g, "/"),
          size: f.file.size,
          blob: f.file,
          directory: false,
        }))
      : await meter.async('index', 0, () => zipEntries(input,read));
    const seen = new Set<string>();
    const tree: Files = Object.create(null);
    for (const en of entries) {
      if (seen.has(en.path)) throw Error("중복 경로: " + en.path);
      seen.add(en.path);
      if (!en.directory) tree[en.path] = new Uint8Array();
    }
    validateTree(tree);
    if (entries.length > 12000 || !entries.length)
      throw Error("파일 개수 제한");
    const expectedBytes = entries.reduce((n, en) => n + en.size, 0);
    if (expectedBytes > MAX) throw Error("전체 해제 크기 768 MiB 제한 초과. 폴더 구조를 확인하세요.");
    meter.data.totalBytes = expectedBytes;
    await meter.async('space', 0, () => ensureSpace(expectedBytes));
    let processed = 0, lastProgress = 0;
    for (const en of entries) {
      if (en.directory) continue;
      currentFile = en.originalPath;
      meter.data.fileIndex++;
      const raw = en.path.endsWith(".RAW");
      if (musicOnly && !raw)
        throw Error("음악 등록에는 RAW 파일만 선택하세요: " + en.path);
      total += en.size;
      if (
        total > MAX ||
        en.size > (raw ? 128 * 1024 * 1024 : LIMITS.file) ||
        (!raw && (coreBytes += en.size) > LIMITS.expanded)
      )
        throw Error("본체 256 MiB / 전체 768 MiB / 개별 크기 제한 초과");
      self.postMessage({
        progress: `파일 처리 ${manifest.length + 1}/${entries.length}: ${en.originalPath}`,
        completedBytes: processed, totalBytes: expectedBytes, currentFile: en.originalPath,
      });
      const body = raw ? undefined : new Uint8Array(en.size),
        hash = new Sha256(),
        header = new Uint8Array(8);
      let written = 0,
        crc = 0xffffffff;
      // Sync handle is Worker-only. Keep one file open and one bounded input chunk.
      let access: any;
      const key = String(tracks.length) + ".bin";
      if (raw) {
        dir ??= await meter.async('opfs', 0, () => musicDirectory(requestId, true));
        const h = await meter.async('opfs', 0, () => dir!.getFileHandle(key, { create: true }));
        if (!("createSyncAccessHandle" in h))
          throw Error(
            "OPFS 동기 파일 접근을 지원하지 않습니다. 음악 없이 등록하세요.",
          );
        access = await meter.async('opfs', 0, () => (h as any).createSyncAccessHandle());
      }
      const consume = (chunk: Uint8Array) => {
        if (written + chunk.length > en.size)
          throw Error("ZIP 실제 해제 크기가 선언을 초과합니다.");
        if (written < 8)
          header.set(
            chunk.subarray(0, Math.min(8 - written, chunk.length)),
            written,
          );
        meter.sync('fileSha', chunk.length, () => hash.update(chunk));
        if (!('blob' in en)) crc = meter.sync('crc', chunk.length, () => crcStep(crc, chunk));
        maxChunk = Math.max(maxChunk, chunk.length);
        if (access) {
          const n = meter.sync('opfs', chunk.length, () => access.write(chunk, { at: written }));
          if (n !== chunk.length)
            throw Error("음악 저장 불완전: 저장 공간을 확인하세요.");
        } else body!.set(chunk, written);
        written += chunk.length;
        processed += chunk.length;
        meter.data.completedBytes = processed;
        if (performance.now() - lastProgress > 150) {
          lastProgress = performance.now();
          self.postMessage({ progress: `파일 처리: ${en.originalPath}`, completedBytes: processed, totalBytes: expectedBytes, currentFile: en.originalPath });
        }
      };
      try {
        if ("blob" in en) {
          for (let p = 0; p < en.size; p += CHUNK)
            consume(
              await read(en.blob.slice(p, p + CHUNK)),
            );
        } else {
          const zip = input as File,
            head = await read(zip.slice(en.offset, en.offset + 30));
          if (head.length !== 30) throw Error("ZIP 파일 헤더 누락");
          const hv = new DataView(head.buffer);
          if (
            hv.getUint32(0, true) !== 0x04034b50 ||
            hv.getUint16(8, true) !== en.method
          )
            throw Error("ZIP 로컬 헤더 불일치");
          const nl = hv.getUint16(26, true),
            dataAt = en.offset + 30 + nl + hv.getUint16(28, true);
          const localName = new TextDecoder("utf-8", { fatal: true }).decode(
            await read(zip.slice(en.offset + 30, en.offset + 30 + nl)),
          );
          if (
            canonicalPath(localName) !== en.path ||
            dataAt + en.compressed > zip.size
          )
            throw Error("ZIP 로컬 경로/크기 불일치");
          // A small deflate input can expand ~1000x. Slice hashing/CRC/writes too.
          let consumeMs = 0;
          const inflater = en.method === 8 ? new Inflate(output => {
            maxInflateOutput=Math.max(maxInflateOutput,output.length);
            const t=performance.now();
            for(let at=0;at<output.length;at+=CHUNK) consume(output.subarray(at,at+CHUNK));
            consumeMs += performance.now()-t;
          }) : undefined;
          const inputChunk = inflater ? 4096 : CHUNK;
          for (let p = 0; p < en.compressed; p += inputChunk) {
            const chunk = await read(zip.slice(dataAt+p,dataAt+Math.min(p+inputChunk,en.compressed)));
            if (inflater) {
              consumeMs=0;
              const t=meter.begin('inflate');
              inflater.push(chunk, p + chunk.length === en.compressed);
              // Exclusive inflate time: callback SHA/CRC/OPFS is separately measured.
              meter.end('inflate',t+consumeMs,chunk.length);
            }
            else consume(chunk);
          }
          meter.sync('crc',0,()=>{
            if ((crc ^ 0xffffffff) >>> 0 !== en.crc) throw Error("ZIP CRC 불일치: " + en.path);
          });
        }
        if (written !== en.size) throw Error("파일 길이가 맞지 않습니다.");
        const digest = meter.sync('fileSha', 0, () => hash.hex());
        originalPaths[en.path] = en.originalPath;
        manifest.push(`${en.path}\0${en.size}\0${digest}`);
        if (raw) {
          // RAW is opaque game data; EFFECT sounds may not use the diagnostic
          // PCM preview layout. Preserve bytes even when preview is unsupported.
          let previewCompatible = false;
          try { rawInfo(en.size, header); previewCompatible = true; } catch {}
          meter.sync('opfs', 0, () => access.flush());
          tracks.push({
            path: en.path,
            originalPath: en.originalPath,
            previewCompatible,
            key,
            size: en.size,
            sha256: digest,
            header: Array.from(header, (n) =>
              n.toString(16).padStart(2, "0"),
            ).join(""),
          });
        } else {
          files[en.path] = body!;
        }
      } catch(error) {
        // Do not let cleanup overwrite the failing CRC/hash/read/write stage.
        meter.data.status='failed';meter.publish(true);throw error;
      } finally {
        if(access){
          if(meter.data.status==='failed'){try{access.close();}catch{}}
          else meter.sync('opfs', 0, () => access.close());
        }
      }
    }
    let sha256: string | undefined,
      versionId: string,
      manifestSha256: string | undefined;
    if (!Array.isArray(input)) {
      hashingZip=true;
      const hash = new Sha256();
      currentFile = '';
      for (let p = 0; p < input.size; p += CHUNK) {
        const b=await read(input.slice(p,p+CHUNK));
        meter.sync('zipSha', b.length, () => hash.update(b));
      }
      sha256 = meter.sync('zipSha', 0, () => hash.hex());
      versionId = "sha256:" + sha256;
    } else {
      manifestSha256 = new Sha256()
        .update(new TextEncoder().encode(manifest.sort().join("\n")))
        .hex();
      versionId = "folder:" + manifestSha256;
    }
    const finalizeStart=meter.begin('finalize');
    const pack: MusicPack | undefined = tracks.length
      ? {
          id: requestId,
          name,
          tracks,
          bytes: tracks.reduce((n, t) => n + t.size, 0),
          createdAt: Date.now(),
        }
      : undefined;
    const archive = {
      id: crypto.randomUUID(),
      name,
      files,
      originalPaths,
      size: coreBytes,
      createdAt: Date.now(),
      sha256,
      manifestSha256,
      versionId,
      sourceKind: Array.isArray(input) ? "folder" : "zip",
      analysis: analyzeFiles(files),
      fileCount: Object.keys(files).length,
      musicPackId: pack?.id,
    };
    meter.end('finalize',finalizeStart);
    meter.data.buffers={coreBytes,maxConsumeChunk:maxChunk,maxInflateOutput};
    meter.data.status='staged';meter.publish(true);
    self.postMessage(
      {
        archive,
        pack,
        measurement: {
          stage: "stream import",
          elapsedMs: performance.now() - start,
          logicalBytes: coreBytes + Math.max(maxChunk,maxInflateOutput),
          note: `Observed core retained bytes + largest consume/inflate output (${maxChunk}/${maxInflateOutput} B); OPFS ${pack?.bytes ?? 0} B; excludes inflater internal buffers/input/GC; not total heap/peak/RSS`,
        },
      },
      { transfer: Object.values(files).map((b) => b.buffer as ArrayBuffer) },
    );
  } catch (error) {
    meter.data.status='failed';meter.data.error=error instanceof Error?error.name:'Error';meter.publish(true);
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
    });
  }
};
