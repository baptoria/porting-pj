import { createRuntime } from "./archive";
import { measure } from "./telemetry";
import { overlayFiles } from "./save-state";
self.onmessage = (e) => {
  try {
    const { profile, archives, save, temporary, environment } = e.data;
    const start = performance.now();
    const bytes =
      archives.reduce((n: number, a: { size: number }) => n + a.size, 0) +
      Object.values(overlayFiles(save)).reduce((n, b) => n + b.byteLength, 0);
    const bundle = createRuntime(profile, archives, save, temporary, environment);
    self.postMessage(
      {
        bundle,
        measurement: measure(
          "Runtime ZIP assembly",
          start,
          bytes + bundle.byteLength,
        ),
      },
      { transfer: [bundle.buffer] },
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
