import { unzipSync, zipSync, strToU8 } from "fflate";
import type { Archive, ArchiveAnalysis, Files, Profile, Save } from "./model";
import { deletedFiles, overlayFiles, normalizeSave } from "./save-state";
import { checkRequirements } from "./integrity";

export const LIMITS = {
  compressed: 128 * 1024 * 1024,
  expanded: 256 * 1024 * 1024,
  file: 64 * 1024 * 1024,
  entries: 12000,
};
export function canonicalPath(raw: string, internal = false): string {
  const path = raw.replace(/\\/g, "/");
  const pieces = path.replace(/\/$/, "").split("/");
  if (
    !path ||
    path.startsWith("/") ||
    pieces.some((p) => !p || p === "." || p === "..") ||
    /[:\x00-\x1f\x7f]/.test(path)
  )
    throw new Error(`안전하지 않은 ZIP 경로: ${raw}`);
  if (!/^[\x20-\x7e]+$/.test(path))
    throw new Error(`비 ASCII 파일명은 아직 지원하지 않습니다: ${raw}`);
  if (
    pieces.some(
      (p) =>
        /[<>"|?*]/.test(p) ||
        /[. ]$/.test(p) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(p),
    )
  )
    throw new Error(`DOS에서 사용할 수 없는 경로: ${raw}`);
  if (!internal && pieces[0].toLowerCase() === ".jsdos")
    throw new Error(
      "ZIP의 .jsdos 설정은 허용하지 않습니다. 일반 게임 ZIP을 등록하세요.",
    );
  if (path.length > 180) throw new Error("ZIP 내부 경로가 너무 깁니다.");
  return pieces.map((p) => p.toUpperCase()).join("/");
}
export function validateTree(files: Files): void {
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    parts.pop();
    while (parts.length) {
      if (files[parts.join("/")])
        throw new Error(`파일/폴더 충돌: ${parts.join("/")}`);
      parts.pop();
    }
  }
}
export function readZip(bytes: Uint8Array, internal = false): Files {
  if (bytes.length > LIMITS.compressed)
    throw new Error("ZIP은 128 MiB 이하여야 합니다.");
  const seen = new Set<string>();
  let total = 0;
  let count = 0;
  // fflate invokes the filter for every central-directory entry BEFORE inflation.
  const unpacked = unzipSync(bytes, {
    filter(entry) {
      if (++count > LIMITS.entries)
        throw new Error("ZIP의 항목 수가 너무 많습니다.");
      const name = canonicalPath(entry.name, internal);
      if (seen.has(name))
        throw new Error(`중복 경로 (대소문자 포함): ${entry.name}`);
      seen.add(name);
      if (
        entry.originalSize > LIMITS.file ||
        (total += entry.originalSize) > LIMITS.expanded
      )
        throw new Error("ZIP 압축 해제 크기가 제한을 초과합니다.");
      return !entry.name.endsWith("/");
    },
  });
  const files: Files = Object.create(null);
  for (const [name, data] of Object.entries(unpacked))
    files[canonicalPath(name, internal)] = data;
  if (!internal && !Object.keys(files).length)
    throw new Error("ZIP에 파일이 없습니다.");
  validateTree(files);
  return files;
}
export function executables(files: Files) {
  return Object.keys(files)
    .filter((p) => /\.(EXE|COM|BAT)$/.test(p))
    .sort();
}
export function compose(
  base: Files,
  patches: Files[],
): { files: Files; conflicts: string[] } {
  const files: Files = Object.assign(Object.create(null), base);
  const conflicts: string[] = [];
  for (const patch of patches)
    for (const [path, data] of Object.entries(patch)) {
      if (files[path]) conflicts.push(path);
      files[path] = data;
    }
  validateTree(files);
  return { files, conflicts: [...new Set(conflicts)] };
}
export function validateExecutable(executable: string, files: Files) {
  if (!files[executable] || !/\.(EXE|COM|BAT)$/.test(executable))
    throw new Error("실행 파일을 선택하세요.");
  // DOSBox 0.74 shell uses DOS 8.3 names. Do not guess generated short aliases.
  if (
    executable
      .split("/")
      .some(
        (part) =>
          !/^[A-Z0-9_!#$%&'()@^`{}~\-]{1,8}(\.[A-Z0-9_!#$%&'()@^`{}~\-]{1,3})?$/.test(
            part,
          ),
      ) ||
    /[%&^]/.test(executable)
  )
    throw new Error(
      "실행 파일과 상위 폴더는 명령 문자가 없는 DOS 8.3 이름이어야 합니다. ZIP의 폴더 구조를 확인하세요.",
    );
}
export function dosConfig(profile: Profile): string {
  const s = profile.settings;
  if (
    !Number.isInteger(s.cycles) ||
    s.cycles < 1000 ||
    s.cycles > 100000 ||
    ![8, 16, 32, 64].includes(s.memory) ||
    !["sb16", "sbpro2", "none"].includes(s.sound)
  )
    throw new Error("DOSBox 설정 범위를 확인하세요.");
  const parts = profile.executable.split("/");
  const exe = parts.pop()!;
  return `[sdl]\nautolock=false\n[dosbox]\nmachine=svga_s3\nmemsize=${s.memory}\n[render]\nframeskip=0\n[cpu]\ncore=auto\ncputype=auto\ncycles=${s.cycles}\n[mixer]\nrate=22050\nblocksize=1024\nprebuffer=30\n[sblaster]\nsbtype=${s.sound}\nsbbase=220\nirq=7\ndma=1\nhdma=5\noplmode=auto\noplemu=default\noplrate=22050\n[midi]\nmpu401=none\nmididevice=none\n[autoexec]\n@echo off\nmount c .\nc:\n${parts.length ? `cd ${parts.join("\\")}\n` : ""}${s.prelude.trim()}\n${exe}\n`;
}
export function buildBundle(
  profile: Profile,
  archives: Archive[],
  saves: Files = {},
  deleted: string[] = [],
): Uint8Array {
  const get = (key: string) => {
    const a = archives.find((a) => a.id === key);
    if (!a)
      throw new Error("게임 데이터가 없습니다. 원본 ZIP을 다시 연결하세요.");
    return a.files;
  };
  const combined = compose(
    get(profile.baseId),
    profile.patchIds.map(get),
  ).files;
  validateExecutable(profile.executable, combined);
  const files = { ...combined };
  for (const path of deleted) delete files[canonicalPath(path)];
  Object.assign(files, saves);
  validateTree(files);
  validateExecutable(profile.executable, files);
  files[".jsdos/dosbox.conf"] = strToU8(dosConfig(profile));
  return zipSync(files, { level: 1 });
}

