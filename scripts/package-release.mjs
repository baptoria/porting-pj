import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
const files = Object.create(null);
async function add(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await add(path);
    else files[path.slice(5)] = new Uint8Array(await readFile(path));
  }
}
await add("docs");
for (const required of [
  "index.html",
  "ed4/sw.js",
  "ed4/vendor/wdosbox.wasm",
  "ed4/sources/emulators-0.73.8-source.zip",
  "ed4/sources/ed4-mobile-source.zip",
  "ed4/licenses/emulators-GPL-2.0.txt",
])
  if (!files[required]) throw new Error(`Missing release asset: ${required}`);
const data = zipSync(files, { level: 6 });
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/ed4-mobile-web.zip", data);
const manifest = {
  file: "ed4-mobile-web.zip",
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  fileCount: Object.keys(files).length,
};
await writeFile(
  "artifacts/release-manifest.json",
  JSON.stringify(manifest, null, 2),
);
console.log(JSON.stringify(manifest, null, 2));
