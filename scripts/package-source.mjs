import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { zipSync } from "fflate";
const files = Object.create(null);
async function add(path) {
  if ((await stat(path)).isDirectory()) {
    for (const name of await readdir(path)) await add(`${path}/${name}`);
  } else files[`ed4-mobile/${path}`] = new Uint8Array(await readFile(path));
}
for (const dir of ["src", "scripts", "tests", "licenses"]) await add(dir);
for (const name of await readdir("."))
  if (
    /\.(json|ts|md)$/.test(name) ||
    ["LICENSE", ".gitignore", ".gitattributes", "index.html"].includes(name)
  )
    await add(name);
for (const name of [
  "public/manifest.webmanifest",
  "public/.nojekyll",
  "public/icon.svg",
  "public/dos-worker.js",
  "public/dos-worker-phase9-2.js",
  "public/dos-worker-phase9-3.js",
  "public/dos-worker-phase9-4.js",
  "public/licenses/NOTICE.html",
])
  await add(name);
for(const name of await readdir('public'))if(/^dos-worker-(?:common-)?phase9-[34]-[a-f0-9]{16}\.js$/.test(name)||/^phase9-[34]-worker\.json$/.test(name))await add('public/'+name);
await mkdir("public/sources", { recursive: true });
await writeFile(
  "public/sources/ed4-mobile-source.zip",
  zipSync(files, { level: 6 }),
);
console.log(
  `Packaged ${Object.keys(files).length} launcher source files (game data excluded).`,
);
