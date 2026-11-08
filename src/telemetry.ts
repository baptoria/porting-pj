import type { Measurement } from "./model";
export const measurements: Measurement[] = [];
export function measure(
  stage: string,
  start: number,
  logicalBytes: number,
  note = "실측: 알려진 버퍼 크기의 합. 전체 프로세스 메모리나 최대 사용량이 아님.",
): Measurement {
  const heap = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory?.usedJSHeapSize;
  return {
    stage,
    elapsedMs: performance.now() - start,
    logicalBytes,
    jsHeapBytes: heap,
    note:
      note +
      (heap !== undefined
        ? " JS heap은 Chromium 비표준 관측값이며 GC/ArrayBuffer/다른 Worker 영향으로 정확한 peak가 아님."
        : " JS heap 계측 API 미지원: 값 미측정."),
  };
}
export function record(...items: Measurement[]) {
  measurements.push(...items);
  if (measurements.length > 100)
    measurements.splice(0, measurements.length - 100);
}
