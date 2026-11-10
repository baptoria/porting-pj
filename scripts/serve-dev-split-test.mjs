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
  releases[name] = { current, previous, version: "current" };
}
createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/__release") {
      const r = releases[url.searchParams.get("app")];
      const v = url.searchParams.get("version");
      if (!r || !["current", "previous"].includes(v)) throw Error();
      r.version = v;
      res.end("ok");
      return;
    }
    const match = url.pathname.match(/^\/porting-pj\/(ed4|ed4-dev)\/(.*)$/);
    if (!match) throw Error();
    const r = releases[match[1]],
      path = match[2] || "index.html",
      bytes = r[r.version].get(path);
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
}).listen(4175, "localhost");
