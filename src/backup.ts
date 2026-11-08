import { zipSync, strToU8, strFromU8 } from "fflate";
import { canonicalPath, dosConfig, readZip } from "./archive";
import type { Profile, Save, Files } from "./model";
import { normalizeSave, tombstones } from "./save-state";
import { validateIdentities } from "./integrity";
export function exportBackup(
  profile: Pick<Profile, "id" | "name">,
  save: Save,
): Uint8Array {
  save = normalizeSave(save);
  const files: Files = Object.create(null);
  files["ED4-BACKUP.JSON"] = strToU8(
    JSON.stringify({
      format: "ed4-save",
      version: 2,
      gameId: "ed4",
      profileId: profile.id,
      profileName: profile.name,
      profile: "engineId" in profile ? profile : save.profile,
      updatedAt: save.updatedAt,
      tombstones: save.tombstones,
      resourceTombstones: save.resourceTombstones,
    }),
  );
  for (const [path, data] of Object.entries(save.files))
    files[`FILES/${path}`] = data;
  for (const [path, data] of Object.entries(save.resources ?? {}))
    files[`RESOURCES/${path}`] = data;
  return zipSync(files, { level: 6 });
}
export function importBackup(bytes: Uint8Array, profile: Profile): Save {
  const unpacked = readZip(bytes);
  const manifest = unpacked["ED4-BACKUP.JSON"];
  if (!manifest) throw new Error("ED4 저장 백업 ZIP이 아닙니다.");
  const meta = JSON.parse(strFromU8(manifest));
  if (
    meta.format !== "ed4-save" ||
    ![1, 2].includes(meta.version) ||
    meta.gameId !== profile.gameId
  )
    throw new Error("지원하지 않는 백업 형식입니다.");
  if (meta.profileId !== profile.id)
    throw new Error(
      "다른 프로필의 백업입니다. 저장 공간 혼합을 방지하기 위해 가져오기를 중단했습니다.",
    );
  const files: Files = Object.create(null);
  const resources: Files = Object.create(null);
  for (const [path, data] of Object.entries(unpacked)) {
    if (path === "ED4-BACKUP.JSON") continue;
    const prefix = path.startsWith("FILES/")
      ? "FILES/"
      : meta.version === 2 && path.startsWith("RESOURCES/")
        ? "RESOURCES/"
        : undefined;
    if (!prefix) throw new Error("백업 경로가 잘못되었습니다.");
    let name: string;
    try {
      name = canonicalPath(path.slice(prefix.length));
    } catch {
      throw new Error("백업 경로가 잘못되었습니다.");
    }
    (prefix === "FILES/" ? files : resources)[name] = data;
  }
  const backupIdentities = validateIdentities(meta.profile?.archiveIdentities);
  for (const [key, expected] of Object.entries(profile.archiveIdentities ?? {}))
    if (
      expected.manifestSha256 &&
      backupIdentities?.[key]?.manifestSha256 &&
      expected.manifestSha256 !== backupIdentities[key].manifestSha256
    )
      throw Error("백업 원본 폴더 해시 불일치");
  for (const [key, expected] of Object.entries(profile.archiveIdentities ?? {}))
    if (
      expected.sha256 &&
      backupIdentities?.[key]?.sha256 &&
      expected.sha256 !== backupIdentities[key].sha256
    )
      throw new Error("백업 원본 해시 불일치");
  return normalizeSave({
    profileId: profile.id,
    files,
    resources,
    tombstones: meta.version === 2 ? tombstones(meta.tombstones) : [],
    resourceTombstones:
      meta.version === 2 ? tombstones(meta.resourceTombstones) : [],
    updatedAt: Date.now(),
    profile,
  });
}

export function recoverProfile(bytes: Uint8Array): {
  profile: Profile;
  save: Save;
} {
  const files = readZip(bytes);
  if (!files["ED4-BACKUP.JSON"]) throw new Error("ED4 저장 백업이 아닙니다.");
  const meta = JSON.parse(strFromU8(files["ED4-BACKUP.JSON"]));
  const p = meta.profile;
  const identifier = (value: unknown) =>
    typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  if (
    !p ||
    !identifier(p.id) ||
    p.id !== meta.profileId ||
    p.gameId !== "ed4" ||
    p.engineId !== "js-dos-v7" ||
    !identifier(p.baseId) ||
    !Array.isArray(p.patchIds) ||
    p.patchIds.length > 100 ||
    !p.patchIds.every(identifier) ||
    !["vanilla", "patch", "standalone"].includes(p.kind) ||
    typeof p.name !== "string" ||
    p.name.length > 60 ||
    typeof p.executable !== "string" ||
    !p.settings ||
    typeof p.settings.prelude !== "string" ||
    p.settings.prelude.length > 4000
  )
    throw new Error(
      "복구 가능한 프로필 정보가 없는 백업입니다. 기존 프로필의 가져오기를 이용하세요.",
    );
  canonicalPath(p.executable);
  dosConfig(p);
  const profile: Profile = {
    id: p.id,
    gameId: "ed4",
    engineId: "js-dos-v7",
    name: p.name,
    kind: p.kind,
    baseId: p.baseId,
    patchIds: p.patchIds,
    executable: p.executable,
    settings: {
      cycles: p.settings.cycles,
      memory: p.settings.memory,
      sound: p.settings.sound,
      prelude: p.settings.prelude,
    },
    createdAt: Date.now(),
    schemaVersion: 2,
    archiveIdentities: validateIdentities(p.archiveIdentities),
    requiredBaseVersion:
      typeof p.requiredBaseVersion === "string"
        ? p.requiredBaseVersion
        : undefined,
    savePaths:
      Array.isArray(p.savePaths) &&
      p.savePaths.every((s: unknown) => typeof s === "string")
        ? p.savePaths
        : undefined,
    music:
      p.music &&
      identifier(p.music.packId) &&
      typeof p.music.prefix === "string"
        ? {
            packId: p.music.packId,
            prefix: p.music.prefix ? canonicalPath(p.music.prefix) : "",
            ...(identifier(p.music.sourceArchiveId) ? { sourceArchiveId: p.music.sourceArchiveId } : {}),
            ...(Array.isArray(p.music.overlays) && p.music.overlays.length <= 100 ? {
              overlays: p.music.overlays.map((reference: any) => {
                if (!identifier(reference?.packId) || typeof reference.prefix !== "string") throw Error("음악 참조 형식 오류");
                return { packId: reference.packId, prefix: reference.prefix ? canonicalPath(reference.prefix) : "",
                  ...(identifier(reference.sourceArchiveId) ? { sourceArchiveId: reference.sourceArchiveId } : {}) };
              }),
            } : {}),
          }
        : undefined,
    launch:
      p.launch && ["analyzed-batch", "single-file", "user-choice"].includes(p.launch.source) &&
      typeof p.launch.presetId === "string" && p.launch.presetId.length <= 100 &&
      Array.isArray(p.launch.initialization) && p.launch.initialization.length <= 200 &&
      p.launch.initialization.every((path: unknown) => typeof path === "string" && path.length <= 180)
        ? { source: p.launch.source, presetId: p.launch.presetId, experimental: true,
            initialization: p.launch.initialization.map((path: string) => canonicalPath(path)) }
        : undefined,
  };
  return { profile, save: importBackup(bytes, profile) };
}
