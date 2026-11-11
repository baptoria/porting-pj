import "fake-indexeddb/auto";
import { IDBObjectStore, IDBFactory } from "fake-indexeddb";
import { it, expect, beforeEach, vi } from "vitest";
import {
  database,
  putProfile,
  putSave,
  getSave,
  deleteArchive,
} from "../src/storage";
import { musicDB, storeMusic } from "../src/music";
import {
  previewRemoval,
  removeProfileData,
  restoreRetired,
  cleanupMusic,
  deleteUnusedMusic,
  renameProfile,
} from "../src/profile-management";
import { DEFAULT_SETTINGS, type Profile, type Archive } from "../src/model";
import { APP_STORAGE } from "../src/app-storage";
const p = (id: string, baseId = id, musicId = id): Profile => ({
  id,
  name: id,
  gameId: "ed4",
  engineId: "js-dos-v7",
  kind: "vanilla",
  baseId,
  patchIds: [],
  executable: "GAME.BAT",
  settings: DEFAULT_SETTINGS,
  createdAt: 1,
  music: { packId: musicId, prefix: "" },
});
const a = (id: string): Archive => ({
  id,
  name: id,
  files: { "GAME.BAT": new Uint8Array([1]) },
  size: 1,
  createdAt: 1,
  musicPackId: id,
});
const removed: string[] = [];
let fail = false;
beforeEach(async () => {
  vi.restoreAllMocks();
  removed.length = 0;
  fail = false;
  const db = await database();
  for (const store of db.objectStoreNames) await db.clear(store);
  await (await musicDB()).clear("packs");
  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({
          removeEntry: async (id: string) => {
            if (fail)
              throw new DOMException("busy", "NoModificationAllowedError");
            removed.push(id);
          },
        }),
      }),
    },
  });
  for (const id of ["base", "own"])
    await storeMusic({ id, name: id, tracks: [], bytes: 10, createdAt: 1 });
  await putProfile(p("A", "base", "base"), [a("base")]);
  await putProfile(
    { ...p("B", "base", "base"), kind: "patch", patchIds: ["patch"] },
    [a("patch")],
  );
  await putProfile(p("C", "own", "own"), [a("own")]);
  for (const id of ["A", "B", "C"])
    await putSave({
      profileId: id,
      profile: p(id),
      files: { "SAVE/A.DAT": new Uint8Array([2]) },
      tombstones: ["SAVE/OLD"],
      updatedAt: 2,
    });
});
it("A keeps exact saves/tombstones and data, restores same ID; rename does not touch saves", async () => {
  const before = await getSave("A");
  await renameProfile("A", "changed");
  expect(await getSave("A")).toEqual(before);
  await removeProfileData(await previewRemoval("A", "profile"));
  const db = await database();
  expect(await db.get("profiles", "A")).toBeUndefined();
  expect(await db.get("archives", "base")).toBeDefined();
  expect(await getSave("A")).toEqual(before);
  expect(removed).toEqual([]);
  await restoreRetired("A");
  expect((await db.get("profiles", "A"))?.name).toBe("changed");
  expect(await getSave("A")).toEqual(before);
});
it("B protects shared base/overlay/music and C; C removes dedicated data plus recovery only", async () => {
  const db = await database(),
    before = await getSave("B");
  const plan = await previewRemoval("A", "unused");
  expect(plan.archiveIds).toEqual([]);
  expect(plan.musicIds).toEqual([]);
  await removeProfileData(plan);
  expect(await getSave("A")).toBeDefined();
  expect(await db.get("archives", "base")).toBeDefined();
  await db.put("recovery", {
    id: "point",
    profileId: "C",
    sessionId: "x",
    createdAt: 1,
    kind: "before-restore",
    candidatePaths: [],
    save: (await getSave("C"))!,
    note: "",
  });
  await removeProfileData(await previewRemoval("C", "all"));
  expect(await db.get("archives", "own")).toBeUndefined();
  expect(await getSave("C")).toBeUndefined();
  expect(await db.get("recovery", "point")).toBeUndefined();
  expect(await getSave("B")).toEqual(before);
  expect(removed).toEqual(["own"]);
});
it("music-only and archive storage tools use same reference protection, including detached archive links", async () => {
  await expect(deleteUnusedMusic("base")).rejects.toThrow();
  await expect(deleteArchive("base")).rejects.toThrow();
  await removeProfileData(await previewRemoval("C", "profile"));
  await expect(deleteUnusedMusic("own")).rejects.toThrow();
  await expect(deleteArchive("own")).rejects.toThrow();
});
it("OPFS failure leaves retry journal and save; retries after restart without touching shared data", async () => {
  fail = true;
  expect(await removeProfileData(await previewRemoval("C", "unused"))).toEqual([
    "own",
  ]);
  expect(await getSave("C")).toBeDefined();
  expect((await (await database()).getAll("cleanup")).length).toBe(1);
  fail = false;
  expect(await cleanupMusic()).toEqual([]);
  expect(removed).toEqual(["own"]);
  expect(await getSave("B")).toBeDefined();
  await restoreRetired("C");
  expect(await getSave("C")).toBeDefined(); // metadata restored, archive explicitly missing
});
it("IDB delete failure aborts whole removal and never starts OPFS cleanup", async () => {
  const db = await database(),
    plan = await previewRemoval("C", "all");
  const original = IDBObjectStore.prototype.delete;
  vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
    this: IDBObjectStore,
    key: IDBValidKey | IDBKeyRange,
  ) {
    if (this.name === "archives")
      throw new DOMException("injected", "UnknownError");
    return original.call(this, key);
  });
  await expect(removeProfileData(plan)).rejects.toThrow("injected");
  expect(await db.get("profiles", "C")).toBeDefined();
  expect(await getSave("C")).toBeDefined();
  expect(await db.get("archives", "own")).toBeDefined();
  expect(removed).toEqual([]);
});
it("stale preview refuses expanded deletion; new references protect pending music", async () => {
  const db = await database(),
    plan = await previewRemoval("C", "all");
  await putProfile(p("D", "own", "own"));
  await expect(removeProfileData(plan)).rejects.toThrow("공유 관계");
  expect(await getSave("C")).toBeDefined();
  await db.put("cleanup", { id: "own", createdAt: 1 });
  expect(await cleanupMusic()).toEqual([]);
  expect(removed).toEqual([]);
});
it("overlay and sourceArchiveId references protect original data even when not base or patch", async () => {
  const b = p("B", "base", "base");
  b.music!.overlays = [
    { packId: "own", prefix: "MOD", sourceArchiveId: "own" },
  ];
  await putProfile(b);
  const plan = await previewRemoval("C", "all");
  expect(plan.archiveIds).toEqual([]);
  expect(plan.musicIds).toEqual([]);
  await removeProfileData(plan);
  expect(await (await database()).get("archives", "own")).toBeDefined();
  expect(removed).toEqual([]);
});
it("v3 upgrade adds management stores without rewriting current saves, profiles or recovery", async () => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  const old = await new Promise<IDBDatabase>((resolve) => {
    const q = factory.open(APP_STORAGE.database, 3);
    q.onupgradeneeded = () => {
      for (const [name, key] of [
        ["archives", "id"],
        ["catalog", "id"],
        ["profiles", "id"],
        ["saves", "profileId"],
        ["recovery", "id"],
        ["recoveryPolicies", "profileId"],
      ]) {
        const s = q.result.createObjectStore(name, { keyPath: key });
        if (name === "recovery") s.createIndex("profileId", "profileId");
      }
    };
    q.onsuccess = () => resolve(q.result);
  });
  const profile = p("legacy"),
    save = {
      profileId: "legacy",
      files: { "SAVE/FILE": new Uint8Array([8, 9]) },
      tombstones: ["SAVE/OLD"],
      updatedAt: 1,
    };
  const tx = old.transaction(["profiles", "saves"], "readwrite");
  tx.objectStore("profiles").put(profile);
  tx.objectStore("saves").put(save);
  await new Promise<void>((r) => {
    tx.oncomplete = () => r();
  });
  old.close();
  const db = await database();
  expect(db.version).toBe(4);
  expect(await db.get("profiles", "legacy")).toEqual(profile);
  expect(await db.get("saves", "legacy")).toEqual(save);
  expect(await db.count("retiredProfiles")).toBe(0);
  expect(await db.count("cleanup")).toBe(0);
});
