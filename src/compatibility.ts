import type { Archive, Files, Profile, Save } from "./model";
import { compose } from "./archive";
import { overlayFiles, deletedFiles } from "./save-state";
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
