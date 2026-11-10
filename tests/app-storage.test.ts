import { it, expect } from "vitest";
import { storageNames } from "../src/app-storage";
it("keeps every public namespace unchanged and separates developer names", () => {
  const p = storageNames(false),
    d = storageNames(true);
  expect([p.database, p.musicDatabase, p.musicRoot, p.writerLock]).toEqual([
    "ed4-mobile-v1",
    "ed4-music-v1",
    "ed4-music",
    "ed4-mobile-writer",
  ]);
  for (const key of [
    "database",
    "musicDatabase",
    "musicRoot",
    "writerLock",
  ] as const)
    expect(d[key]).not.toBe(p[key]);
  for (const key of [
    "ed4-selected",
    "ed4-controls",
    "ed4-advanced",
    "ed4-play-ui-v1",
    "ed4-play-engine-v2",
    "ed4-import-trace-v1",
    "ed4-expected-build",
  ]) {
    expect(p.key(key)).toBe(key);
    expect(d.key(key)).toBe("ed4-dev:" + key);
  }
});
