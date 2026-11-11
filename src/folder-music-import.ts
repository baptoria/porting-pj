import { validateExecutable } from "./archive";
import { zipEntries } from "./zip-index";
import { selectGameFolder, type FolderScan } from "./folder-registration";
import { isoMusicSources, IsoMusicError } from "./iso-music";
import { prepareRegistration, type Registration } from "./simple-registration";
import { publicImportError } from "./import-messages";
import type { SourceInput, ImportProgress } from "./source-import";
import type { Profile, ProfileKind } from "./model";
import { bootPlan } from "./boot-trace";
import type {DookyAutoPlan, DookyDecision} from './dooky-auto';
import {packagedText,startupCommands} from './packaged-text';

export function folderMusicPlan(scan: FolderScan, root: string, patch = false) {
  const selected = selectGameFolder(scan, root),
    prefix = root ? root + "/" : "";
  const gameRoots = scan.files
    .filter((f) => /(^|\/)GAME\.BAT$/i.test(f.path))
    .map((f) => f.path.slice(0, -8).replace(/\/$/, ""));
  // A nested GAME.BAT represents a separate installation, never an automatic layer.
  const nested =
    !patch && gameRoots.includes(root)
      ? gameRoots.filter((p) => p !== root && p.startsWith(prefix))
      : [];
  const files = selected.files.filter(
    (f) => !nested.some((p) => (prefix + f.path).startsWith(p + "/")),
  );
  const notes: string[] = [];
  if (nested.length)
    notes.push("다른 하위 게임 설치본은 함께 등록하지 않습니다.");
  const images = scan.files.filter(
    (f) =>
      /(^|\/)ED4\.ISO$/i.test(f.path) &&
      !nested.some((p) => f.path.startsWith(p + "/")),
  );
  const inside = images.filter((f) => f.path.startsWith(prefix));
  let candidates = inside;
  if (!inside.length) {
    // Only selected FileList ancestors; no filesystem access outside the picker grant.
    const parts = root.split("/").filter(Boolean);
    for (let n = parts.length - 1; n >= 0; n--) {
      const base = parts.slice(0, n).join("/"),
        prefix = base ? base + "/" : "",
        paths = [prefix + "DosBox/CD/ED4.iso", prefix + "ED4.iso"];
      candidates = images.filter((f) =>
        paths.some((path) => f.path.toUpperCase() === path.toUpperCase()),
      );
      if (candidates.length) break;
    }
  }
  let iso = candidates.length === 1 ? candidates[0] : undefined;
  const configPath =
    iso && /(^|\/)DosBox\/CD\/ED4\.iso$/i.test(iso.path)
      ? iso.path.replace(/CD\/ED4\.iso$/i, "autoexec.conf")
      : undefined;
  const configuredRoot =
    iso && configPath
      ? iso.path.replace(/DosBox\/CD\/ED4\.iso$/i, "ED4")
      : undefined;
  const startup =
    configPath && configuredRoot?.toUpperCase() === root.toUpperCase()
      ? scan.files.find(
          (f) => f.path.toUpperCase() === configPath.toUpperCase(),
        )
      : undefined;
  if (candidates.length > 1)
    notes.push(
      "음악 이미지가 여러 개여서 자동 연결하지 않았습니다. 설치본 하나가 있는 폴더를 선택하거나 음악을 별도로 연결하세요.",
    );
  const directRaw = files.filter((f) => /\.RAW$/i.test(f.path)).length;
  if (iso && directRaw) {
    iso = undefined;
    notes.push(
      `폴더에 포함된 RAW 음악 ${directRaw}개를 사용합니다. ISO 음악은 중복 저장하지 않습니다.`,
    );
  }
  if (
    iso &&
    configuredRoot &&
    configuredRoot.toUpperCase() !== root.toUpperCase() &&
    gameRoots.some((p) => p.toUpperCase() === configuredRoot.toUpperCase())
  ) {
    iso = undefined;
    notes.push(
      "다른 설치본 옆의 ISO는 자동으로 합치지 않습니다. 음악은 별도로 연결할 수 있습니다.",
    );
  }
  if (patch && iso) {
    iso = undefined;
    notes.push(
      "수정 파일 등록은 ISO를 자동으로 합치지 않습니다. 음악은 별도로 연결할 수 있습니다.",
    );
  }
  if (!patch && !iso && !directRaw && !candidates.length)
    notes.push(
      "음악 이미지가 보이지 않습니다. 음악이 필요하면 상위 폴더까지 선택하거나 등록 후 음악을 별도로 연결하세요.",
    );
  return {
    ...selected,
    files,
    needsRootChoice:
      !patch && gameRoots.length > 1 && !gameRoots.includes(root),
    iso,
    startup: patch ? undefined : startup,
    notes,
    directRaw,
    excluded: scan.files.length - files.length - (iso ? 1 : 0),
  };
}
export async function dookyPrelude(config: Blob, signal: AbortSignal, explicitEncoding=false) {
  if(explicitEncoding){
    const {text}=await packagedText(config,signal);
    if(!startupCommands(text))throw new IsoMusicError("동봉 실행 설정의 명령 순서를 확인하지 못했습니다.");
    return "LOADER.COM" as const;
  }
  if (config.size > 16384)
    throw new IsoMusicError(
      "실행 설정이 커서 초기화 순서를 자동 적용하지 않았습니다.",
    );
  const text = new TextDecoder("latin1").decode(await config.arrayBuffer());
  signal.throwIfAborted();
  const sections = text.split(/\[NEW\]/i).slice(1);
  if (!sections.length || sections.length > 8)
    throw new IsoMusicError(
      "두기 실행 설정의 초기화 순서를 확인하지 못했습니다.",
    );
  for (const section of sections) {
    const commands = section
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^(TITLE|EXECUTER|CFGFILE):/i.test(s));
    if (
      commands.map((s) => s.toUpperCase()).join("\n") !==
      "CD ED4\nLOADER.COM\nGAME.BAT"
    )
      throw new IsoMusicError(
        "실행 설정에 다른 명령이 있어 초기화 순서를 자동 적용하지 않았습니다.",
      );
  }
  return "LOADER.COM" as const;
}
/** Optional packaged save backups are not live DOS save files. Only exclude a
 * bounded, verified archive with the observed save-only directory; never unpack it.
 * Keep unknown/ASCII game resources for normal path validation. */
