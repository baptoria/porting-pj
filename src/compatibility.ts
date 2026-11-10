import type { Archive, Files, Profile, Save } from "./model";
import { compose } from "./archive";
import { overlayFiles, deletedFiles, isSavePath } from "./save-state";
import type { RecoveryPoint } from './temp-save';
export interface Conflict {
  path: string;
  layers: string[];
  winner: string;
  saveOverride: boolean;
  deleted: boolean;
}
export function layerFiles(p: Profile, archives: Archive[]): Files {
  const get = (id: string) => {
    const a = archives.find((a) => a.id === id);
    if (!a) throw new Error("게임/수정 ZIP이 누락되었습니다.");
    return a.files;
  };
  return compose(get(p.baseId), p.patchIds.map(get)).files;
}
export function conflicts(
  p: Profile,
  archives: Archive[],
  save?: Save,
): Conflict[] {
  const owners = new Map<string, string[]>();
  for (const id of [p.baseId, ...p.patchIds]) {
    const a = archives.find((a) => a.id === id);
    if (!a) continue;
    for (const path of Object.keys(a.files))
      owners.set(path, [...(owners.get(path) ?? []), a.name]);
  }
  const overlays = overlayFiles(save),
    deleted = new Set(deletedFiles(save));
  for (const path of [...Object.keys(overlays), ...deleted])
    if (!owners.has(path)) owners.set(path, []);
  return [...owners]
    .filter(
      ([path, layers]) =>
        layers.length > 1 ||
        ((overlays[path] || deleted.has(path)) && layers.length > 0),
    )
    .map(([path, layers]) => ({
      path,
      layers,
      winner: deleted.has(path)
        ? "저장 삭제 표시"
        : overlays[path]
          ? "저장 변경분"
          : layers.at(-1)!,
      saveOverride: !!overlays[path] || deleted.has(path),
      deleted: deleted.has(path),
    }));
}
function equal(a?: Uint8Array, b?: Uint8Array) {
  return (
    a === b ||
    (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]))
  );
}
export function orderImpact(
  before: Profile,
  after: Profile,
  archives: Archive[],
): string[] {
  const a = layerFiles(before, archives),
    b = layerFiles(after, archives);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (path) => !equal(a[path], b[path]),
  );
}

export function saveConflictStatus(p: Profile, archives: Archive[], save: Save | undefined, points: RecoveryPoint[]) {
  return conflicts(p, archives, save).filter(c => c.saveOverride).map(c => {
    const patch = archives.some(a => p.patchIds.includes(a.id) && !!a.files[c.path]);
    const observed = save?.tempSaveObservation?.absentAfterPresent.includes(c.path) &&
      points.some(r => r.kind !== 'before-restore' && r.candidatePaths.includes(c.path) && !!r.save.files[c.path]);
    const category = patch ? '모딩 파일과 저장 데이터 충돌' : !isSavePath(c.path,p) ? '원본 리소스 변경/삭제 위험' :
      !c.deleted ? '정상 저장 변경분 적용' : observed ? '일회성 임시 파일 소비 가능성 · 복구본 있음' : '확인되지 않은 저장 삭제';
    return {...c,category,warning:patch || !isSavePath(c.path,p) || (c.deleted && !observed)};
  });
}
