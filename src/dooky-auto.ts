import type { FolderScan } from "./folder-registration";
import { indexIso } from "./iso-music";
import type { Profile } from "./model";
import { packagedText, startupCommands } from "./packaged-text";

export const DOOKY_CD_PRESET = "ed4-dooky-directory-cd-experimental-v1";
export const DOOKY_CD_PRELUDE = "mount d . -t cdrom\nLOADER.COM" as const;
export interface DookyAutoPlan {
  root: string;
  evidence: string[];
}
export interface DookyDecision {
  version: 1;
  detected: boolean;
  reason: string;
  checks: Record<
    "root" | "gameFiles" | "dosboxConfig" | "settings" | "batch" | "isoMusic",
    boolean | null
  >;
  encodings: Record<string, string>;
  missing: string[];
  rule?: "packaged-settings" | "structure-batch-iso";
  configuration?: {
    startup: "absent" | "present" | "ambiguous";
    settings: "absent" | "present" | "ambiguous";
  };
  configurationElsewhere?: { startup: number; settings: number };
  selection: {
    files: number;
    roots: number;
    images: number;
    rootDepth: number | null;
    rootAtSelection: boolean;
  };
  application?: {
    applied: boolean;
    reason: string;
    musicPath: boolean;
    prelude: boolean;
    entry: boolean;
  };
}
export interface DookyInspection {
  plan?: DookyAutoPlan;
  report: DookyDecision;
}
const upper = (s: string) => s.toUpperCase();
const programs = [
  "ED4.EXE",
  "DRIVER.EXE",
  "LOGO.EXE",
  "SOUNDRV.COM",
  "LOADER.COM",
  "GAME.BAT",
];
/** Failure metadata is made from fixed labels/counts; never serialize File paths or config text. */
export async function inspectDookyFolder(
  scan: FolderScan,
  signal: AbortSignal,
  selectedRoot?: string,
): Promise<DookyInspection> {
  const images = scan.files.filter((f) =>
    /(^|\/)DOSBOX\/CD\/ED4\.ISO$/i.test(f.path),
  );
  const fresh = (): DookyDecision => ({
    version: 1,
    detected: false,
    reason: "iso-outside-selection-or-missing",
    checks: {
      root: null,
      gameFiles: null,
      dosboxConfig: null,
      settings: null,
      batch: null,
      isoMusic: null,
    },
    encodings: {},
    missing: [],
    selection: {
      files: scan.files.length,
      roots: scan.roots.length,
      images: images.length,
      rootDepth: null,
      rootAtSelection: scan.files.some((f) => upper(f.path) === "GAME.BAT"),
    },
  });
  const one = (p: string) => {
    const f = scan.files.filter((f) => upper(f.path) === upper(p));
    return f.length === 1 ? f[0] : undefined;
  };
  const matches: DookyInspection[] = [],
    failures: DookyInspection[] = [];
  signal.throwIfAborted();
  for (const iso of images.slice(0, 8)) {
    const r = fresh(),
      ancestor = iso.path.replace(/DosBox\/CD\/ED4\.iso$/i, ""),
      expected = ancestor + "ED4";
    const roots = scan.roots.filter((p) => upper(p) === upper(expected));
    const fail = (reason: string) => {
      r.reason = reason;
      failures.push({ report: r });
    };
    r.checks.root =
      roots.length === 1 &&
      (selectedRoot === undefined || upper(roots[0]) === upper(selectedRoot));
    if (!r.checks.root) {
      fail("configured-game-root-not-selected-or-missing");
      continue;
    }
    const root = roots[0];
    r.selection.rootDepth = root.split("/").length;
    r.missing = programs.filter((n) => !one(root + "/" + n));
    r.checks.gameFiles = !r.missing.length;
    if (!r.checks.gameFiles) {
      fail("missing-or-ambiguous-game-files");
      continue;
    }
    const config = one(ancestor + "DosBox/autoexec.conf"),
      settings = one(ancestor + "DosBox/Settings.conf");
    r.checks.dosboxConfig = config ? null : false;
    r.checks.settings = settings ? null : false;
    const presence = (name: string) => {
      const count = scan.files.filter(
        (f) => upper(f.path) === upper(ancestor + "DosBox/" + name),
      ).length;
      return count === 0 ? "absent" : count === 1 ? "present" : "ambiguous";
    };
    r.configuration = {
      startup: presence("autoexec.conf"),
      settings: presence("Settings.conf"),
    };
    const elsewhere = (name: string) =>
      scan.files.filter(
        (f) =>
          upper(f.path.split("/").at(-1)!) === upper(name) &&
          upper(f.path) !== upper(ancestor + "DosBox/" + name),
      ).length;
    r.configurationElsewhere = {
      startup: elsewhere("autoexec.conf"),
      settings: elsewhere("Settings.conf"),
    };
    if (Object.values(r.configuration).includes("ambiguous")) {
      fail("ambiguous-packaged-configuration");
      continue;
    }
    let stage = "dosboxConfig";
    try {
      if (config) {
        const c = await packagedText(config.file, signal);
        r.encodings.startup = c.encoding;
        r.checks.dosboxConfig = startupCommands(c.text);
        if (!r.checks.dosboxConfig) {
          fail("unsupported-packaged-startup");
          continue;
        }
      }
      stage = "settings";
      if (settings) {
        const setting = await packagedText(settings.file, signal);
        r.encodings.settings = setting.encoding;
        const cd = setting.text
          .split(/[\x01\r\n]/)
          .map((s) => s.trim())
          .filter((s) => /^CD\s*=/i.test(s));
        r.checks.settings = cd.length === 1 && /^CD\s*=\s*1$/i.test(cd[0]);
        if (!r.checks.settings) {
          fail("cd-declaration-not-unambiguous-enabled");
          continue;
        }
      }
      stage = "batch";
      const b = await packagedText(one(root + "/GAME.BAT")!.file, signal);
      r.encodings.batch = b.encoding;
      // BAT bytes are NOT transcoded for DOS. Encoded BAT is unsupported even if configs are UTF16.
      const commands = b.text
        .split(/\r\n|\n|\r/)
        .map((s) => s.trim().replace(/^@/, "").toUpperCase())
        .filter((s) => s && !/^(ECHO(?:\s|$)|REM(?:\s|$)|::)/.test(s))
        .map((s) =>
          s
            .replace(/\s*>\s*NUL\s*$/, "")
            .replace(/[ \t]+/g, " ")
            .replace("SOUNDRV.COM /U", "SOUNDRV.COM/U"),
        );
      r.checks.batch =
        b.encoding === "latin1" &&
        !/\r(?!\n)/.test(b.text) &&
        commands.join("\n") ===
          "LOGO.EXE\nSOUNDRV.COM\nDRIVER.EXE ED4.EXE\nSOUNDRV.COM/U";
      if (!r.checks.batch) {
        fail("unsupported-batch-flow-or-encoding");
        continue;
      }
      stage = "isoMusic";
      const index = await indexIso(iso.file, signal);
      r.checks.isoMusic = index.entries.some(
        (e) => !e.directory && /^ED4\/EFFECT\/[^/]+\.RAW$/i.test(e.path),
      );
      if (!r.checks.isoMusic) {
        fail("missing-iso-music-tree");
        continue;
      }
      r.detected = true;
      r.rule = config && settings ? "packaged-settings" : "structure-batch-iso";
      r.reason =
        r.rule === "packaged-settings"
          ? "matched"
          : "matched-without-complete-settings";
      matches.push({
        plan: {
          root,
          evidence: [
            config
              ? "packaged-startup:CD ED4 / LOADER.COM / GAME.BAT"
              : "same-package:ED4 + DosBox/CD/ED4.iso",
            settings ? "packaged-CD=1" : "required-programs:present-and-unique",
            "batch:LOGO / SOUNDRV / DRIVER ED4",
            "ISO9660:ED4/EFFECT/RAW",
          ],
        },
        report: r,
      });
    } catch {
      signal.throwIfAborted();
      r.checks[stage as keyof DookyDecision["checks"]] = false;
      fail("unreadable-or-invalid-" + stage);
    }
  }
  if (images.length > 8 || matches.length > 1) {
    const r = fresh();
    r.reason = "ambiguous-packages";
    return { report: r };
  }
  if (matches.length === 1) return matches[0];
  return failures[0] ?? { report: fresh() };
}
/** Compatibility wrapper; callers needing failure reasons use inspectDookyFolder. */
export async function detectDookyFolder(scan: FolderScan, signal: AbortSignal) {
  return (await inspectDookyFolder(scan, signal)).plan;
}