export async function separateSaveArchives(
  input: SourceInput[],
  signal: AbortSignal,
) {
  const files: SourceInput[] = [],
    excluded: string[] = [];
  for (const f of input) {
    signal.throwIfAborted();
    if (
      /^SAVE\/[^/]+\.ZIP$/i.test(f.path) &&
      /[^\x20-\x7e]/.test(f.path) &&
      f.file.size <= 1024 * 1024
    ) {
      try {
        const entries = await zipEntries(f.file, async (blob) => {
          signal.throwIfAborted();
          return new Uint8Array(await blob.arrayBuffer());
        });
        signal.throwIfAborted();
        if (
          entries.length &&
          entries.length <= 100 &&
          entries.every(
            (e) => !e.directory && /^ED4_S[0-9_]{3}\.DAT$/.test(e.path),
          )
        ) {
          excluded.push(f.path);
          continue;
        }
      } catch (error) {
        signal.throwIfAborted();
      }
    }
    files.push(f);
  }
  return { files, excluded };
}
export type MusicRegistration = Registration & {
  musicNotes?: string[];
  isoMusicCount?: number;
  isoMusicFailed?: boolean;
};
/** ISO is optional. A failed optional stream is rolled back by the existing importer
 * before a core-only retry; cancellation never retries or commits a profile. */
