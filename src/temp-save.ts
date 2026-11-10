import type { Files, Profile, Save } from "./model";
import { canonicalPath } from "./archive";
import {
  deletedFiles,
  isSavePath,
  normalizeSave,
  overlayFiles,
} from "./save-state";

export interface RecoveryPoint {
  id: string;
  profileId: string;
  sessionId: string;
  createdAt: number;
  kind: "before-consumption" | "file-checkpoint" | "before-restore";
  candidatePaths: string[];
  save: Save;
  /** File metadata only, not proof of a guest read or successful game save. */
  note: string;
}
export interface RecoveryPolicy {
  profileId: string;
  paths: string[];
}
export function effectiveFiles(source: Files, save?: Save): Files {
  const files = { ...source, ...overlayFiles(save) };
  for (const path of deletedFiles(save)) delete files[path];
  return files;
}
export function equalBytes(a?: Uint8Array, b?: Uint8Array) {
  return (
    a === b ||
    (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]))
  );
}
export function equalSave(a?: Save, b?: Save): boolean {
  if (!a || !b) return a === b;
  if (a.profileId !== b.profileId || a.updatedAt !== b.updatedAt) return false;
  for (const key of ["files", "resources"] as const) {
    const x = a[key] ?? {},
      y = b[key] ?? {};
    if (
      Object.keys(x).length !== Object.keys(y).length ||
      Object.keys(x).some((p) => !equalBytes(x[p], y[p]))
    )
      return false;
  }
  return ["tombstones", "resourceTombstones"].every((k) => {
    const x = (a[k as "tombstones"] ?? []).slice().sort(),
      y = (b[k as "tombstones"] ?? []).slice().sort();
    return JSON.stringify(x) === JSON.stringify(y);
  });
}
export function candidatePaths(
  source: Files,
  save: Save | undefined,
  policy?: RecoveryPolicy,
): string[] {
  const paths = new Set([
    ...Object.keys(source),
    ...Object.keys(overlayFiles(save)),
    ...deletedFiles(save),
  ]);
  // Installation-specific candidate, not a universal slot rule. Custom paths are explicit.
  const defaults = [
    "SAVE/ED4_S99_.DAT",
    ...Object.keys(source)
      .filter((p) => /(^|\/)GAME\.BAT$/i.test(p))
      .map((p) => p.slice(0, -8) + "SAVE/ED4_S99_.DAT"),
  ];
  return [
    ...new Set(
      [...paths]
        .filter((p) => /(^|\/)SAVE\/ED4_S99_\.DAT$/i.test(p))
        .concat(policy?.paths ?? [], defaults),
    ),
  ];
}
export function policyPaths(value: string): string[] {
  const paths = value
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => canonicalPath(p));
  if (
    paths.length > 16 ||
    paths.some((p) => /\.(RAW|EXE|COM|BAT|ISO|EFC)$/i.test(p))
  )
    throw Error(
      "임시 세이브 후보는 최대16개이며 실행 파일/음악/게임 리소스는 지정할 수 없습니다.",
    );
  return [...new Set(paths)];
}
export function saveScope(
  profile: Profile,
  path: string,
  candidates: string[],
) {
  // Preserve sibling save/config files when the registered game retains a root folder.
  // Do not widen an arbitrary custom candidate directory into a game-resource backup.
  const nestedSave = candidates.some((candidate) => {
    const dir = candidate.slice(0, candidate.lastIndexOf("/") + 1);
    return /(^|\/)SAVES?\/$/.test(dir) && path.startsWith(dir);
  });
  return (
    (isSavePath(path, profile) || candidates.includes(path) || nestedSave) &&
    !/\.(RAW|EXE|COM|BAT|ISO|EFC)$/i.test(path)
  );
}
/** Capture only effective save files. A tombstoned source candidate stays absent. */
export async function recoveryPoint(
  profile: Profile,
  source: Files,
  save: Save | undefined,
  candidates: string[],
  sessionId: string,
  kind: RecoveryPoint["kind"],
): Promise<RecoveryPoint | undefined> {
  const effective = effectiveFiles(source, save);
  const present = candidates.filter((p) => effective[p]);
  if (!present.length) return undefined;
  const files: Files = {};
  for (const [path, data] of Object.entries(effective))
    if (saveScope(profile, path, candidates)) files[path] = data;
  const removed = deletedFiles(save).filter((p) =>
    saveScope(profile, p, candidates),
  );
  const hashes = [];
  for (const path of Object.keys(files).sort()) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(files[path]).buffer,
    );
    hashes.push([
      path,
      Array.from(new Uint8Array(hash), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    ]);
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([
        hashes,
        removed.slice().sort(),
        candidates.slice().sort(),
      ]),
    ),
  );
  const key = Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  return {
    id: profile.id + ":" + key,
    profileId: profile.id,
    sessionId,
    createdAt: Date.now(),
    kind,
    candidatePaths: present,
    note: "파일 스냅샷입니다. 읽기 성공·게임 내부 저장 완료·메모리 상태를 보증하지 않습니다.",
    save: normalizeSave({
      profileId: profile.id,
      profile,
      files,
      tombstones: removed,
      updatedAt: Date.now(),
    }),
  };
}
export function restoredSave(
  profile: Profile,
  current: Save | undefined,
  source: Files,
  point: RecoveryPoint,
): Save {
  if (point.profileId !== profile.id || point.save.profileId !== profile.id)
    throw Error("다른 프로필의 복구 지점입니다.");
  if (point.kind === "before-restore")
    return normalizeSave({ ...point.save, profile, updatedAt: Date.now() });
  const files = { ...current?.files },
    resources = { ...current?.resources };
  const removed = new Set(current?.tombstones ?? []),
    resourceRemoved = new Set(current?.resourceTombstones ?? []);
  const scope = new Set([
    ...Object.keys(source),
    ...Object.keys(files),
    ...Object.keys(resources),
    ...deletedFiles(current),
    ...Object.keys(point.save.files),
    ...deletedFiles(point.save),
  ]);
  for (const path of scope)
    if (saveScope(profile, path, point.candidatePaths)) {
      delete files[path];
      delete resources[path];
      removed.delete(path);
      resourceRemoved.delete(path);
      if (point.save.files[path]) files[path] = point.save.files[path];
      else removed.add(path);
    }
  return normalizeSave({
    profileId: profile.id,
    profile,
    files,
    resources,
    tombstones: [...removed],
    resourceTombstones: [...resourceRemoved],
    updatedAt: Date.now(),
  });
}
export class TempSaveSession {
  readonly id = crypto.randomUUID();
  private seen = new Set<string>();
  private last = new Map<string, Uint8Array>();
  missing: string[] = [];
  events: { at: number; path: string; state: string }[] = [];
  constructor(
    readonly paths: string[],
    initial: Files,
  ) {
    this.observe(initial);
  }
  observe(files: Files) {
    for (const path of this.paths) {
      const present = !!files[path],
        wasMissing = this.missing.includes(path);
      if (present) {
        if (!this.seen.has(path) || wasMissing) this.event(path, "present");
        else if (!equalBytes(this.last.get(path), files[path]))
          this.event(path, "content-changed");
        this.seen.add(path);
        this.last.set(path, files[path].slice());
      } else if (this.seen.has(path) && !wasMissing)
        this.event(path, "absent-after-present");
    }
    this.missing = this.paths.filter((p) => this.seen.has(p) && !files[p]);
  }
  private event(path: string, state: string) {
    if (this.events.length < 128)
      this.events.push({ at: Date.now(), path, state });
  }
  report() {
    return {
      sessionId: this.id,
      candidates: this.paths,
      missingAfterPresent: this.missing,
      events: this.events,
      limit: 128,
      evidence:
        "파일 스냅샷 사이의 존재 변화. 읽기·소비·일반 저장 성공은 추정하지 않음",
    };
  }
}
export function attachTempObservation(
  next: Save,
  previous: Save | undefined,
  session: TempSaveSession,
) {
  const deleted = new Set(deletedFiles(next));
  next.tempSaveObservation = {
    sessionId: session.id,
    absentAfterPresent: [
      ...new Set([
        ...(previous?.tempSaveObservation?.absentAfterPresent ?? []),
        ...session.missing,
      ]),
    ].filter((p) => deleted.has(p)),
  };
}
