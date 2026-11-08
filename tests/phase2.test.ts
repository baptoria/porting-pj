import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  strToU8 as text,
  strFromU8 as decode,
  zipSync,
  unzipSync,
} from "fflate";
import {
  DEFAULT_SETTINGS,
  type Profile,
  type Archive,
  type Save,
} from "../src/model";
import {
  normalizeSave,
  reconcileSave,
  deletedFiles,
  overlayFiles,
} from "../src/save-state";
import { createRuntime, analyzeFiles } from "../src/archive";
import {
  sha256,
  identity,
  checkIdentity,
  checkRequirements,
  migrateProfile,
} from "../src/integrity";
import { conflicts, orderImpact } from "../src/compatibility";
import { exportBackup, importBackup, recoverProfile } from "../src/backup";
import {
  database,
  putProfile,
  putSave,
  getSave,
  getArchive,
  reconnectArchive,
  listCatalog,
  ensureSpace,
  storageError,
} from "../src/storage";
const p: Profile = {
  id: "p2",
  gameId: "ed4",
  engineId: "js-dos-v7",
  name: "test",
  kind: "vanilla",
  baseId: "base2",
  patchIds: [],
  executable: "TEST.COM",
  settings: { ...DEFAULT_SETTINGS },
  createdAt: 0,
};
const a: Archive = {
  id: "base2",
  name: "base.zip",
  files: {
    "TEST.COM": new Uint8Array([0xc3]),
    "RESOURCE.DAT": text("original"),
    "OLD.SAV": text("initial"),
  },
  size: 16,
  createdAt: 0,
};
const paths = Object.keys(a.files);
const saved: Save = {
  profileId: p.id,
  files: { "TEST.SAV": text("saved") },
  updatedAt: 0,
  profile: p,
};
describe("Phase 2 deletion and partition integrity", () => {
  it("applies deletion before a file is replaced by a directory", () => {
    const source = { ...a, files: { ...a.files, SLOT: text("old file") } };
    const result = unzipSync(
      createRuntime(p, [source], {
        ...saved,
        files: { "SLOT/ONE.SAV": text("new") },
        resourceTombstones: ["SLOT"],
      }),
    );
    expect(result["SLOT"]).toBeUndefined();
    expect(decode(result["SLOT/ONE.SAV"])).toBe("new");
    expect(source.files["SLOT"]).toEqual(text("old file"));
  });
  it("migrates v1 without losing bytes", () => {
    const result = normalizeSave(saved);
    expect(result.files).toEqual(saved.files);
    expect(result.tombstones).toEqual([]);
    expect(result.resources).toEqual({});
  });
  it("detects a deletion from a full manifest, not an empty delta", () => {
    expect(
      reconcileSave(
        p,
        saved,
        { files: {}, presentPaths: [...paths, "TEST.SAV"] },
        paths,
      ).files["TEST.SAV"],
    ).toBeDefined();
    const result = reconcileSave(
      p,
      saved,
      { files: {}, presentPaths: paths },
      paths,
    );
    expect(result.tombstones).toEqual(["TEST.SAV"]);
    expect(result.files["TEST.SAV"]).toBeUndefined();
  });
  it("keeps deletions over multiple sessions", () => {
    let result = reconcileSave(
      p,
      saved,
      { files: {}, presentPaths: paths },
      paths,
    );
    for (let i = 0; i < 3; i++)
      result = reconcileSave(
        p,
        result,
        { files: {}, presentPaths: paths },
        paths,
      );
    expect(result.tombstones).toEqual(["TEST.SAV"]);
  });
  it("recreating a file clears its tombstone", () => {
    const prior = { ...saved, files: {}, tombstones: ["TEST.SAV"] };
    const result = reconcileSave(
      p,
      prior,
      {
        files: { "TEST.SAV": text("new") },
        presentPaths: [...paths, "TEST.SAV"],
      },
      paths,
    );
    expect(result.tombstones).toEqual([]);
    expect(decode(result.files["TEST.SAV"])).toBe("new");
  });
  it("separates resource modifications from saves, including original SAV files", () => {
    const result = reconcileSave(
      p,
      saved,
      {
        files: { "RESOURCE.DAT": text("changed"), "OLD.SAV": text("progress") },
        presentPaths: [...paths, "TEST.SAV"],
      },
      paths,
    );
    expect(result.resources!["RESOURCE.DAT"]).toEqual(text("changed"));
    expect(result.files["RESOURCE.DAT"]).toBeUndefined();
    expect(result.files["OLD.SAV"]).toEqual(text("progress"));
    expect(a.files["RESOURCE.DAT"]).toEqual(text("original"));
  });
  it("removes original/patch files only in the runtime view", () => {
    const mod = {
      ...a,
      id: "mod2",
      name: "mod",
      files: { "MOD.DAT": text("mod") },
    };
    const profile = { ...p, patchIds: ["mod2"] };
    const result = reconcileSave(
      profile,
      undefined,
      { files: {}, presentPaths: ["TEST.COM"] },
      [...paths, "MOD.DAT"],
    );
    expect(result.resourceTombstones).toContain("MOD.DAT");
    expect(result.tombstones).toContain("OLD.SAV");
    const runtime = unzipSync(createRuntime(profile, [a, mod], result));
    expect(runtime["MOD.DAT"]).toBeUndefined();
    expect(runtime["RESOURCE.DAT"]).toBeUndefined();
    expect(a.files["RESOURCE.DAT"]).toEqual(text("original"));
    expect(mod.files["MOD.DAT"]).toEqual(text("mod"));
  });
  it("keeps vanilla and mod snapshots independent", () => {
    const mod = { ...p, id: "modprofile", kind: "patch" as const };
    const deleted = reconcileSave(
      mod,
      { ...saved, profileId: mod.id },
      { files: {}, presentPaths: paths },
      paths,
    );
    expect(saved.files["TEST.SAV"]).toBeDefined();
    expect(deleted.tombstones).toContain("TEST.SAV");
  });
  it.each(["../TEST.SAV", ".jsdos/dosbox.conf", "C:/TEST.SAV"])(
    "rejects unsafe tombstone %s",
    (path) =>
      expect(() => normalizeSave({ ...saved, tombstones: [path] })).toThrow(),
  );
  it("rejects a file and tombstone in the same backup", () =>
    expect(() => normalizeSave({ ...saved, tombstones: ["TEST.SAV"] })).toThrow(
      "충돌",
    ));
  it("round trips v2 tombstones and resource namespace", () => {
    const save = normalizeSave({
      ...saved,
      resources: { "RESOURCE.DAT": text("edit") },
      tombstones: ["OLD.SAV"],
      resourceTombstones: ["GONE.DAT"],
    });
    const zip = exportBackup(p, save),
      contents = unzipSync(zip);
    expect(contents["RESOURCES/RESOURCE.DAT"]).toBeDefined();
    const round = importBackup(zip, p);
    expect(deletedFiles(round)).toEqual(["OLD.SAV", "GONE.DAT"]);
    expect(overlayFiles(round)).toEqual(overlayFiles(save));
  });
  it("imports an authentic v1-format backup", () => {
    const zip = zipSync({
      "ED4-BACKUP.JSON": text(
        JSON.stringify({
          format: "ed4-save",
          version: 1,
          gameId: "ed4",
          profileId: p.id,
          profile: p,
        }),
      ),
      "FILES/TEST.SAV": text("legacy"),
    });
    const result = recoverProfile(zip);
    expect(decode(result.save.files["TEST.SAV"])).toBe("legacy");
    expect(result.save.schemaVersion).toBe(2);
    expect(result.save.tombstones).toEqual([]);
  });
});
describe("Phase 2 origin and mod compatibility", () => {
  it("computes standard SHA-256 for exact ZIP bytes", async () => {
    expect(await sha256(text("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const z1 = zipSync(a.files, { level: 0 }),
      z2 = zipSync(a.files, { level: 6 });
    expect(await sha256(z1)).not.toBe(await sha256(z2));
  });
  it("marks legacy identities unverified instead of fabricating hashes", () => {
    const migrated = migrateProfile(p, [a]);
    expect(migrated.archiveIdentities![a.id]).toEqual({
      versionId: "legacy:base2",
      sha256: undefined,
    });
    expect(checkIdentity(migrated.archiveIdentities![a.id], a)).toBe(
      "unverified",
    );
  });
  it("rejects a different ZIP while retaining pinned identity", () => {
    expect(() =>
      checkIdentity(
        { versionId: "v1", sha256: "a".repeat(64) },
        { ...a, sha256: "b".repeat(64) },
      ),
    ).toThrow("해시 불일치");
  });
  it("enforces required game version", () => {
    expect(() =>
      checkRequirements({ ...p, requiredBaseVersion: "release-2" }, [
        { ...a, versionId: "release-1" },
      ]),
    ).toThrow("요구 원본 버전 불일치");
  });
  it("shows layer collisions, winner, and save shadowing", () => {
    const mod = {
      ...a,
      id: "mod2",
      name: "patch.zip",
      files: { "RESOURCE.DAT": text("mod") },
    };
    const result = conflicts({ ...p, patchIds: ["mod2"] }, [a, mod], {
      ...saved,
      resources: { "RESOURCE.DAT": text("save") },
    });
    expect(result).toContainEqual({
      path: "RESOURCE.DAT",
      layers: ["base.zip", "patch.zip"],
      winner: "저장 변경분",
      saveOverride: true,
      deleted: false,
    });
  });
  it("detects tombstones hiding new mod files", () => {
    const result = conflicts(p, [a], {
      ...saved,
      resourceTombstones: ["RESOURCE.DAT"],
    });
    expect(result.find((c) => c.path === "RESOURCE.DAT")?.winner).toBe(
      "저장 삭제 표시",
    );
  });
  it("computes content impact when layer order changes", () => {
    const m1 = { ...a, id: "m1", files: { "RESOURCE.DAT": text("one") } },
      m2 = { ...a, id: "m2", files: { "RESOURCE.DAT": text("two") } };
    expect(
      orderImpact(
        { ...p, patchIds: ["m1", "m2"] },
        { ...p, patchIds: ["m2", "m1"] },
        [a, m1, m2],
      ),
    ).toEqual(["RESOURCE.DAT"]);
    expect(decode(a.files["RESOURCE.DAT"])).toBe("original");
  });
  it("analyses BAT, roots and unsupported DOS 8.3 paths", () => {
    const report = analyzeFiles({
      "ED4/START.BAT": text("TEST.COM"),
      "ED4/TEST.COM": text("x"),
      "LONGFOLDER/RESOURCE.DAT": text("x"),
    });
    expect(report.batFiles).toEqual(["ED4/START.BAT"]);
    expect(report.longPaths).toEqual(["LONGFOLDER/RESOURCE.DAT"]);
    expect(report.roots).toEqual(["ED4", "LONGFOLDER"]);
  });
  it("preserves pinned hashes and requirements in recovery backups", () => {
    const profile = {
      ...p,
      archiveIdentities: {
        [a.id]: { sha256: "a".repeat(64), versionId: "r1" },
      },
      requiredBaseVersion: "r1",
    };
    const recovered = recoverProfile(
      exportBackup(profile, { ...saved, profile }),
    );
    expect(recovered.profile.archiveIdentities).toEqual(
      profile.archiveIdentities,
    );
    expect(recovered.profile.requiredBaseVersion).toBe("r1");
  });
});
describe("Phase 2 transactional storage", () => {
  beforeEach(async () => {
    const db = await database();
    for (const name of ["archives", "profiles", "saves", "catalog"] as const)
      await db.clear(name);
  });
  it("catalog does not load archive file bodies", async () => {
    await putProfile(p, [a]);
    const result = await listCatalog();
    expect(result.archives[0].files).toEqual({});
    expect(result.archives[0].fileCount).toBe(3);
    expect((await getArchive(a.id)).files).toEqual(a.files);
  });
  it("rejects mismatched reconnection atomically", async () => {
    const pinned = { ...a, sha256: "a".repeat(64), versionId: "v1" };
    await putProfile(p, [pinned]);
    await expect(
      reconnectArchive({
        ...a,
        sha256: "b".repeat(64),
        files: { "EVIL.COM": text("x") },
      }),
    ).rejects.toThrow("해시 불일치");
    expect((await getArchive(a.id)).files).toEqual(a.files);
    expect(
      (await listCatalog()).profiles[0].archiveIdentities![a.id].sha256,
    ).toBe(pinned.sha256);
  });
  it("binds first verified legacy ZIP without altering saved bytes", async () => {
    await putProfile(p, [a]);
    await putSave(saved);
    await reconnectArchive({
      ...a,
      sha256: "c".repeat(64),
      versionId: "verified-v1",
    });
    expect(
      (await listCatalog()).profiles[0].archiveIdentities![a.id].sha256,
    ).toBe("c".repeat(64));
    expect((await getSave(p.id))!.files).toEqual(saved.files);
  });
  it("preflights a full quota with clear error and preserves existing data", async () => {
    await putProfile(p, [a]);
    await putSave(saved);
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ usage: 1000, quota: 1000 }) },
    });
    try {
      await expect(
        putSave({ ...saved, files: { "TEST.SAV": text("new") } }),
      ).rejects.toMatchObject({ name: "QuotaExceededError" });
      expect(
        storageError(new DOMException("full", "QuotaExceededError")),
      ).toContain("기존 데이터는 유지");
      expect((await getSave(p.id))!.files).toEqual(saved.files);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
