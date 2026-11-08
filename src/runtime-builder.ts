import type { Archive, Profile, Save, Files } from "./model";
import { overlayFiles } from "./save-state";
import { record } from "./telemetry";
export async function buildRuntime(
  profile: Profile,
  archives: Archive[],
  save?: Save,
  temporary: Files = {},
): Promise<Uint8Array> {
  const buffers = [
    ...archives.flatMap((a) => Object.values(a.files)),
    ...Object.values(overlayFiles(save)),
    ...Object.values(temporary),
  ];
  if (buffers.reduce((n, b) => n + b.byteLength, 0) > 256 * 1024 * 1024)
    throw new Error(
      "원본·모드·저장 합계가 메모리 안전 제한 256 MiB를 초과합니다. 작은 모드 구성을 사용하세요.",
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./runtime-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new Error(
          "실행 ZIP 구성 시간 초과. 원본은 보존됩니다. 작은 구성으로 시도하세요.",
        ),
      );
    }, 30000);
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(new Error(e.data.error));
      else {
        record(e.data.measurement);
        resolve(e.data.bundle);
      }
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "실행 ZIP 구성 실패: 파일 손상 또는 브라우저 메모리 부족을 확인하세요.",
        ),
      );
    };
    worker.postMessage({ profile, archives, save, temporary }, [
      ...new Set(buffers.map((b) => b.buffer as ArrayBuffer)),
    ]);
  });
}
