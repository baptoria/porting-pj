// Records all output bytes including source ZIPs. Never rewrites either output.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const [mode, variant, label] = process.argv.slice(2);
if (
  !["record", "compare"].includes(mode) ||
  !["public", "developer"].includes(variant) ||
  !/^[a-z-]+$/.test(label ?? "")
)
  throw Error("Usage: record|compare public|developer label");
const root = variant === "public" ? "docs/ed4" : "docs/ed4-dev",
  rows = {};
async function walk(path = "") {
  for (const f of await readdir(root + "/" + path, { withFileTypes: true })) {
    const p = path + f.name;
    if (f.isDirectory()) await walk(p + "/");
    else
      rows[p] = createHash("sha256")
        .update(await readFile(root + "/" + p))
        .digest("hex");
  }
}
await walk();
const canonical = (o) =>
  JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
await mkdir("artifacts/phase9-8p", { recursive: true });
const record = "artifacts/phase9-8p/" + label + ".json";
if (mode === "record") await writeFile(record, JSON.stringify(rows, null, 2));
else if (canonical(rows) !== canonical(JSON.parse(await readFile(record))))
  throw Error("Sibling build modified " + root);
console.log(
  JSON.stringify({
    mode,
    root,
    files: Object.keys(rows).length,
    label,
    unchanged: mode === "compare",
  }),
);
