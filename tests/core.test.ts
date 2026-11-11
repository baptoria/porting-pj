import { previewRemoval, removeProfileData } from '../src/profile-management';
import { describe, it, expect, beforeEach } from "vitest";
import { zipSync, strToU8, strFromU8, unzipSync } from "fflate";
import "fake-indexeddb/auto";
import { canonicalPath, readZip, compose, buildBundle } from "../src/archive";
import { exportBackup, importBackup, recoverProfile } from "../src/backup";
import {
  database,
  putProfile,
  putSave,
  getSave,
  deleteArchive,
  deleteProfile,
  deleteSave,
  listData,
} from "../src/storage";
import { DEFAULT_SETTINGS, type Profile, type Archive } from "../src/model";
const text = strToU8;
const p: Profile = {
  id: "p1",
  name: "test",
  gameId: "ed4",
  engineId: "js-dos-v7",
  kind: "vanilla",
  baseId: "base",
  patchIds: [],
  executable: "ED4.COM",
  settings: { ...DEFAULT_SETTINGS },
  createdAt: 0,
};
const a: Archive = {
  id: "base",
  name: "base.zip",
  files: { "ED4.COM": new Uint8Array([0xc3]), "DATA.DAT": text("base") },
  size: 5,
  createdAt: 0,
};
describe("ZIP validation", () => {
  it.each([
    "../ED4.EXE",
    "D:/ED4.EXE",
    "/ED4.EXE",
    "a/../../x",
    "a//x",
    "a/./x",
    "x\0.exe",
    "CON.txt",
    "x.",
    "한글.exe",
    ".jsdos/dosbox.conf",
  ])("rejects %s", (path) => expect(() => canonicalPath(path)).toThrow());
  it("normalizes Windows separators and DOS case", () =>
    expect(canonicalPath("ed4\\test.com")).toBe("ED4/TEST.COM"));
  it("rejects DOS case collisions", () =>
    expect(() =>
      readZip(zipSync({ "A.TXT": text("1"), "a.txt": text("2") })),
    ).toThrow("중복"));
  it("rejects file / directory collision", () =>
    expect(() =>
      readZip(zipSync({ DATA: text("1"), "DATA/A": text("2") })),
    ).toThrow("파일/폴더"));
  it("rejects invalid bytes", () =>
    expect(() => readZip(text("not zip"))).toThrow());
  it("accepts an empty engine diff but rejects an empty game ZIP", () => {
    const empty = zipSync({});
    expect(readZip(empty, true)).toEqual({});
    expect(() => readZip(empty)).toThrow("파일이 없습니다");
  });
  it("rejects zip bomb advertised size before inflate", () => {
    const zip = zipSync({ "HUGE.BIN": new Uint8Array(1) });
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 24; i++)
      if (view.getUint32(i, true) === 0x02014b50)
        view.setUint32(i + 24, 0x40000000, true);
    expect(() => readZip(zip)).toThrow("크기");
  });
  it("patches immutable originals and records conflicts", () => {
    const merged = compose(a.files, [{ "DATA.DAT": text("mod") }]);
    expect(merged.conflicts).toEqual(["DATA.DAT"]);
    expect(strFromU8(a.files["DATA.DAT"])).toBe("base");
    expect(strFromU8(merged.files["DATA.DAT"])).toBe("mod");
  });
  it("rejects collisions across layers", () =>
    expect(() => compose({ A: text("a") }, [{ "A/B": text("b") }])).toThrow());
  it("builds settings and overlay in correct order", () => {
    const mod = { ...a, id: "mod", files: { "DATA.DAT": text("mod") } };
    const bundle = unzipSync(
      buildBundle({ ...p, patchIds: ["mod"] }, [a, mod], {
        "DATA.DAT": text("saved"),
      }),
    );
    expect(strFromU8(bundle["DATA.DAT"])).toBe("saved");
    expect(strFromU8(bundle[".jsdos/dosbox.conf"])).toContain("mount c .");
  });
  it("rejects missing executables and unsafe command path", () => {
    expect(() => buildBundle({ ...p, executable: "NO.EXE" }, [a])).toThrow();
    expect(() =>
      buildBundle({ ...p, executable: "A&B.COM" }, [
        { ...a, files: { "A&B.COM": text("x") } },
      ]),
    ).toThrow("DOS 8.3");
  });
});
describe("save storage and backup", () => {
  beforeEach(async () => {
    const db = await database();
    for (const store of ["archives", "profiles", "saves", "catalog", "retiredProfiles", "cleanup"] as const)
      await db.clear(store);
  });
  it("isolates profiles and preserves originals", async () => {
    await putProfile(p, [a]);
    await putSave({
      profileId: "p1",
      files: { "SAVE.DAT": text("one") },
      updatedAt: 1,
    });
    await putSave({
      profileId: "p2",
      files: { "SAVE.DAT": text("two") },
      updatedAt: 2,
    });
    expect(strFromU8((await getSave("p1"))!.files["SAVE.DAT"])).toBe("one");
    expect(strFromU8((await getSave("p2"))!.files["SAVE.DAT"])).toBe("two");
    expect((await listData()).archives[0].files["SAVE.DAT"]).toBeUndefined();
  });
  it("deletes game/profile separately from saves", async () => {
    await putProfile(p, [a]);
    await putSave({
      profileId: p.id,
      files: { "SAVE.DAT": text("one") },
      updatedAt: 1,
    });
    await expect(deleteArchive(a.id)).rejects.toThrow();
    await removeProfileData(await previewRemoval(p.id,"unused"));
    expect(await getSave(p.id)).toBeDefined();
    await deleteSave(p.id);
    expect(await getSave(p.id)).toBeUndefined();
  });
  it("protects shared source data", async () => {
    await putProfile(p, [a]);
    await putProfile({ ...p, id: "p2" });
    await expect(deleteArchive(a.id)).rejects.toThrow("프로필");
  });
  it("round trips backups and rejects cross-profile import", () => {
    const original = {
      profileId: p.id,
      files: { "SAVE/SLOT1.DAT": text("progress") },
      updatedAt: 2,
    };
    const backup = exportBackup(p, original);
    expect(strFromU8(importBackup(backup, p).files["SAVE/SLOT1.DAT"])).toBe(
      "progress",
    );
    expect(() => importBackup(backup, { ...p, id: "other" })).toThrow(
      "다른 프로필",
    );
  });
  it("rejects injected emulator settings in backups", () => {
    const bad = zipSync({
      "ED4-BACKUP.JSON": text(
        JSON.stringify({
          format: "ed4-save",
          version: 1,
          gameId: "ed4",
          profileId: p.id,
        }),
      ),
      "FILES/.JSDOS/DOSBOX.CONF": text("evil"),
    });
    expect(() => importBackup(bad, p)).toThrow("경로");
  });
  it("recovers a profile on a fresh browser without including game data", () => {
    const original = {
      profileId: p.id,
      files: { "SAVE.DAT": text("progress") },
      updatedAt: 2,
      profile: p,
    };
    const backup = exportBackup(p, original);
    const recovered = recoverProfile(backup);
    expect(recovered.profile.id).toBe(p.id);
    expect(recovered.profile.baseId).toBe("base");
    expect(recovered.save.files["ED4.COM"]).toBeUndefined();
    expect(strFromU8(recovered.save.files["SAVE.DAT"])).toBe("progress");
  });
});