export function dookyAdvice(r: DookyDecision) {
  if (r.detected) return "";
  if (r.reason === "iso-outside-selection-or-missing")
    return "선택 범위에 DosBox/CD/ED4.iso가 없습니다. CD 음악이 있는 설치본이면 DosBox와 ED4를 함께 포함하는 상위 폴더를 선택하세요. 일반 게임은 현재 파일로 실행할 수 있습니다.";
  return `CD 실행 환경을 자동 확인하지 못했습니다 (${r.reason}). ${r.missing.length ? "누락/중복: " + r.missing.join(", ") + ". " : ""}ED4 게임 폴더와 DosBox/CD/ED4.iso를 함께 선택했는지 확인하세요. 설정 파일이 있으면 해당 내용도 일치해야 합니다. 일반 실행 설정은 유지했습니다.`;
}
/** Bounded metadata only. A launch request is not proof of menu/audio success. */
export function autoBootReport(
  profile: Profile | undefined,
  logs: readonly string[],
  metrics: any,
) {
  const detected = profile?.launch?.presetId === DOOKY_CD_PRESET;
  return {
    distribution: detected ? "dooky-configured-cd" : "unclassified-or-existing",
    evidence: detected
      ? [
          "confirmed-registration-preset (see decision for actual evidence)",
          "original-batch-and-programs",
          "ISO9660-music-tree",
        ]
      : [],
    selectedEntry: profile?.executable,
    workingDirectory:
      "C:\\" + (profile?.executable.split("/").slice(0, -1).join("\\") ?? ""),
    configuredEnvironmentUnchanged:
      detected &&
      profile?.settings?.prelude === DOOKY_CD_PRELUDE &&
      profile?.music?.prefix === "ED4",
    cd: detected
      ? {
          kind: "native-directory-cd",
          drive: "D",
          command: "mount d . -t cdrom",
          musicPath: "D:\\ED4\\EFFECT",
          imageMounted: false,
          limitation:
            "File-level CD projection of extracted music; no CDDA or sector-image emulation.",
        }
      : undefined,
    cdMountedLog: logs.some((s) => /Drive D is mounted as CDRom/.test(s)),
    mscdexQueryObserved: logs.some((s) => /MSCDEX: INT 2F 150[0B]/.test(s)),
    musicInitialization: logs.some((s) =>
      /Music System Installation Failed/.test(s),
    )
      ? "failed"
      : logs.some((s) => /Now Loading/.test(s))
        ? "passed-failure-branch-observed"
        : "unobserved",
    rawReads: metrics?.music?.reads ?? null,
    rawBytes: metrics?.music?.bytes ?? null,
    menuReached: "requires-screen-observation",
    audioAudibility: "requires-listening",
    note: "No game bytes or source host paths. No success inferred from missing error text.",
  };
}
