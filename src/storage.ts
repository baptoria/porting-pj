import { openDB, type DBSchema } from "idb";
import type { Archive, Profile, Save } from "./model";
import { migrateProfile, identity, checkIdentity } from "./integrity";
import { normalizeSave } from "./save-state";
interface LauncherDB extends DBSchema {
  archives: { key: string; value: Archive };
  profiles: { key: string; value: Profile };
  saves: { key: string; value: Save };
  catalog: { key: string; value: Archive & { available: boolean } };
}
export const database = () =>
  openDB<LauncherDB>("ed4-mobile-v1", 2, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore("archives", { keyPath: "id" });
        db.createObjectStore("profiles", { keyPath: "id" });
        db.createObjectStore("saves", { keyPath: "profileId" });
      }
      if (oldVersion < 2) {
        const catalog = db.createObjectStore("catalog", { keyPath: "id" });
        void (async () => {
          let cursor = await tx.objectStore("archives").openCursor();
          while (cursor) {
            const a = cursor.value;
            await catalog.put({
              ...a,
              files: {},
              fileCount: Object.keys(a.files).length,
              versionId: identity(a).versionId,
              available: true,
            });
            cursor = await cursor.continue();
          }
        })().catch(() => tx.abort());
      }
    },
  });
export async function listCatalog() {
  const db = await database();
  const all = await db.getAll("catalog");
  return {
    archives: all.filter((a) => a.available),
    profiles: (await db.getAll("profiles")).map((p) => migrateProfile(p, all)),
  };
}
export async function getArchive(id: string) {
  const a = await (await database()).get("archives", id);
  if (!a) throw new Error("게임/수정 ZIP이 없습니다. 다시 연결하세요.");
  return a;
}
export async function getProfileArchives(p: Profile) {
  return Promise.all([p.baseId, ...p.patchIds].map(getArchive));
}
export async function reconnectArchive(a: Archive) {
  await ensureSpace(a.size);
  const db = await database();
  const tx = db.transaction(
    ["archives", "catalog", "profiles", "saves"],
    "readwrite",
  );
  try {
    const prior = await tx.objectStore("catalog").get(a.id);
    if (prior) checkIdentity(identity(prior), a);
    const profiles = await tx.objectStore("profiles").getAll();
    for (const p of profiles.filter(
      (p) => p.baseId === a.id || p.patchIds.includes(a.id),
    )) {
      const old = p.archiveIdentities?.[a.id];
      checkIdentity(old, a);
      if (checkIdentity(old,a)==='matched' && old) a.versionId = old.versionId;
      const next = {
        ...p,
        schemaVersion: 2 as const,
        archiveIdentities: { ...p.archiveIdentities, [a.id]: identity(a) },
      };
      if (next.music && a.musicPackId) {
        const reconnectMusic = (ref: NonNullable<Profile["music"]>) =>
          ref.sourceArchiveId === a.id || (prior?.musicPackId && ref.packId === prior.musicPackId)
            ? { ...ref, packId: a.musicPackId!, sourceArchiveId: a.id } : ref;
        next.music = { ...reconnectMusic(next.music),
          ...(next.music.overlays ? { overlays: next.music.overlays.map(reconnectMusic) } : {}) };
      }
      if (next.requiredBaseVersion === `legacy:${a.id}`)
        next.requiredBaseVersion = identity(a).versionId;
      await tx.objectStore("profiles").put(next);
      const save = await tx.objectStore("saves").get(p.id);
      if (save) await tx.objectStore("saves").put({ ...save, profile: next });
    }
    await tx.objectStore("archives").put(a);
    await tx.objectStore("catalog").put({
      ...a,
      files: {},
      fileCount: Object.keys(a.files).length,
      available: true,
    });
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function ensureSpace(bytes: number) {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
  const { usage = 0, quota } = await navigator.storage.estimate();
  if (quota !== undefined && usage + bytes * 1.2 > quota)
    throw new DOMException(
      "Insufficient browser storage",
      "QuotaExceededError",
    );
}
export async function listData() {
  const db = await database();
  return {
    archives: await db.getAll("archives"),
    profiles: await db.getAll("profiles"),
  };
}
export async function putProfile(profile: Profile, archives: Archive[] = [], signal?: AbortSignal) {
  signal?.throwIfAborted();
  await ensureSpace(archives.reduce((n, a) => n + a.size, 0));
  const db = await database();
  const known = await db.getAll("catalog");
  for (const a of archives) {
    const prior = known.find((k) => k.id === a.id);
    if (prior) checkIdentity(identity(prior), a);
    checkIdentity(profile.archiveIdentities?.[a.id], a);
  }
  signal?.throwIfAborted();
  const normalized = migrateProfile(profile, [...archives, ...known]);
  const tx = db.transaction(["archives", "profiles", "catalog"], "readwrite");
  const abort = () => { try { tx.abort(); } catch {} };
  signal?.addEventListener("abort", abort, { once: true });
  try {
  await Promise.all([
    ...archives.map((a) => tx.objectStore("archives").put(a)),
    ...archives.map((a) =>
      tx.objectStore("catalog").put({
        ...a,
        files: {},
        fileCount: Object.keys(a.files).length,
        versionId: identity(a).versionId,
        available: true,
      }),
    ),
    tx.objectStore("profiles").put(normalized),
  ]);
  await tx.done;
  } catch (error) {
    abort();
    await tx.done.catch(() => {});
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
export async function getSave(profileId: string) {
  const save = await (await database()).get("saves", profileId);
  return save ? normalizeSave(save) : undefined;
}
export async function putSave(save: Save) {
  const normalized = normalizeSave(save);
  await ensureSpace(
    Object.values({ ...normalized.resources, ...normalized.files }).reduce(
      (n, f) => n + f.byteLength,
      0,
    ),
  );
  await (await database()).put("saves", normalized);
}
export async function recoverSave(profile: Profile, save: Save) {
  save = normalizeSave(save);
  await ensureSpace(
    Object.values({ ...save.resources, ...save.files }).reduce(
      (n, f) => n + f.byteLength,
      0,
    ),
  );
  const db = await database();
  const tx = db.transaction(["profiles", "saves"], "readwrite");
  if (await tx.objectStore("profiles").get(profile.id)) {
    await tx.done;
    throw new Error(
      "같은 프로필이 이미 있습니다. 해당 프로필에서 백업 가져오기를 사용하세요.",
    );
  }
  await tx.objectStore("profiles").put(profile);
  await tx.objectStore("saves").put(save);
  await tx.done;
}
export async function deleteSave(profileId: string) {
  await (await database()).delete("saves", profileId);
}
export async function deleteProfile(profileId: string) {
  // Preserve saves for explicit deletion or export from the save library.
  await (await database()).delete("profiles", profileId);
}
export async function deleteArchive(archiveId: string) {
  const db = await database();
  const profiles = await db.getAll("profiles");
  const dependents = profiles.filter(
    (p) => p.baseId === archiveId || p.patchIds.includes(archiveId),
  );
  if (dependents.length > 1)
    throw new Error(
      `이 ZIP을 ${dependents.length}개 프로필이 사용합니다. 관련 프로필을 먼저 삭제하세요.`,
    );
  const tx = db.transaction(["archives", "catalog"], "readwrite");
  const meta = await tx.objectStore("catalog").get(archiveId);
  if (meta) await tx.objectStore("catalog").put({ ...meta, available: false });
  await tx.objectStore("archives").delete(archiveId);
  await tx.done;
}
export async function saveLibrary() {
  return (await (await database()).getAll("saves")).map(normalizeSave);
}
export function storageError(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "저장 공간이 부족합니다. 백업을 먼저 받은 뒤 불필요한 게임 데이터를 삭제하세요. 기존 데이터는 유지됩니다.";
  return error instanceof Error ? error.message : String(error);
}
