import type { Archive } from "./model";
import { id } from "./model";
import { measure, record } from "./telemetry";
import { LIMITS } from "./archive";
export async function importArchive(
  file: Blob,
  name = "game.zip",
): Promise<Archive> {
  if (file.size > LIMITS.compressed)
    throw new Error("ZIP은 128 MiB 이하여야 합니다.");
  const start = performance.now();
  const bytes = await file.arrayBuffer();
  record(measure("ZIP read", start, bytes.byteLength));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./zip-worker.ts", import.meta.url), {
      type: "module",
    });
    const end = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      end();
      reject(
        new Error(
          "ZIP 검사 시간이 초과되었습니다. 작은 ZIP으로 다시 시도하세요.",
        ),
      );
    }, 30000);
    worker.onmessage = (e) => {
      end();
      if (e.data.error) reject(new Error(e.data.error));
      else {
        record(...e.data.measurements);
        resolve({
          id: id(),
          name,
          files: e.data.files,
          sha256: e.data.sha256,
          versionId: `sha256:${e.data.sha256}`,
          analysis: e.data.analysis,
          fileCount: e.data.analysis.files,
          size: e.data.analysis.bytes,
          createdAt: Date.now(),
        });
      }
    };
    worker.onerror = () => {
      end();
      reject(
        new Error(
          "ZIP을 처리하지 못했습니다. 파일 손상 또는 메모리 부족을 확인하세요.",
        ),
      );
    };
    worker.postMessage(bytes, [bytes]);
  });
}
export async function importZip(file: Blob) {
  return (await importArchive(file)).files;
}
