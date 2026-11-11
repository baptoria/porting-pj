import { openDB, type DBSchema } from "idb";
import {APP_STORAGE} from './app-storage';
import type { Archive, Profile, Save } from "./model";
import { migrateProfile, identity, checkIdentity } from "./integrity";
import { normalizeSave } from "./save-state";
import { equalSave, type RecoveryPoint, type RecoveryPolicy } from "./temp-save";
import { archiveReferences } from './data-references';
export interface RetiredProfile { id: string; profile: Profile; deletedAt: number; dataKept: boolean }
interface LauncherDB extends DBSchema {
  archives: { key: string; value: Archive };
  profiles: { key: string; value: Profile };
  saves: { key: string; value: Save };
  recovery: { key: string; value: RecoveryPoint; indexes: { profileId: string } };
  recoveryPolicies: { key: string; value: RecoveryPolicy };
  catalog: { key: string; value: Archive & { available: boolean } };
  retiredProfiles: { key: string; value: RetiredProfile };
  cleanup: { key: string; value: { id: string; createdAt: number; lastError?: string } };
}
export const database = () => {
  let late = false, timer: ReturnType<typeof setTimeout> | undefined;
  let rejectBlocked: (e: Error) => void;
  const blocked = new Promise<never>((_, reject) => { rejectBlocked = reject; });
  const opening = openDB<LauncherDB>(APP_STORAGE.database, 4, {
    blocked() { timer ??= setTimeout(() => { late = true; rejectBlocked(Error("저장소 업데이트가 다른 실행기 탭을 기다리고 있습니다. 다른 탭의 게임을 안전하게 종료하고 탭을 닫은 뒤 다시 시도하세요. 데이터 삭제는 필요 없습니다.")); }, 8000); },
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 4) {
        db.createObjectStore('retiredProfiles', { keyPath: 'id' });
        db.createObjectStore('cleanup', { keyPath: 'id' });
      }
      if (oldVersion < 1) {
        db.createObjectStore("archives", { keyPath: "id" });
        db.createObjectStore("profiles", { keyPath: "id" });
        db.createObjectStore("saves", { keyPath: "profileId" });
      }
      if (oldVersion < 3) {
        db.createObjectStore("recovery", { keyPath: "id" }).createIndex("profileId", "profileId");
        db.createObjectStore("recoveryPolicies", { keyPath: "profileId" });
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
  }).then(db => { clearTimeout(timer); if (late) db.close(); else db.addEventListener("versionchange", () => db.close()); return db; });
  return Promise.race([opening, blocked]);
};
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
  const {previewRemoval,removeProfileData}=await import('./profile-management');
  await removeProfileData(await previewRemoval(profileId,'profile'));
}
export async function deleteArchive(archiveId: string) {
  const db = await database();
  const tx = db.transaction(["archives", "catalog", "profiles", "retiredProfiles"], "readwrite");
  const profiles = [...await tx.objectStore('profiles').getAll(), ...(await tx.objectStore('retiredProfiles').getAll()).filter(r=>r.dataKept).map(r=>r.profile)];
  if (profiles.some(p=>archiveReferences(p).includes(archiveId))) {
    await tx.done;
    throw Error('사용 중이거나 복원용으로 보존한 프로필의 게임 데이터입니다. 프로필 삭제 범위에서 먼저 정리하세요.');
  }
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

// Additive v3 stores. Immutable recovery points and current save commit together.
export async function recoveryPoints(profileId: string) {
  const db = await database();
  return (await db.getAllFromIndex('recovery', 'profileId', profileId)).sort((a,b) => b.createdAt-a.createdAt);
}
export async function recoveryPolicy(profileId: string) { return (await database()).get('recoveryPolicies', profileId); }
export async function putRecoveryPolicy(policy: RecoveryPolicy) { await (await database()).put('recoveryPolicies', policy); }
function saveBytes(save: Save) { return Object.values({...save.resources,...save.files}).reduce((n,b)=>n+b.byteLength,0); }
export async function commitProtectedSave(profileId: string, expected: Save | undefined, next: Save | undefined, point?: RecoveryPoint) {
  if (next && next.profileId !== profileId || point && point.profileId !== profileId) throw Error('복구 프로필 불일치');
  const db = await database();
  const known = point ? await db.get('recovery',point.id) : undefined;
  await ensureSpace((next ? saveBytes(next) : 0) + (point && !known ? saveBytes(point.save) : 0));
  const tx = db.transaction(['saves','recovery'],'readwrite');
  try {
    const prior = await tx.objectStore('saves').get(profileId);
    if (!equalSave(prior ? normalizeSave(prior) : undefined, expected)) throw Error('다른 탭에서 세이브가 변경됐습니다. 현재 게임을 종료하지 않았습니다. 파일 변경분을 내보내고 다른 탭을 확인하세요.');
    if (point && !await tx.objectStore('recovery').get(point.id)) await tx.objectStore('recovery').add(point);
    if (next) await tx.objectStore('saves').put(normalizeSave(next));
    await tx.done;
  } catch(e) { try {tx.abort();} catch {} await tx.done.catch(()=>{}); throw e; }
}
export async function applyRecovery(profile: Profile, expected: Save | undefined, next: Save, pointId: string) {
  const db = await database();
  const point = await db.get('recovery',pointId);
  if (!point || point.profileId !== profile.id) throw Error('복구 지점이 없거나 다른 프로필입니다.');
  await replaceSaveWithBackup(profile,expected,next);
}
export async function replaceSaveWithBackup(profile: Profile, expected: Save | undefined, next: Save) {
  // Keep an exact backup of current deltas (including resource deltas) before overwrite.
  const prior = expected ?? normalizeSave({profileId:profile.id,profile,files:{},updatedAt:Date.now()});
  const backup: RecoveryPoint = {id:crypto.randomUUID(),profileId:profile.id,sessionId:crypto.randomUUID(),createdAt:Date.now(),kind:'before-restore',candidatePaths:[],save:prior,note:'사용자 승인 복구 직전의 저장 변경분. 원본/RAW 전체는 포함하지 않습니다.'};
  await commitProtectedSave(profile.id,expected,next,backup);
}
