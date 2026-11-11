// Two independent synthetic releases on one origin. No deployed files mutated.
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
const hash = (b) => createHash("sha256").update(b).digest("hex"),
  releases = {};
for (const name of ["ed4", "ed4-dev"]) {
  const current = new Map();
  async function walk(path = "") {
    for (const e of await readdir("docs/" + name + "/" + path, {
      withFileTypes: true,
    }))
      if (e.isDirectory()) await walk(path + e.name + "/");
      else
        current.set(
          path + e.name,
          await readFile("docs/" + name + "/" + path + e.name),
        );
  }
  await walk();
  const manifest = JSON.parse(current.get("build-manifest.json")),
    previous = new Map(current),
    oldId = manifest.build.id + "-prior";
  for (const [path, bytes] of previous)
    if (/\.(js|html|json)$/.test(path) && !path.startsWith("vendor/"))
      previous.set(
        path,
        Buffer.from(bytes.toString().replaceAll(manifest.build.id, oldId)),
      );
  const prior = JSON.parse(previous.get("build-manifest.json"));
  for (const f of prior.files) {
    const bytes = previous.get(f.path);
    f.bytes = bytes.length;
    f.sha256 = hash(bytes);
  }
  const sw = previous
    .get("sw.js")
    .toString()
    .replace(
      /^const FILES=.*;$/m,
      "const FILES=" + JSON.stringify(prior.files) + ";",
    )
    .replace(
      /const CACHE=PREFIX\+'[a-f0-9]+';/,
      "const CACHE=PREFIX+'0011223344556677';",
    );
  previous.set("sw.js", Buffer.from(sw));
  prior.swSha256 = hash(sw);
  previous.set("build-manifest.json", Buffer.from(JSON.stringify(prior)));
  const legacy=new Map();
  if(name==='ed4')for(const [p] of current){try{legacy.set(p,await readFile('artifacts/phase9-8r-hf2/previous-public/'+p));}catch{}}
  if(name==='ed4'){
   for(const e of await readdir('artifacts/phase9-8r-hf2/previous-public/assets'))legacy.set('assets/'+e,await readFile('artifacts/phase9-8r-hf2/previous-public/assets/'+e));
  }
  releases[name] = { current, previous, legacy, version: "current", fault:'',hits:{},held:[] };
}
createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/__release") {
      const r = releases[url.searchParams.get("app")];
      const v = url.searchParams.get("version");
      if (!r || !["current", "previous", "legacy"].includes(v)) throw Error();
      for(const pending of r.held)pending.destroy();r.held=[];
      r.version = v;r.fault=url.searchParams.get('fault')??'';
      res.end("ok");
      return;
    }
    if(url.pathname==='/__stats'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Object.fromEntries(Object.entries(releases).map(([k,r])=>[k,{hits:r.hits,held:r.held.length}]))));return;}
    const match = url.pathname.match(/^\/porting-pj\/(ed4|ed4-dev)\/(.*)$/);
    if (!match) throw Error();
    const r = releases[match[1]],
      path = match[2] || "index.html",
      original = r[r.version].get(path);
    r.hits[path]=(r.hits[path]??0)+1;
    if(r.fault==='hold'&&path==='icon.svg'){r.held.push(res);return;}
    const bytes=(r.fault==='asset'&&path==='icon.svg')||(r.fault==='sw'&&path==='sw.js')?Buffer.from('corrupt test bytes'):original;
    if (!bytes) throw Error();
    const type = path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".json")
          ? "application/json"
          : path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".wasm")
              ? "application/wasm"
              : path.endsWith(".webmanifest")
                ? "application/manifest+json"
                : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
}).listen(4177, "localhost");
