import type { Files, Profile, Save, Snapshot } from "./model";
import { canonicalPath, validateTree } from "./archive";
export function tombstones(paths: unknown): string[] {
  if (paths === undefined) return [];
  if (
    !Array.isArray(paths) ||
    paths.length > 12000 ||
    paths.some((p) => typeof p !== "string")
  )
    throw new Error("삭제 경로 목록이 잘못되었습니다.");
  return [...new Set(paths.map((p) => canonicalPath(p)))];
}
export function normalizeSave(save: Save): Save {
  const normalized = {
    ...save,
    schemaVersion: 2 as const,
    resources: save.resources ?? Object.create(null),
    tombstones: tombstones(save.tombstones),
    resourceTombstones: tombstones(save.resourceTombstones),
  };
  for (const path of Object.keys({
    ...normalized.resources,
    ...normalized.files,
  })) {
    if (canonicalPath(path) !== path)
      throw new Error("저장 경로가 정규화되지 않았습니다.");
    if (
      normalized.tombstones.includes(path) ||
      normalized.resourceTombstones.includes(path)
    )
      throw new Error(`저장 파일과 삭제 표시 충돌: ${path}`);
    if (normalized.resources[path] && normalized.files[path])
      throw new Error(`저장/리소스 공간 중복: ${path}`);
  }
  validateTree({ ...normalized.resources, ...normalized.files });
  return normalized;
}
export function overlayFiles(save?: Save): Files {
  return { ...save?.resources, ...save?.files };
}
export function deletedFiles(save?: Save) {
  return [...(save?.tombstones ?? []), ...(save?.resourceTombstones ?? [])];
}
export function isSavePath(path: string, p: Profile) {
  const rules = p.savePaths ?? ["*.SAV", "SAVE/", "SAVES/"];
  return rules.some((rule) =>
    rule.startsWith("*.")
      ? path.endsWith(rule.slice(1).toUpperCase())
      : rule.endsWith("/")
        ? path.startsWith(rule.toUpperCase())
        : path === rule.toUpperCase(),
  );
}
export function reconcileSave(
  profile: Profile,
  previous: Save | undefined,
  snapshot: Snapshot,
  sourcePaths: string[],
): Save {
  // Absence is authoritative only when the actual DOS filesystem was enumerated.
  const present = new Set(snapshot.presentPaths.map((p) => canonicalPath(p)));
  const sources = new Set(sourcePaths);
  const prior = previous ? normalizeSave(previous) : undefined;
  const combined = { ...overlayFiles(prior), ...snapshot.files };
  const known = new Set([
    ...sourcePaths,
    ...Object.keys(combined),
    ...deletedFiles(prior),
  ]);
  const files: Files = Object.create(null),
    resources: Files = Object.create(null),
    removed: string[] = [],
    resourceRemoved: string[] = [];
  for (const path of known) {
    const resource = sources.has(path) && !isSavePath(path, profile);
    if (!present.has(path)) (resource ? resourceRemoved : removed).push(path);
    else if (combined[path])
      (resource ? resources : files)[path] = combined[path];
  }
  return normalizeSave({
    profileId: profile.id,
    profile,
    files,
    resources,
    tombstones: removed,
    resourceTombstones: resourceRemoved,
    updatedAt: Date.now(),
    schemaVersion: 2,
  });
}
