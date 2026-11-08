import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Sha256 } from "../src/sha-stream";
import { pcm16, rawInfo } from "../src/raw-audio";
import { inspectGame } from "../src/file-analysis";
import { mountPaths, musicMounts, musicDB } from "../src/music";
import { checkIdentity, identity } from "../src/integrity";
import { zipEntries } from "../src/zip-index";
import { zipSync } from "fflate";
import { exportBackup, recoverProfile } from "../src/backup";
import { DEFAULT_SETTINGS, type Profile } from "../src/model";
import "fake-indexeddb/auto";
const p: Profile = {
  id: "profile",
  baseId: "base",
  gameId: "ed4",
  engineId: "js-dos-v7",
  kind: "vanilla",
  patchIds: [],
  name: "test",
  executable: "TEST.COM",
  createdAt: 1,
  settings: DEFAULT_SETTINGS,
};
describe("incremental SHA-256", () => {
  for (const length of [0, 3, 55, 56, 63, 64, 65, 1000000])
    it("matches independent node hash at " + length, () => {
      const bytes = Uint8Array.from({ length }, (_, i) => i % 251),
        h = new Sha256();
      for (let at = 0; at < length; at += 37)
        h.update(bytes.subarray(at, at + 37));
      expect(h.hex()).toBe(createHash("sha256").update(bytes).digest("hex"));
    });
});
it("PCM signed little endian stereo uses independent channels", () => {
  const data = new Uint8Array([0, 128, 255, 127, 0, 0, 0, 64]),
    [l, r] = pcm16(data);
  expect([...l]).toEqual([-1, 0]);
  expect([...r]).toEqual([32767 / 32768, 0.5]);
});
it("RAW header is reported without inventing its meaning", () => {
  expect(rawInfo(88208, new Uint8Array(8)).seconds).toBe(1);
  expect(rawInfo(88208, new Uint8Array(8)).assumption).toContain("unverified");
});
it("rejects malformed PCM and RAW lengths", () => {
  expect(() => pcm16(new Uint8Array(3))).toThrow();
  expect(() => rawInfo(11, new Uint8Array(8))).toThrow();
  expect(() => rawInfo(13, new Uint8Array(8))).toThrow();
});
it("BAT references and driver names are only static candidates", () => {
  const e = new TextEncoder();
  const result = inspectGame({
    "GAME.BAT": e.encode("DRIVER.EXE\r\nMISSING.COM\r\nGAME.EXE"),
    "DRIVER.EXE": new Uint8Array(),
    "GAME.EXE": new Uint8Array(),
  });
  expect(result.drivers).toEqual(["DRIVER.EXE"]);
  expect(result.missingCandidates).toEqual([
    { batch: "GAME.BAT", reference: "MISSING.COM" },
  ]);
});
it("identifies PE rather than calling it a DOS executable", () => {
  const exe = new Uint8Array(100);
  exe.set([77, 90]);
  exe[60] = 80;
  exe.set([80, 69], 80);
  expect(inspectGame({ "EXPAND.EXE": exe }).windowsExecutables).toEqual([
    "EXPAND.EXE",
  ]);
});
it("music paths cannot escape DOS root", () => {
  expect(() =>
    mountPaths(
      { id: "a", name: "a", bytes: 0, createdAt: 0, tracks: [] },
      "../",
    ),
  ).toThrow();
});
it("music mapping preserves explicit prefix and underscore filename", () => {
  expect(
    mountPaths(
      {
        id: "a",
        name: "a",
        bytes: 12,
        createdAt: 0,
        tracks: [
          {
            path: "_ED4-01.RAW",
            key: "0.bin",
            size: 12,
            sha256: "",
            header: "",
          },
        ],
      },
      "ed4",
    )[0].path,
  ).toBe("ED4/_ED4-01.RAW");
});
it("body-only profile needs no OPFS capability", async () => {
  expect(await musicMounts(p, {})).toEqual([]);
});
it("missing pack blocks rather than mixes a different music source", async () => {
  await expect(
    musicMounts({ ...p, music: { packId: "missing", prefix: "" } }, {}),
  ).rejects.toThrow("음악 데이터가 없습니다");
});
it("music collision with saved content is rejected before file access", async () => {
  await (
    await musicDB()
  ).put("packs", {
    id: "collision",
    tracks: [{ path: "ED4-01.RAW", key: "0.bin", size: 12 }],
  });
  await expect(
    musicMounts(
      { ...p, music: { packId: "collision", prefix: "" } },
      { "ED4-01.RAW": new Uint8Array(12) },
    ),
  ).rejects.toThrow("충돌");
});
it("v2 backup preserves music references without copying music payload", () => {
  const profile = { ...p, music: { packId: "music-id", prefix: "ED4" } };
  const zip = exportBackup(profile, {
    profileId: p.id,
    files: { "TEST.SAV": new Uint8Array([7]) },
    updatedAt: 1,
  });
  const recovered = recoverProfile(zip);
  expect(recovered.profile.music).toEqual(profile.music);
  expect(zip.length).toBeLessThan(2000);
});
it("folder fingerprint remains enforced even when version alias is reused", () => {
  const a = {
    id: "base",
    name: "folder",
    files: {},
    size: 0,
    createdAt: 0,
    versionId: "custom",
    manifestSha256: "a".repeat(64),
  };
  expect(() =>
    checkIdentity(identity(a), { ...a, manifestSha256: "b".repeat(64) }),
  ).toThrow("폴더");
});
it("folder identity survives v2 profile recovery", () => {
  const profile = {
    ...p,
    archiveIdentities: {
      base: {
        versionId: "folder:" + "a".repeat(64),
        manifestSha256: "a".repeat(64),
      },
    },
  };
  expect(
    recoverProfile(
      exportBackup(profile, { profileId: p.id, files: {}, updatedAt: 1 }),
    ).profile.archiveIdentities,
  ).toEqual(profile.archiveIdentities);
});
it("indexes compressed RAW without allocating expanded payload", async () => {
  const zip = zipSync(
    { "ED4-01.RAW": new Uint8Array(8 * 1024 * 1024 + 8) },
    { level: 6 },
  );
  const entries = await zipEntries(new Blob([zip as Uint8Array<ArrayBuffer>]));
  expect(entries[0].size).toBe(8 * 1024 * 1024 + 8);
  expect(entries[0].compressed).toBeLessThan(20000);
});
