import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const files = (await walk("docs/ed4")).filter(
  (f) => !f.endsWith("/sw.js") && !f.includes("/sources/"),
);
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(file));
const version = hash.digest("hex").slice(0, 16),
  urls = files.map((f) => "./" + f.slice("docs/ed4/".length));
await writeFile(
  "docs/ed4/sw.js",
  `const PREFIX='ed4-shell-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-';
const CACHE=PREFIX+'${version}';
const URLS=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request).catch(()=>{if(e.request.mode==='navigate')return c.match(new URL('./index.html',self.registration.scope));throw Error('offline');})));});
`,
);
console.log(`Offline cache: ${urls.length} files, ${version}`);

await (await import("./pages-root.mjs")).writePagesRoot();
