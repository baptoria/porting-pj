import { database, type RetiredProfile } from "./storage";
import { listMusic, removeMusic } from "./music";
import {
  archiveReferences,
  packReferences,
  referencedMusic,
} from "./data-references";
import type { Profile, Archive } from "./model";
export type RemovalScope = "profile" | "unused" | "all";
export interface RemovalPlan {
  profile: Profile;
  scope: RemovalScope;
  archiveIds: string[];
  musicIds: string[];
  sharedArchives: number;
  sharedMusic: number;
  estimatedBytes: number;
  saves: number;
  recoveryPoints: number;
  targets: string[];
}
export function removalTargets(
  profile: Profile,
  scope: RemovalScope,
  others: Profile[],
  archives: Archive[],
) {
  const candidates = archiveReferences(profile);
  const archiveIds =
    scope === "profile"
      ? []
      : candidates.filter(
          (id) =>
            archives.some((a) => a.id === id) &&
            !others.some((p) => archiveReferences(p).includes(id)),
        );
  const musicCandidates = [
    ...new Set([
      ...packReferences(profile),
      ...archives
        .filter((a) => candidates.includes(a.id))
        .flatMap((a) => (a.musicPackId ? [a.musicPackId] : [])),
    ]),
  ];
  const remaining = archives.filter((a) => !archiveIds.includes(a.id));
  const musicIds =
    scope === "profile"
      ? []
      : musicCandidates.filter((id) => !referencedMusic(id, others, remaining));
  return {
    archiveIds,
    musicIds,
    sharedArchives: candidates.filter((id) =>
      others.some((p) => archiveReferences(p).includes(id)),
    ).length,
    sharedMusic: musicCandidates.filter((id) =>
      referencedMusic(id, others, remaining),
    ).length,
  };
}
export async function retiredProfiles() {
  return (await database()).getAll("retiredProfiles");
}
export async function renameProfile(id: string, name: string) {
  name = name.trim();
  if (!name || name.length > 100) throw Error("이름을 1~100자로 입력하세요.");
  const db = await database(),
    tx = db.transaction("profiles", "readwrite"),
    p = await tx.store.get(id);
  if (p) await tx.store.put({ ...p, name });
  await tx.done;
  if (!p) throw Error("프로필이 없습니다. 목록을 새로 확인하세요.");
}
export async function restoreRetired(id: string) {
  const tx = (await database()).transaction(
    ["profiles", "retiredProfiles"],
    "readwrite",
  );
  const r = await tx.objectStore("retiredProfiles").get(id);
  if (!r || (await tx.objectStore("profiles").get(id))) {
    await tx.done;
    throw Error("복원할 프로필이 없거나 이미 등록되어 있습니다.");
  }
  await tx.objectStore("profiles").put(r.profile);
  await tx.objectStore("retiredProfiles").delete(id);
  await tx.done;
}
export async function previewRemoval(
  id: string,
  scope: RemovalScope,
): Promise<RemovalPlan> {
  if (!["profile", "unused", "all"].includes(scope))
    throw Error("삭제 범위 오류");
  const db = await database(),
    profiles = await db.getAll("profiles"),
    retired = await db.getAll("retiredProfiles");
  const profile =
    profiles.find((p) => p.id === id) ??
    retired.find((r) => r.id === id)?.profile;
  if (!profile) throw Error("프로필이 없습니다.");
  const archives = (await db.getAll("catalog")).filter((a) => a.available);
  const others = [
    ...profiles,
    ...retired.filter((r) => r.dataKept).map((r) => r.profile),
  ].filter((p) => p.id !== id);
  const targets = removalTargets(profile, scope, others, archives),
    music = await listMusic();
  const save = await db.get("saves", id),
    points = await db.getAllFromIndex("recovery", "profileId", id);
  const bytes = (s: typeof save) =>
    s
      ? Object.values({ ...s.resources, ...s.files }).reduce(
          (n, b) => n + b.byteLength,
          0,
        )
      : 0;
  return {
    profile,
    scope,
    ...targets,
    saves: save ? 1 : 0,
    recoveryPoints: points.length,
    targets: [...archives.filter(a=>targets.archiveIds.includes(a.id)).map(a=>`게임: ${a.name} (${a.id.slice(0,8)})`), ...music.filter(m=>targets.musicIds.includes(m.id)).map(m=>`음악: ${m.name} (${m.id.slice(0,8)})`)],
    estimatedBytes:
      archives
        .filter((a) => targets.archiveIds.includes(a.id))
        .reduce((n, a) => n + a.size, 0) +
      music
        .filter((m) => targets.musicIds.includes(m.id))
        .reduce((n, m) => n + m.bytes, 0) +
      (scope === "all"
        ? bytes(save) + points.reduce((n, p) => n + bytes(p.save), 0)
        : 0),
  };
}
/** Called under the existing per-namespace lifetime writer lock, while the game is idle.
 * IndexedDB changes are atomic. OPFS cleanup is deliberately separate and retryable;
 * failures never roll back a profile into a partially removed OPFS pack. */
