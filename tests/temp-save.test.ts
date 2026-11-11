import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { DEFAULT_SETTINGS, type Profile, type Save } from "../src/model";
import {
  candidatePaths,
  effectiveFiles,
  recoveryPoint,
  restoredSave,
  TempSaveSession,
  policyPaths,
  attachTempObservation,
} from "../src/temp-save";
import {
  database,
  putSave,
  getSave,
  recoveryPoints,
  commitProtectedSave,
  applyRecovery,
} from "../src/storage";
import { reconcileSave, normalizeSave } from "../src/save-state";
import { saveConflictStatus } from "../src/compatibility";
import { exportBackup, importBackup } from "../src/backup";
const b = (s: string) => new TextEncoder().encode(s),
  temp = "SAVE/ED4_S99_.DAT";
const p: Profile = {
  id: "j",
  baseId: "base",
  patchIds: [],
  name: "public",
  gameId: "ed4",
  engineId: "js-dos-v7",
  kind: "vanilla",
  executable: "GAME.BAT",
  settings: { ...DEFAULT_SETTINGS },
  createdAt: 1,
};
const source = {
  "GAME.BAT": b("PUBLIC.COM"),
  [temp]: b("A"),
  "SAVE/ED4_98.CFG": b("config"),
  "ED4-01.RAW": b("unchanged"),
  "MOD.DAT": b("mod"),
};
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("backs up effective A before launch, consumes via unchanged tombstones, never revives A", async () => {
  const session = new TempSaveSession([temp], source),
    point = (await recoveryPoint(
      p,
      source,
      undefined,
      [temp],
      session.id,
      "before-consumption",
    ))!;
  await commitProtectedSave(p.id, undefined, undefined, point);
  const next = reconcileSave(
    p,
    undefined,
    { files: {}, presentPaths: Object.keys(source).filter((x) => x !== temp) },
    Object.keys(source),
  );
  session.observe(effectiveFiles(source, next));
  expect(session.missing).toEqual([temp]);
  await commitProtectedSave(p.id, undefined, next);
  expect((await getSave(p.id))!.tombstones).toContain(temp);
  expect(effectiveFiles(source, await getSave(p.id))[temp]).toBeUndefined();
  expect(
    await recoveryPoint(p, source, next, [temp], "next", "before-consumption"),
  ).toBeUndefined();
  expect((await recoveryPoints(p.id))[0].save.files[temp]).toEqual(b("A"));
  expect(Object.keys(point.save.files).sort()).toEqual(
    ["SAVE/ED4_98.CFG", temp].sort(),
  );
});
it("same snapshot on restart is immutable; B adds a point, consumption of B cannot revive A", async () => {
  const a = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "first",
    "before-consumption",
  ))!;
  await commitProtectedSave(p.id, undefined, undefined, a);
  await commitProtectedSave(p.id, undefined, undefined, {
    ...a,
    sessionId: "retry",
    createdAt: 999,
  });
  expect((await recoveryPoints(p.id))[0].sessionId).toBe("first");
  const next = normalizeSave({
    profileId: p.id,
    files: { [temp]: b("B") },
    updatedAt: 2,
  });
  const bp = (await recoveryPoint(
    p,
    source,
    next,
    [temp],
    "B",
    "file-checkpoint",
  ))!;
  await commitProtectedSave(p.id, undefined, next, bp);
  expect(await recoveryPoints(p.id)).toHaveLength(2);
  const consumed = reconcileSave(
    p,
    next,
    { files: {}, presentPaths: Object.keys(source).filter((x) => x !== temp) },
    Object.keys(source),
  );
  await commitProtectedSave(p.id, next, consumed);
  expect(effectiveFiles(source, await getSave(p.id))[temp]).toBeUndefined();
  expect(source[temp]).toEqual(b("A"));
});
it("explicit restore backs up exact current changes; resource/mod changes are preserved; rollback is possible", async () => {
  const cp = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  await commitProtectedSave(p.id, undefined, undefined, cp);
  const current = normalizeSave({
    profileId: p.id,
    files: { "SAVE/NEW.DAT": b("new") },
    resources: { "MOD.DAT": b("user mod") },
    tombstones: [temp],
    updatedAt: 9,
  });
  await putSave(current);
  const restored = restoredSave(p, current, source, cp);
  await applyRecovery(p, current, restored, cp.id);
  expect((await getSave(p.id))!.files[temp]).toEqual(b("A"));
  expect((await getSave(p.id))!.resources!["MOD.DAT"]).toEqual(b("user mod"));
  expect((await getSave(p.id))!.tombstones).toContain("SAVE/NEW.DAT");
  const rollback = (await recoveryPoints(p.id)).find(
    (x) => x.kind === "before-restore",
  )!;
  expect(rollback.save).toEqual(current);
  await applyRecovery(
    p,
    await getSave(p.id),
    restoredSave(p, await getSave(p.id), source, rollback),
    rollback.id,
  );
  expect((await getSave(p.id))!.tombstones).toContain(temp);
});
it("save-write failure rolls back the new recovery point and preserves previous point/save", async () => {
  const a = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  await commitProtectedSave(p.id, undefined, undefined, a);
  const current = normalizeSave({
    profileId: p.id,
    files: { [temp]: b("A") },
    updatedAt: 1,
  });
  await putSave(current);
  const next = { ...current, files: { [temp]: b("B") }, updatedAt: 2 };
  const bp = (await recoveryPoint(
    p,
    source,
    next,
    [temp],
    "b",
    "file-checkpoint",
  ))!;
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: any[]
  ) {
    if (this.name === "saves")
      throw new DOMException("test failure", "QuotaExceededError");
    return original.apply(this, args as any);
  });
  await expect(commitProtectedSave(p.id, current, next, bp)).rejects.toThrow(
    "test failure",
  );
  expect(await getSave(p.id)).toEqual(current);
  expect((await recoveryPoints(p.id)).map((x) => x.id)).toEqual([a.id]);
});
it("quota failure before start preserves existing data and prevents unprotected consumption", async () => {
  const point = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  vi.stubGlobal("navigator", {
    storage: { estimate: async () => ({ usage: 10, quota: 10 }) },
  });
  await expect(
    commitProtectedSave(p.id, undefined, undefined, point),
  ).rejects.toHaveProperty("name", "QuotaExceededError");
  expect(await recoveryPoints(p.id)).toHaveLength(0);
  expect(await getSave(p.id)).toBeUndefined();
});
it("rejects stale saves and cross-profile recovery", async () => {
  const old = normalizeSave({ profileId: p.id, files: {}, updatedAt: 1 });
  await putSave({ ...old, updatedAt: 2 });
  await expect(
    commitProtectedSave(p.id, old, { ...old, updatedAt: 3 }),
  ).rejects.toThrow("다른 탭");
  const cp = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  expect(() =>
    restoredSave({ ...p, id: "other" }, undefined, source, cp),
  ).toThrow("다른 프로필");
});
it("migration from v2 adds stores without rewriting any old stores or legacy save bytes", async () => {
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open("ed4-mobile-v1", 2);
    q.onupgradeneeded = () => {
      for (const [n, k] of [
        ["archives", "id"],
        ["catalog", "id"],
        ["profiles", "id"],
        ["saves", "profileId"],
      ])
        q.result.createObjectStore(n, { keyPath: k });
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  const legacy: Save = {
    profileId: p.id,
    files: { [temp]: b("legacy") },
    updatedAt: 1,
    tombstones: ["SAVE/OLD.DAT"],
  };
  await new Promise<void>((resolve, reject) => {
    const tx = old.transaction(["saves", "profiles"], "readwrite");
    tx.objectStore("saves").put(legacy);
    tx.objectStore("profiles").put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  const db = await database();
  expect(db.version).toBe(4);
  expect(await db.get("saves", p.id)).toEqual(legacy);
  expect(await db.get("profiles", p.id)).toEqual(p);
  expect(await db.count("recovery")).toBe(0);
});
it("does not hide candidate deletion solely by filename; observed absence plus backup is informational, mods remain warnings", async () => {
  const save = normalizeSave({
    profileId: p.id,
    files: { "SAVE/ED4_98.CFG": b("new") },
    tombstones: [temp],
    updatedAt: 1,
  });
  const a = { id: "base", name: "base", files: source, size: 1, createdAt: 1 };
  expect(
    saveConflictStatus(p, [a], save, []).find((x) => x.path === temp)!.warning,
  ).toBe(true);
  expect(
    saveConflictStatus(p, [a], save, []).find((x) => x.path.endsWith(".CFG"))!
      .warning,
  ).toBe(false);
  const cp = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  save.tempSaveObservation = { sessionId: "a", absentAfterPresent: [temp] };
  expect(
    saveConflictStatus(p, [a], save, [cp]).find((x) => x.path === temp)!
      .warning,
  ).toBe(false);
  expect(
    saveConflictStatus(
      { ...p, patchIds: ["mod"] },
      [a, { ...a, id: "mod" }],
      save,
      [cp],
    ).find((x) => x.path === temp)!.warning,
  ).toBe(true);
});
it("custom candidate paths, nested GAME roots and candidate creation after boot work without game hash enforcement", () => {
  expect(policyPaths("custom/temp.dat")).toEqual(["CUSTOM/TEMP.DAT"]);
  expect(() => policyPaths("MUSIC.RAW")).toThrow();
  expect(candidatePaths({ "ED4/GAME.BAT": b("mod") }, undefined)).toContain(
    "ED4/SAVE/ED4_S99_.DAT",
  );
  const session = new TempSaveSession([temp], {});
  session.observe({ [temp]: b("new") });
  session.observe({});
  expect(session.missing).toEqual([temp]);
});
it("recovery ZIP uses existing backup format and preserves deletion semantics", async () => {
  const cp = (await recoveryPoint(
    p,
    source,
    undefined,
    [temp],
    "a",
    "before-consumption",
  ))!;
  const imported = importBackup(exportBackup(p, cp.save), p);
  expect(imported.files).toEqual(cp.save.files);
  expect(imported.resources).toEqual({});
});
it("retains nested SAVE siblings coherently without including RAW or adjacent game resources", async () => {
  const source = {
    "ED4/GAME.BAT": b("TEMP.COM"),
    "ED4/SAVE/ED4_S99_.DAT": b("A"),
    "ED4/SAVE/ED4_98.CFG": b("config"),
    "ED4/SAVE/MUSIC.RAW": b("raw"),
    "ED4/DATA.DAT": b("mod"),
  };
  const paths = candidatePaths(source, undefined),
    cp = (await recoveryPoint(
      p,
      source,
      undefined,
      paths,
      "nested",
      "before-consumption",
    ))!;
  expect(Object.keys(cp.save.files).sort()).toEqual([
    "ED4/SAVE/ED4_98.CFG",
    "ED4/SAVE/ED4_S99_.DAT",
  ]);
  const current = normalizeSave({
    profileId: p.id,
    files: {},
    resources: { "ED4/SAVE/ED4_98.CFG": b("later"), "ED4/DATA.DAT": b("user") },
    resourceTombstones: ["ED4/SAVE/ED4_S99_.DAT"],
    updatedAt: 2,
  });
  const restored = restoredSave(p, current, source, cp);
  expect(restored.files["ED4/SAVE/ED4_98.CFG"]).toEqual(b("config"));
  expect(restored.resources!["ED4/DATA.DAT"]).toEqual(b("user"));
  expect(restored.resourceTombstones).not.toContain("ED4/SAVE/ED4_S99_.DAT");
});
it("retains previous observed absence across restarts, clears it on reappearance, and records content change without bytes", () => {
  const first = new TempSaveSession([temp], { [temp]: b("A") });
  first.observe({ [temp]: b("B") });
  first.observe({});
  expect(first.events.map((e) => e.state)).toEqual([
    "present",
    "content-changed",
    "absent-after-present",
  ]);
  const consumed = normalizeSave({
    profileId: p.id,
    files: {},
    tombstones: [temp],
    updatedAt: 1,
  });
  attachTempObservation(consumed, undefined, first);
  const restarted = new TempSaveSession([temp], {}),
    next = { ...consumed, updatedAt: 2 };
  attachTempObservation(next, consumed, restarted);
  expect(next.tempSaveObservation!.absentAfterPresent).toEqual([temp]);
  const recreated = normalizeSave({
    profileId: p.id,
    files: { [temp]: b("C") },
    updatedAt: 3,
  });
  attachTempObservation(recreated, next, restarted);
  expect(recreated.tempSaveObservation!.absentAfterPresent).toEqual([]);
  expect(JSON.stringify(first.report())).not.toContain("TEMP_A");
});
