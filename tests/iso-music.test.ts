import { it, expect } from "vitest";
import { indexIso, isoMusicSources, isoRawEnvelope } from "../src/iso-music";
import { isoBlob, isoParts, rawTone } from "../scripts/iso-fixture.mjs";
import { open, stat, writeFile } from "node:fs/promises";
const source = () =>
  isoBlob({
    "ED4/EFFECT/ED4-01.RAW": rawTone(),
    "ED4/EFFECT/OTHER.RAW": rawTone(660),
    "ED4/GAME.BAT": new TextEncoder().encode("TEST.COM"),
  });
it("indexes contiguous offsets and exposes exact RAW slices, never the other game files", async () => {
  const iso = source(),
    result = await isoMusicSources(iso);
  expect(result.found).toBe(2);
  expect(result.inputs.map((e) => e.path)).toEqual([
    "EFFECT/ED4-01.RAW",
    "EFFECT/OTHER.RAW",
  ]);
  expect(new Uint8Array(await result.inputs[0].file.arrayBuffer())).toEqual(
    rawTone(),
  );
  expect(result.index.maxRead).toBe(2048);
  expect(result.warnings).toEqual([]);
});
it("validates all header fields instead of trusting RAW names and sizes", () => {
  const good = rawTone();
  expect(isoRawEnvelope(good.length, good.slice(0, 8)).rate).toBe(22050);
  for (const offset of [0, 2, 4]) {
    const h = good.slice(0, 8);
    h[offset] ^= 1;
    expect(() => isoRawEnvelope(good.length, h)).toThrow();
  }
  expect(() => isoRawEnvelope(good.length + 1, good.slice(0, 8))).toThrow();
});
it("keeps valid songs while reporting a malformed song and an empty music index", async () => {
  const r = await isoMusicSources(
    isoBlob({
      "ED4/EFFECT/A.RAW": rawTone(),
      "ED4/EFFECT/B.RAW": new Uint8Array(12),
    }),
  );
  expect(r.inputs).toHaveLength(1);
  expect(r.warnings).toHaveLength(1);
  expect(
    (await isoMusicSources(isoBlob({ "ED4/GAME.BAT": new Uint8Array(1) })))
      .warnings[0],
  ).toContain("찾지 못");
});
it("rejects truncated and non-ISO input", async () => {
  await expect(indexIso(new Blob([new Uint8Array(50000)]))).rejects.toThrow(
    "지원하지",
  );
  await expect(indexIso(source().slice(0, 40000))).rejects.toThrow();
});
it.each([
  "endian",
  "bounds",
  "multi-extent",
  "interleave",
  "cycle",
  "overlap",
  "traversal",
  "block-size",
])("rejects corrupt or unsupported %s", async (kind) => {
  const parts = isoParts({
      "ED4/EFFECT/A.RAW": rawTone(),
      "ED4/EFFECT/B.RAW": rawTone(),
    }),
    b = new Uint8Array(parts.size);
  for (const p of parts.parts) b.set(p.bytes, p.offset);
  const view = new DataView(b.buffer),
    root = 20 * 2048,
    dir = 22 * 2048,
    first = dir + 68,
    second = first + b[first];
  if (kind === "endian") b[16 * 2048 + 84] ^= 1;
  if (kind === "bounds") {
    view.setUint32(first + 10, 0x7fffffff, true);
    view.setUint32(first + 14, 0x7fffffff, false);
  }
  if (kind === "multi-extent") b[first + 25] = 128;
  if (kind === "interleave") b[first + 26] = 1;
  if (kind === "cycle") {
    view.setUint32(root + 68 + 2, 20, true);
    view.setUint32(root + 68 + 6, 20, false);
  }
  if (kind === "overlap") {
    b.set(b.slice(first + 2, first + 10), second + 2);
  }
  if (kind === "traversal") {
    b[first + 33] = 46;
    b[first + 34] = 46;
    b[first + 35] = 47;
  }
  if (kind === "block-size") {
    view.setUint16(16 * 2048 + 128, 512, true);
    view.setUint16(16 * 2048 + 130, 512, false);
  }
  await expect(indexIso(new Blob([b]))).rejects.toThrow();
});
it("honors cancellation before reading and during directory inspection", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(indexIso(source(), controller.signal)).rejects.toThrow();
  const next = new AbortController();
  await expect(
    indexIso(source(), next.signal, () => next.abort()),
  ).rejects.toThrow();
});
it("indexes a virtual 443MB image using bounded reads without allocating the image", async () => {
  const size = 433081400,
    header = new Uint8Array(8),
    v = new DataView(header.buffer);
  v.setUint16(0, 3, true);
  v.setUint16(2, 22050, true);
  v.setUint32(4, size - 8, true);
  const image = isoParts({ "ED4/EFFECT/BIG.RAW": { size, head: header } });
  let max = 0,
    total = 0;
  const file = {
    size: image.size,
    slice: (a: number, b: number) => ({
      arrayBuffer: async () => {
        const n = b - a;
        max = Math.max(max, n);
        total += n;
        expect(n).toBeLessThanOrEqual(2048);
        const bytes = new Uint8Array(n);
        for (const p of image.parts) {
          const lo = Math.max(a, p.offset),
            hi = Math.min(b, p.offset + p.bytes.length);
          if (hi > lo)
            bytes.set(p.bytes.slice(lo - p.offset, hi - p.offset), lo - a);
        }
        return bytes.buffer;
      },
    }),
  } as Blob;
  const result = await indexIso(file);
  expect(result.entries.find((e) => e.path.endsWith("BIG.RAW"))!.size).toBe(
    size,
  );
  expect(max).toBe(2048);
  expect(total).toBeLessThan(20000);
});
it.skipIf(!process.env.ED4_LOCAL_ISO)(
  "read-only actual ISO uses the production parser and compares all song headers",
  async () => {
    const path = process.env.ED4_LOCAL_ISO!,
      f = await open(path, "r"),
      size = (await stat(path)).size;
    let readBytes = 0,
      maxRead = 0;
    const blob = (start = 0, end = size): Blob =>
      ({
        size: end - start,
        slice: (a = 0, b = end - start) =>
          blob(start + a, Math.min(end, start + b)),
        arrayBuffer: async () => {
          const b = Buffer.alloc(end - start);
          const r = await f.read(b, 0, b.length, start);
          readBytes += r.bytesRead;
          maxRead = Math.max(maxRead, b.length);
          return b.buffer.slice(b.byteOffset, b.byteOffset + r.bytesRead);
        },
      }) as Blob;
    try {
      const r = await isoMusicSources(blob());
      expect(r.inputs.length).toBeGreaterThan(0);
      expect(r.warnings).toEqual([]);
      expect(maxRead).toBeLessThanOrEqual(2048);
      await writeFile(
        "artifacts/phase9-8n/actual-parser.json",
        JSON.stringify(
          {
            size,
            readBytes,
            maxRead,
            raw: r.inputs.map((e) => ({ path: e.path, size: e.file.size })),
            entries: r.index.entries,
          },
          null,
          2,
        ),
      );
    } finally {
      await f.close();
    }
  },
);