export async function removeProfileData(plan: RemovalPlan) {
  if (!["profile", "unused", "all"].includes(plan.scope))
    throw Error("삭제 범위 오류");
  const db = await database(),
    tx = db.transaction(
      [
        "profiles",
        "retiredProfiles",
        "archives",
        "catalog",
        "saves",
        "recovery",
        "recoveryPolicies",
        "cleanup",
      ],
      "readwrite",
    );
  try {
    const profiles = await tx.objectStore("profiles").getAll(),
      retired = await tx.objectStore("retiredProfiles").getAll();
    const p =
      profiles.find((p) => p.id === plan.profile.id) ??
      retired.find((r) => r.id === plan.profile.id)?.profile;
    if (!p || JSON.stringify(p) !== JSON.stringify(plan.profile))
      throw Error("프로필이 변경되었습니다. 삭제 대상을 다시 확인하세요.");
    const archives = (await tx.objectStore("catalog").getAll()).filter(
      (a) => a.available,
    );
    const targets = removalTargets(
      p,
      plan.scope,
      [
        ...profiles,
        ...retired.filter((r) => r.dataKept).map((r) => r.profile),
      ].filter((v) => v.id !== p.id),
      archives,
    );
    if (
      JSON.stringify(targets.archiveIds) !== JSON.stringify(plan.archiveIds) ||
      JSON.stringify(targets.musicIds) !== JSON.stringify(plan.musicIds)
    )
      throw Error("공유 관계가 변경되었습니다. 삭제 대상을 다시 확인하세요.");
    if (plan.scope === "all") {
      await tx.objectStore("saves").delete(p.id);
      for (const point of await tx
        .objectStore("recovery")
        .index("profileId")
        .getAll(p.id))
        await tx.objectStore("recovery").delete(point.id);
      await tx.objectStore("recoveryPolicies").delete(p.id);
      await tx.objectStore("retiredProfiles").delete(p.id);
    } else {
      const retained: RetiredProfile = {
        id: p.id,
        profile: p,
        deletedAt: Date.now(),
        dataKept: plan.scope === "profile",
      };
      await tx.objectStore("retiredProfiles").put(retained);
    }
    for (const id of targets.archiveIds) {
      const a = archives.find((a) => a.id === id)!;
      await tx.objectStore("catalog").put({ ...a, available: false });
      await tx.objectStore("archives").delete(id);
    }
    for (const id of targets.musicIds)
      await tx.objectStore("cleanup").put({ id, createdAt: Date.now() });
    await tx.objectStore("profiles").delete(p.id);
    await tx.done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
  return cleanupMusic();
}
export async function musicInUse(id: string) {
  const db = await database();
  return referencedMusic(
    id,
    [
      ...(await db.getAll("profiles")),
      ...(await db.getAll("retiredProfiles"))
        .filter((r) => r.dataKept)
        .map((r) => r.profile),
    ],
    (await db.getAll("catalog")).filter((a) => a.available),
  );
}
export async function deleteUnusedMusic(id: string) {
  if (await musicInUse(id))
    throw Error(
      "프로필 또는 보존된 게임 데이터가 참조하는 음악입니다. 해당 프로필의 삭제 범위를 먼저 확인하세요.",
    );
  const db = await database();
  await db.put("cleanup", { id, createdAt: Date.now() });
  return cleanupMusic();
}
export async function cleanupMusic() {
  const db = await database(),
    errors: string[] = [];
  for (const job of await db.getAll("cleanup")) {
    // Recheck after restart: a newly restored/linked profile must win over cleanup.
    if (await musicInUse(job.id)) {
      await db.delete("cleanup", job.id);
      continue;
    }
    try {
      await removeMusic(job.id);
      await db.delete("cleanup", job.id);
    } catch(e) {
      errors.push(job.id);
      // Keep bounded error type, never serialize a filesystem path/message.
      try { await db.put('cleanup',{...job,lastError:e instanceof Error?e.name.slice(0,80):'UnknownError'}); } catch { /* Original durable job already exists. */ }
    }
  }
  return errors;
}