export function analyzeFiles(files: Files): ArchiveAnalysis {
  const paths = Object.keys(files),
    longPaths = paths.filter((path) =>
      path
        .split("/")
        .some(
          (part) =>
            !/^[A-Z0-9_!#$%&'()@^`{}~\-]{1,8}(\.[A-Z0-9_!#$%&'()@^`{}~\-]{1,3})?$/.test(
              part,
            ),
        ),
    );
  return {
    files: paths.length,
    bytes: Object.values(files).reduce((n, f) => n + f.byteLength, 0),
    executables: executables(files),
    batFiles: paths.filter((p) => p.endsWith(".BAT")),
    roots: [
      ...new Set(
        paths.map((p) => (p.includes("/") ? p.split("/")[0] : "(ROOT)")),
      ),
    ],
    longPaths,
    warnings: [
      ...(longPaths.length
        ? ["DOS 8.3 초과 경로가 있습니다. 실행 경로로는 사용할 수 없습니다."]
        : []),
      "ASCII 경로만 등록됩니다. CP949/한글 이름은 자동 변환하지 않습니다.",
      "실행 후보는 확장자 기준입니다. 실제 DOS 호환성과 한글 로더는 미검증입니다.",
    ],
  };
}
export function createRuntime(
  profile: Profile,
  archives: Archive[],
  save?: Save,
) {
  checkRequirements(profile, archives);
  if (save) save = normalizeSave(save);
  return buildBundle(profile, archives, overlayFiles(save), deletedFiles(save));
}
