import { zipEntries } from "./zip-index";
import { Inflate } from "fflate";
import { canonicalPath, validateTree, analyzeFiles, LIMITS } from "./archive";
import { Sha256 } from "./sha-stream";
import { musicDirectory, type MusicPack, type Track } from "./music";
import { rawInfo } from "./raw-audio";
import type { Files } from "./model";
import type { SourceInput } from "./source-import";
import { ensureSpace } from "./storage";
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
    dir: FileSystemDirectoryHandle | undefined;
  try {
    const entries = Array.isArray(input)
      ? input.map((f) => ({
          path: canonicalPath(f.path),
          originalPath: f.path.replace(/\\/g, "/"),
          size: f.file.size,
          blob: f.file,
          directory: false,
        }))
      : await zipEntries(input);
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
    await ensureSpace(expectedBytes);
    let processed = 0, lastProgress = 0;
    for (const en of entries) {
      if (en.directory) continue;
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
        dir ??= await musicDirectory(requestId, true);
        const h = await dir.getFileHandle(key, { create: true });
        if (!("createSyncAccessHandle" in h))
          throw Error(
            "OPFS 동기 파일 접근을 지원하지 않습니다. 음악 없이 등록하세요.",
          );
        access = await (h as any).createSyncAccessHandle();
      }
      const consume = (chunk: Uint8Array) => {
        if (written + chunk.length > en.size)
          throw Error("ZIP 실제 해제 크기가 선언을 초과합니다.");
        if (written < 8)
          header.set(
            chunk.subarray(0, Math.min(8 - written, chunk.length)),
            written,
          );
        hash.update(chunk);
        crc = crcStep(crc, chunk);
        maxChunk = Math.max(maxChunk, chunk.length);
        if (access) {
          const n = access.write(chunk, { at: written });
          if (n !== chunk.length)
            throw Error("음악 저장 불완전: 저장 공간을 확인하세요.");
        } else body!.set(chunk, written);
        written += chunk.length;
        processed += chunk.length;
        if (performance.now() - lastProgress > 150) {
          lastProgress = performance.now();
          self.postMessage({ progress: `파일 처리: ${en.originalPath}`, completedBytes: processed, totalBytes: expectedBytes, currentFile: en.originalPath });
        }
      };
      try {
        if ("blob" in en) {
          for (let p = 0; p < en.size; p += CHUNK)
            consume(
              new Uint8Array(await en.blob.slice(p, p + CHUNK).arrayBuffer()),
            );
        } else {
          const zip = input as File,
            head = new Uint8Array(
              await zip.slice(en.offset, en.offset + 30).arrayBuffer(),
            );
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
            await zip.slice(en.offset + 30, en.offset + 30 + nl).arrayBuffer(),
          );
          if (
            canonicalPath(localName) !== en.path ||
            dataAt + en.compressed > zip.size
          )
            throw Error("ZIP 로컬 경로/크기 불일치");
          const inflater = en.method === 8 ? new Inflate(consume) : undefined;
          for (let p = 0; p < en.compressed; p += 32768) {
            const chunk = new Uint8Array(
              await zip
                .slice(dataAt + p, dataAt + Math.min(p + 32768, en.compressed))
                .arrayBuffer(),
            );
            if (inflater)
              inflater.push(chunk, p + chunk.length === en.compressed);
            else consume(chunk);
          }
          if ((crc ^ 0xffffffff) >>> 0 !== en.crc)
            throw Error("ZIP CRC 불일치: " + en.path);
        }
        if (written !== en.size) throw Error("파일 길이가 맞지 않습니다.");
        const digest = hash.hex();
        originalPaths[en.path] = en.originalPath;
        manifest.push(`${en.path}\0${en.size}\0${digest}`);
        if (raw) {
          // RAW is opaque game data; EFFECT sounds may not use the diagnostic
          // PCM preview layout. Preserve bytes even when preview is unsupported.
          let previewCompatible = false;
          try { rawInfo(en.size, header); previewCompatible = true; } catch {}
          access.flush();
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
      } finally {
        access?.close();
      }
    }
    let sha256: string | undefined,
      versionId: string,
      manifestSha256: string | undefined;
    if (!Array.isArray(input)) {
      const hash = new Sha256();
      for (let p = 0; p < input.size; p += 1024 * 1024) {
        hash.update(
          new Uint8Array(await input.slice(p, p + 1024 * 1024).arrayBuffer()),
        );
        if (p % (16 * 1024 * 1024) === 0)
          self.postMessage({
            progress: `ZIP SHA-256 확인: ${Math.round((p / input.size) * 100)}%`,
          });
      }
      sha256 = hash.hex();
      versionId = "sha256:" + sha256;
    } else {
      manifestSha256 = new Sha256()
        .update(new TextEncoder().encode(manifest.sort().join("\n")))
        .hex();
      versionId = "folder:" + manifestSha256;
    }
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
    self.postMessage(
      {
        archive,
        pack,
        measurement: {
          stage: "stream import",
          elapsedMs: performance.now() - start,
          logicalBytes: coreBytes + maxChunk,
          note: `Observed core retained bytes + largest output chunk (${maxChunk} B); OPFS ${pack?.bytes ?? 0} B; not total heap/peak/RSS`,
        },
      },
      { transfer: Object.values(files).map((b) => b.buffer as ArrayBuffer) },
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
    });
  }
};