export async function prepareFolderMusic(
  input: SourceInput[],
  name: string,
  kind: ProfileKind,
  base: Profile | undefined,
  progress: (text: string, details?: ImportProgress) => void,
  signal: AbortSignal,
  iso?: SourceInput,
  notes: string[] = [],
  startup?: SourceInput,
  automatic?: DookyAutoPlan,
  decision?: DookyDecision,
): Promise<MusicRegistration> {
  let music: SourceInput[] = [],
    failed = false;
  const messages = [...notes];
  if ((iso || startup) && kind !== "patch") {
    const auxiliaries = await separateSaveArchives(input, signal);
    input = auxiliaries.files;
    if (auxiliaries.excluded.length)
      messages.push(
        `압축 보관된 세이브 ${auxiliaries.excluded.length}개는 실행 파일에 포함하지 않았습니다. 원본은 그대로 보존되며 자동 복원하지 않습니다.`,
      );
  }
  const reason = (error: unknown) =>
    error instanceof IsoMusicError ? error.message : publicImportError(error);
  if (iso) {
    try {
      progress("게임 파일 확인 완료 · ISO 음악 분석 중…");
      const result = await isoMusicSources(iso.file, signal, progress);
      music = result.inputs;
      if (result.warnings.length) {
        failed = true;
        messages.push(
          `음악 ${result.warnings.length}개 항목을 연결하지 못했습니다. ${result.warnings[0]}`,
        );
      }
      progress(`음악 파일 ${music.length}개 발견 · 음악 저장 준비 중…`);
    } catch (error) {
      signal.throwIfAborted();
      failed = true;
      messages.push(reason(error));
    }
  }
  let startupPrelude: "LOADER.COM" | undefined;
  if (startup && kind !== "patch") {
    try {
      startupPrelude = await dookyPrelude(startup.file, signal, !!decision);
    } catch (error) {
      signal.throwIfAborted();
      messages.push(reason(error));
    }
  }
  signal.throwIfAborted();
  let draft: Registration;
  try {
    draft = await prepareRegistration(
      [...input, ...music],
      name,
      kind,
      base,
      progress,
      signal,
    );
  } catch (error) {
    signal.throwIfAborted();
    if (!music.length) throw error;
    // No changes to an existing profile: prepareRegistration has not committed it.
    failed = true;
    messages.push(reason(error));
    music = [];
    progress("음악을 보관하지 못해 게임 파일만 등록하고 있습니다…");
    draft = await prepareRegistration(
      input,
      name,
      kind,
      base,
      progress,
      signal,
    );
  }
  if (startupPrelude) {
    if (!draft.files["LOADER.COM"])
      messages.push(
        "실행 설정이 요청한 LOADER.COM이 없습니다. 게임 실행 시 초기화가 실패할 수 있습니다.",
      );
    else {
      // Included launcher metadata identifies an ordinary DOS entry, not a trace
      // transformation. PE/NE heuristics must not remove an explicitly supplied
      // initialization command or block a DOS-compatible executable stub.
      try {
        validateExecutable(startupPrelude, draft.files);
        draft.registrationPrelude = startupPrelude;
      } catch {
        messages.push("초기화 파일의 실행 경로를 확인해 주세요.");
      }
    }
  }
  if (draft.registrationPrelude) {
    const game = draft.analysis.candidates.find((c) => c.path === "GAME.BAT");
    if (game?.entrySafe && !game.missing.length) {
      game.blocked = false;
      draft.analysis.automatic = "GAME.BAT";
      draft.analysis.reason =
        "동봉된 실행 설정에서 GAME.BAT를 확인했습니다. 실제 게임 호환성은 실행 결과로 확인합니다.";
    }
  }
  // Reuse the existing conservative BAT parser for attached DOS switches / > NUL.
  // Never execute its generated trace BAT; the original entry remains unchanged.
  if (iso && !draft.analysis.automatic) {
    const games = draft.analysis.candidates.filter(
      (c) => c.path === "GAME.BAT",
    );
    if (games.length === 1 && games[0].entrySafe && !games[0].missing.length) {
      const plan = bootPlan(draft.files, "GAME.BAT");
      if (
        !plan.issues.length &&
        plan.steps.some((s) => s.program) &&
        plan.steps.every(
          (s) => s.program || /^(ECHO(?:\s|$)|CLS$)/i.test(s.command),
        )
      ) {
        games[0].warnings = [];
        games[0].blocked = false;
        draft.analysis.automatic = "GAME.BAT";
      }
    }
  }
  const musicPath=[...music,...input.filter(f=>/\.RAW$/i.test(f.path))].some(f=>/^EFFECT\/[^/]+\.RAW$/i.test(f.path));
  if(automatic && kind!=='patch' && draft.music && musicPath && draft.registrationPrelude==='LOADER.COM') {
    // Only this newly prepared profile is changed. Native DOSBox MSCDEX exposes
    // extracted songs as a read-only directory CD; never claim an ISO is mounted.
    draft.music={...draft.music,prefix:'ED4'};
    draft.registrationPrelude='mount d . -t cdrom\nLOADER.COM';
    draft.registrationPreset='ed4-dooky-directory-cd-experimental-v1';
    messages.push('동봉 실행 설정과 음악 경로를 확인하여 실행 환경을 자동 연결했습니다.');
  } else if(automatic) messages.push('음악 연결이 완료되지 않아 CD 실행 환경을 적용하지 않았습니다. 게임 본체와 기존 자료는 유지됩니다.');
  if(decision)draft.registrationDecision={...decision,application:{applied:!!draft.registrationPreset,reason:draft.registrationPreset?'applied':!automatic?'not-detected':!draft.music?'music-unavailable':!musicPath?'music-path-unavailable':draft.registrationPrelude!=='LOADER.COM'?'startup-not-applied':'not-applied',musicPath,prelude:draft.registrationPrelude==='mount d . -t cdrom\nLOADER.COM',entry:draft.analysis.automatic==='GAME.BAT'}};
  return Object.assign(draft, {
    musicNotes: messages,
    isoMusicCount: music.length,
    isoMusicFailed: failed,
  });
}
