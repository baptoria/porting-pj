import { readZip, analyzeFiles } from "./archive";
import { sha256 } from "./integrity";
import { measure } from "./telemetry";
self.onmessage = async (event) => {
  try {
    const bytes = new Uint8Array(event.data);
    let start = performance.now();
    const hash = await sha256(bytes),
      hashMetric = measure("ZIP SHA-256", start, bytes.byteLength);
    start = performance.now();
    const files = readZip(bytes),
      analysis = analyzeFiles(files),
      metric = measure("ZIP inflate", start, bytes.byteLength + analysis.bytes);
    self.postMessage(
      { files, sha256: hash, analysis, measurements: [hashMetric, metric] },
      { transfer: Object.values(files).map((f) => f.buffer as ArrayBuffer) },
    );
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
