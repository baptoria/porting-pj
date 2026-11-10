import type {SourceInput} from './source-import';

/** Only these locally authored messages may pass through the public error view. */
export class FolderSelectionError extends Error {}
export const folderUnavailable = '이 환경에서는 게임 폴더를 선택할 수 없습니다. 최신 Chrome에서 열어 주세요. 이미 등록한 게임은 계속 실행할 수 있습니다.';
export function folderPickerAvailable(input: object, userAgent: string): boolean {
  if (!('webkitdirectory' in input)) return false;
  // Older Android Chrome reflects the attribute without a working directory picker.
  // Do not infer support for other branded browsers from their embedded Chrome version.
  const chrome = /Chrome\/(\d+)/.exec(userAgent);
  return !(/Android/.test(userAgent) && !/SamsungBrowser|EdgA|OPR|; wv/.test(userAgent) && chrome && Number(chrome[1]) < 132);
}
export interface FolderScan {
  name: string;
  files: SourceInput[];
  roots: string[];
  preferred: string;
}
const executable = /\.(bat|exe|com)$/i;
const image = /(^|\/)ED4\.iso$/i;
const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** Metadata only. No file bytes, storage writes, renaming or DOS path conversion here. */
export function scanGameFolder(selected: readonly File[], patch = false): FolderScan {
  if (!selected.length) throw new FolderSelectionError('폴더에 파일이 없습니다. 압축을 푼 게임 폴더를 선택해 주세요.');
  if (selected.length > 12000) throw new FolderSelectionError('파일 개수 제한을 넘었습니다. 게임이 있는 하위 폴더를 선택해 주세요.');
  let name = '';
  const files = selected.map(file => {
    const raw = file.webkitRelativePath;
    if (!raw || !raw.includes('/')) throw new FolderSelectionError(folderUnavailable);
    const parts = raw.split('/');
    // Check before removing packaging ancestors, so traversal cannot disappear by cropping.
    if (raw.length > 4096 || parts.length > 64 || /[\\:\x00-\x1f\x7f]/.test(raw) || parts.some(p => !p || p === '.' || p === '..'))
      throw new FolderSelectionError('폴더 경로가 올바르지 않습니다. 게임 폴더를 다시 선택해 주세요.');
    if (name && name !== parts[0]) throw new FolderSelectionError('한 번에 하나의 게임 폴더를 선택해 주세요.');
    name = parts[0];
    return {file, path: parts.slice(1).join('/')};
  });
  if (patch) return {name, files, roots: [''], preferred: ''}; // Never crop a resource-only patch.
  const programs = files.filter(f => executable.test(f.path));
  if (!programs.length) throw new FolderSelectionError('실행 파일을 찾지 못했습니다. 압축파일을 먼저 해제해주세요. 실행 파일이 들어 있는 게임 폴더를 선택하세요. ISO는 음악 연결용입니다. 실행 파일이 들어 있는 본체 폴더도 함께 선택하세요.');
  const gameRoots = [...new Set(programs.filter(f => /(^|\/)GAME\.BAT$/i.test(f.path)).map(f => parent(f.path)))];
  const roots = [...new Set(['', ...gameRoots, ...programs.map(f => parent(f.path))])];
  if (roots.length > 100) throw new FolderSelectionError('실행 파일이 있는 폴더가 너무 많습니다. 게임이 있는 하위 폴더를 선택해 주세요.');
  return {name, files, roots, preferred: gameRoots.length === 1 ? gameRoots[0] : roots.length === 2 ? roots[1] : ''};
}
export function selectGameFolder(scan: FolderScan, root: string) {
  if (!scan.roots.includes(root)) throw new FolderSelectionError('목록에 있는 게임 폴더를 선택해 주세요.');
  const prefix = root ? root + '/' : '';
  const inside = scan.files.filter(f => f.path.startsWith(prefix));
  const skippedIso = inside.filter(f => image.test(f.path)).length;
  const files = inside.filter(f => !image.test(f.path)).map(f => ({file: f.file, path: f.path.slice(prefix.length)}));
  // The unchanged source worker validates actual DOS paths, duplicates and sizes.
  return {deferredIso: scan.files.filter(f => image.test(f.path)).length, name: root ? root.split('/').at(-1)! : scan.name, files, skippedIso,
    excluded: scan.files.length - inside.length, outsideRaw: scan.files.filter(f => !f.path.startsWith(prefix) && /\.raw$/i.test(f.path)).length};
}
