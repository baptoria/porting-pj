import { compose, validateExecutable } from "./archive";
import { analyzeLaunch, launchChoice, manualLaunchChoice, type LaunchAnalysis } from "./launch-analysis";
import { identity } from "./integrity";
import { DEFAULT_SETTINGS, id, type Archive, type Files, type Profile, type ProfileKind } from "./model";
import { musicMounts, resolvedTracks } from "./music";
import { getArchive, putProfile, storageError } from "./storage";
import { importSources, checkCancelled, discardStagedMusic, type SourceInput, type ImportProgress } from "./source-import";
import { importCommit } from './import-trace';

export interface Registration {
  archive: Archive;
  files: Files;
  kind: ProfileKind;
  base?: Profile;
  baseArchive?: Archive;
  analysis: LaunchAnalysis;
  conflicts: string[];
  music?: Profile["music"];
  committed: boolean;
  /** New-import-only, bounded initialization verified from an included launcher config. */
  registrationPrelude?: 'LOADER.COM' | 'mount d . -t cdrom\nLOADER.COM';
  registrationPreset?: 'ed4-dooky-directory-cd-experimental-v1';
}
export async function discardRegistration(draft?: Registration) {
  if (draft && !draft.committed && draft.archive.musicPackId) {
    await discardStagedMusic(draft.archive.musicPackId);
    draft.archive.musicPackId = undefined;
  }
}
export async function prepareRegistration(
  input: SourceInput[] | File, name: string, kind: ProfileKind, base: Profile | undefined,
  progress: (message: string, details?: ImportProgress) => void, signal: AbortSignal,
): Promise<Registration> {
  if (kind === "patch" && !base) throw Error("모드 A는 먼저 등록한 원본 프로필을 선택하세요.");
  const result = await importSources(input, name, false, progress, signal);
  try {
    checkCancelled(signal);
    if (kind !== "patch" && !Object.keys(result.archive.files).length) throw Error("게임 본체가 없습니다. RAW 음악만 있는 폴더 대신 실행 파일이 들어 있는 전체 게임을 선택하세요.");
    const baseArchive = kind === "patch" ? await getArchive(base!.baseId) : undefined;
    if (result.archive.size + (baseArchive?.size ?? 0) > 256 * 1024 * 1024) throw Error("본체와 수정 파일 합계가 256 MiB 제한을 넘습니다.");
    const combined = compose(baseArchive?.files ?? {}, [result.archive.files]);
    const ownMusic = result.pack ? { packId: result.pack.id, prefix: "", sourceArchiveId: result.archive.id } : undefined;
    const inherited = kind === "patch" ? base?.music : undefined;
    const music = inherited && ownMusic
      ? { ...inherited, overlays: [...(inherited.overlays ?? []), ownMusic] }
      : ownMusic ?? inherited;
    const baseMusic = inherited ? await resolvedTracks(base!) : [];
    const musicConflicts = (result.pack?.tracks ?? []).filter(t => baseMusic.some(b => b.path === t.path)).map(t => t.path);
    const paths = [...baseMusic.map(t => t.path), ...(result.pack?.tracks.map(t => t.path) ?? [])];
    checkCancelled(signal);
    return { archive: result.archive, files: combined.files, kind, base, baseArchive, analysis: analyzeLaunch(combined.files, paths), conflicts: [...new Set([...combined.conflicts, ...musicConflicts])], music, committed: false };
  } catch (error) {
    if (result.pack) await discardStagedMusic(result.pack.id);
    throw error;
  }
}
export async function commitRegistration(draft: Registration, executable: string, manual: boolean, signal: AbortSignal): Promise<Profile> {
  checkCancelled(signal);
  if (draft.committed) throw Error("이미 완료한 등록입니다.");
  validateExecutable(executable, draft.files);
  const profile: Profile = {
    id: id(), gameId: "ed4", engineId: "js-dos-v7",
    name: draft.archive.name.replace(/\.zip$/i, "").slice(0,60) || "구영웅전설4",
    kind: draft.kind, baseId: draft.baseArchive?.id ?? draft.archive.id,
    patchIds: draft.kind === "patch" ? [draft.archive.id] : [],
    executable, settings: { ...(draft.kind === "patch" ? draft.base?.settings : undefined) ?? DEFAULT_SETTINGS },
    createdAt: Date.now(), music: draft.music,
    requiredBaseVersion: draft.baseArchive ? identity(draft.baseArchive).versionId : undefined,
    launch: manual ? manualLaunchChoice(draft.analysis, executable, draft.files) : launchChoice(draft.analysis, executable, false),
  };
  if(draft.registrationPrelude && draft.kind !== 'patch') profile.settings.prelude = draft.registrationPrelude;
  if(draft.registrationPreset && profile.launch) {
    profile.launch.presetId=draft.registrationPreset;
    profile.launch.initialization=draft.registrationPrelude!.split('\n');
  }
  // OPFS handles/metadata must be accessible before linking the profile.
  await musicMounts(profile, draft.files);
  checkCancelled(signal);
  await importCommit('profileDb',()=>putProfile(profile, [draft.archive], signal));
  draft.committed = true;
  return profile;
}
export function importAdvice(error: unknown) {
  const message = storageError(error);
  if (error instanceof DOMException && error.name === "AbortError") return "등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.";
  if (/저장 공간/.test(message)) return message;
  if (/ASCII|8\.3|경로/.test(message)) return message + "\n실행 파일과 폴더 이름을 확인하세요. 파일 이름은 자동 변경하지 않았습니다.";
  if (/ZIP|CRC|압축/.test(message)) return message + "\n압축 해제된 원본 게임 폴더를 선택하거나 ZIP의 손상 여부를 확인하세요.";
  if (/음악|OPFS/.test(message)) return message + "\n브라우저 저장 권한과 여유 공간을 확인하세요. 기존 게임·음악·세이브는 삭제하지 않았습니다.";
  return message + "\n게임 폴더 전체와 저장 공간을 확인하고 다시 시도하세요. 기존 자료는 유지됩니다.";
}
