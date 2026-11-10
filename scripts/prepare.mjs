import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { zipSync, strToU8, zlibSync } from "fflate";
import { testProgram } from "./test-program.mjs";
import { syntheticRaw } from './raw-fixture.mjs';
import { createHash } from "node:crypto";
const sourceManifest = JSON.parse(
  await readFile("licenses/source-manifest.json", "utf8"),
);
let sourceArchive;
try {
  sourceArchive = await readFile(`public/sources/${sourceManifest.archive}`);
} catch {
  throw new Error(
    "Missing corresponding emulator source. Run: python scripts/fetch-sources.py",
  );
}
if (
  createHash("sha256").update(sourceArchive).digest("hex") !==
  sourceManifest.sha256
) {
  throw new Error(
    "Emulator source archive integrity mismatch. Re-fetch the pinned source.",
  );
}
const emulatorPackage = JSON.parse(
  await readFile("node_modules/emulators/package.json", "utf8"),
);
if (emulatorPackage.version !== sourceManifest.emulatorsVersion)
  throw new Error("Emulator binary/source version mismatch.");
await mkdir("public/vendor", { recursive: true });
await mkdir("public/licenses", { recursive: true });
for (const file of [
  "emulators.js",
  "wdosbox.js",
  "wdosbox.wasm",
  "wlibzip.js",
  "wlibzip.wasm",
])
  await copyFile(
    `node_modules/emulators/dist/${file}`,
    `public/vendor/${file}`,
  );
await copyFile(
  "node_modules/emulators/LICENSE",
  "public/licenses/emulators-GPL-2.0.txt",
);
await copyFile("node_modules/fflate/LICENSE", "public/licenses/fflate-MIT.txt");
await copyFile("node_modules/idb/LICENSE", "public/licenses/idb-ISC.txt");
await writeFile(
  "public/test-program.zip",
  zipSync(
    {
      "ED4TEST.COM": testProgram(),
      "RESOURCE.DAT": strToU8("BASE_RESOURCE\r\n"),
      "START.BAT": strToU8("@echo off\r\nED4TEST.COM\r\n"),
      "README.TXT": strToU8(
        "Original ED4 Mobile test fixture. CC0-1.0. S: save; L: load; Q: quit. Source: scripts/test-program.mjs. No game data.",
      ),
    },
    { mtime: new Date("2020-01-01T00:00:00Z") },
  ),
);
// Minimal PNG encoder: original geometric app icon, no downloaded artwork.
await writeFile('public/synthetic-raw.zip',zipSync({'ED4-01.RAW':syntheticRaw(1),'ED4-02.RAW':syntheticRaw(2)},{mtime:new Date('2020-01-01T00:00:00Z')}));
const crc = (data) => {
  let c = 0xffffffff;
  for (const v of data) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  t.copy(out, 4);
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(
    crc(Buffer.concat([t, Buffer.from(data)])),
    8 + data.length,
  );
  return out;
};
for (const size of [192, 512]) {
  const pixels = new Uint8Array((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = y * (size * 4 + 1) + 1 + x * 4,
        xx = x / size,
        yy = y / size;
      const gold =
        (xx > 0.26 && xx < 0.36 && yy > 0.28 && yy < 0.72) ||
        (xx > 0.26 &&
          xx < 0.74 &&
          ((yy > 0.28 && yy < 0.36) ||
            (yy > 0.46 && yy < 0.54) ||
            (yy > 0.64 && yy < 0.72)));
      pixels.set(gold ? [216, 186, 131, 255] : [18, 28, 34, 255], p);
    }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 6;
  await writeFile(
    `public/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", head),
      chunk("IDAT", zlibSync(pixels)),
      chunk("IEND", new Uint8Array()),
    ]),
  );
}
await import('./prepare-phase9-2-assets.mjs');
console.log("Prepared local emulator, licenses, icons, and CC0 DOS test ZIP.");

await import('./prepare-phase9-3-assets.mjs');

await import('./prepare-phase9-3-worker.mjs');

await import('./prepare-phase9-4-assets.mjs');
await import('./prepare-phase9-4-worker.mjs');

await import('./prepare-phase9-5b-assets.mjs');
await import('./prepare-phase9-5b-worker.mjs');

await import('./prepare-phase9-6-assets.mjs');
await import('./prepare-phase9-6-worker.mjs');

await import('./prepare-phase9-7-worker.mjs');
await import('./prepare-phase9-8c-assets.mjs');
await import('./prepare-phase9-8c-worker.mjs');

await import('./prepare-phase9-8d-assets.mjs');
await import('./prepare-phase9-8d-worker.mjs');

await import('./prepare-phase9-8f-assets.mjs');
await import('./prepare-phase9-8f-worker.mjs');

await import('./prepare-phase9-8h-assets.mjs');
await import('./prepare-phase9-8h-worker.mjs');

await import('./prepare-phase9-8i-assets.mjs');
await import('./prepare-phase9-8i-worker.mjs');
await import('./prepare-phase9-8i-worklet.mjs');
