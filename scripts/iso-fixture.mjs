// CC0 synthetic ISO 9660 fixture. No commercial data or external paths.
import { open } from "node:fs/promises";
const block = 2048,
  round = (n) => Math.ceil(n / block) * block;
const both = (b, at, n, width) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (width === 2) {
    v.setUint16(at, n, true);
    v.setUint16(at + 2, n, false);
  } else {
    v.setUint32(at, n, true);
    v.setUint32(at + 4, n, false);
  }
};
export function rawTone(hz = 440, seconds = 0.2) {
  const b = new Uint8Array(8 + Math.round(22050 * seconds) * 4),
    v = new DataView(b.buffer);
  v.setUint16(0, 3, true);
  v.setUint16(2, 22050, true);
  v.setUint32(4, b.length - 8, true);
  for (let i = 0; i < (b.length - 8) / 4; i++)
    for (let c = 0; c < 2; c++)
      v.setInt16(
        8 + i * 4 + c * 2,
        Math.sin((2 * Math.PI * hz * i) / 22050) * 10000,
        true,
      );
  return b;
}
export function isoParts(files) {
  const dirs = new Map([["", { path: "", directory: true, children: [] }]]),
    entries = [];
  for (const [path, data] of Object.entries(files)) {
    const names = path.split("/");
    let parent = "";
    for (const name of names.slice(0, -1)) {
      const key = parent ? parent + "/" + name : name;
      if (!dirs.has(key)) {
        const d = { path: key, directory: true, children: [] };
        dirs.set(key, d);
        dirs.get(parent).children.push(d);
      }
      parent = key;
    }
    const e = { path, directory: false, size: data.size ?? data.length, data };
    entries.push(e);
    dirs.get(parent).children.push(e);
  }
  const nameOf = (e) => e.path.split("/").at(-1) + (e.directory ? "" : ";1");
  const recLen = (n) => 33 + n.length + (n.length % 2 === 0 ? 1 : 0);
  let next = 20 * block;
  for (const d of dirs.values()) {
    let pos = 68;
    for (const e of d.children) {
      const len = recLen(nameOf(e));
      if ((pos % block) + len > block) pos = round(pos);
      pos += len;
    }
    d.size = round(pos);
    d.offset = next;
    next += d.size;
  }
  for (const e of entries) {
    e.offset = next;
    next += round(e.size);
  }
  const record = (e, name) => {
    const n =
        typeof name === "number"
          ? new Uint8Array([name])
          : new TextEncoder().encode(name),
      b = new Uint8Array(recLen(n));
    b[0] = b.length;
    both(b, 2, e.offset / block, 4);
    both(b, 10, e.size, 4);
    b[25] = e.directory ? 2 : 0;
    both(b, 28, 1, 2);
    b[32] = n.length;
    b.set(n, 33);
    return b;
  };
  const pvd = new Uint8Array(block);
  pvd[0] = 1;
  pvd.set(new TextEncoder().encode("CD001"), 1);
  pvd[6] = 1;
  both(pvd, 80, next / block, 4);
  both(pvd, 120, 1, 2);
  both(pvd, 124, 1, 2);
  both(pvd, 128, block, 2);
  pvd.set(record(dirs.get(""), 0), 156);
  pvd[881] = 1;
  const end = new Uint8Array(block);
  end[0] = 255;
  end.set(pvd.subarray(1, 7), 1);
  const parts = [
    { offset: 16 * block, bytes: pvd },
    { offset: 17 * block, bytes: end },
  ];
  for (const d of dirs.values()) {
    const b = new Uint8Array(d.size),
      parent = dirs.get(d.path.split("/").slice(0, -1).join("/")) ?? d;
    let pos = 0;
    for (const [e, name] of [
      [d, 0],
      [parent, 1],
      ...d.children.map((e) => [e, nameOf(e)]),
    ]) {
      const r = record(e, name);
      if ((pos % block) + r.length > block) pos = round(pos);
      b.set(r, pos);
      pos += r.length;
    }
    parts.push({ offset: d.offset, bytes: b });
  }
  for (const e of entries)
    parts.push({ offset: e.offset, bytes: e.data.head ?? e.data });
  return { size: next, parts, entries };
}
export function isoBlob(files) {
  const { size, parts } = isoParts(files),
    b = new Uint8Array(size);
  for (const p of parts) b.set(p.bytes, p.offset);
  return new Blob([b]);
}
export async function writeIsoFixture(path, files) {
  const image = isoParts(files),
    f = await open(path, "w");
  try {
    await f.truncate(image.size);
    for (const p of image.parts)
      await f.write(p.bytes, 0, p.bytes.length, p.offset);
  } finally {
    await f.close();
  }
  return image;
}
