import type { FolderScan } from "./folder-registration";
import { dookyPrelude } from "./folder-music-import";
import { indexIso } from "./iso-music";
import type { Profile } from "./model";

export const DOOKY_CD_PRESET = "ed4-dooky-directory-cd-experimental-v1";
export const DOOKY_CD_PRELUDE = "mount d . -t cdrom\nLOADER.COM" as const;
export interface DookyAutoPlan {
  root: string;
  evidence: string[];
}
const upper = (s: string) => s.toUpperCase();

/** New developer imports only. No filename/hash allowlist, host paths or binary hooks.
 * Require matching packaged startup, actual entry/files, CD declaration and ISO tree.
 * Ambiguous packages retain the existing registration path; never merge installations. */
export async function detectDookyFolder(
  scan: FolderScan,
  signal: AbortSignal,
): Promise<DookyAutoPlan | undefined> {
  const matches: DookyAutoPlan[] = [];
  const one = (path: string) => {
    const found = scan.files.filter((f) => upper(f.path) === upper(path));
    return found.length === 1 ? found[0] : undefined;
  };
  const read = async (blob: Blob) => {
    if (blob.size > 16384) throw Error("config-size");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    // Settings.conf in the observed package is BOM-marked UTF-16LE; BAT and
    // autoexec command tokens are ASCII. Never reinterpret unknown path encodings.
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? "utf-16le"
        : bytes[0] === 254 && bytes[1] === 255
          ? "utf-16be"
          : bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191
            ? "utf-8"
            : "latin1";
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  };
  for (const iso of scan.files.filter((f) =>
    /(^|\/)DOSBOX\/CD\/ED4\.ISO$/i.test(f.path),
  )) {
    signal.throwIfAborted();
    const ancestor = iso.path.replace(/DosBox\/CD\/ED4\.iso$/i, ""),
      expected = ancestor + "ED4";
    const roots = scan.roots.filter((r) => upper(r) === upper(expected));
    if (roots.length !== 1) continue;
    const root = roots[0],
      config = one(ancestor + "DosBox/autoexec.conf"),
      settings = one(ancestor + "DosBox/Settings.conf");
    const bat = one(root + "/GAME.BAT");
    if (
      !config ||
      !settings ||
      !bat ||
      !["ED4.EXE", "DRIVER.EXE", "LOGO.EXE", "SOUNDRV.COM", "LOADER.COM"].every(
        (n) => one(root + "/" + n),
      )
    )
      continue;
    try {
      await dookyPrelude(config.file, signal);
      const cd = (await read(settings.file))
        .split(/[\x01\r\n]/)
        .map((s) => s.trim())
        .filter((s) => /^CD=/i.test(s));
      if (cd.length !== 1 || cd[0].toUpperCase() !== "CD=1") continue;
      const commands = (await read(bat.file))
        .split(/\r?\n/)
        .map((s) => s.trim().replace(/^@/, "").toUpperCase())
        .filter((s) => s && !/^(ECHO(?:\s|$)|REM(?:\s|$)|::)/.test(s))
        .map((s) =>
          s
            .replace(/\s*>\s*NUL\s*$/, "")
            .replace(/\s+/g, " ")
            .replace("SOUNDRV.COM /U", "SOUNDRV.COM/U"),
        );
      if (
        commands.join("\n") !==
        "LOGO.EXE\nSOUNDRV.COM\nDRIVER.EXE ED4.EXE\nSOUNDRV.COM/U"
      )
        continue;
      const index = await indexIso(iso.file, signal);
      if (
        !index.entries.some(
          (e) => !e.directory && /^ED4\/EFFECT\/[^/]+\.RAW$/.test(e.path),
        )
      )
        continue;
      matches.push({
        root,
        evidence: [
          "packaged-startup:CD ED4 / LOADER.COM / GAME.BAT",
          "packaged-CD=1",
          "batch:LOGO / SOUNDRV / DRIVER ED4",
          "ISO9660:ED4/EFFECT/RAW",
        ],
      });
    } catch {
      signal.throwIfAborted(); /* Optional identification must not veto normal import. */
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
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
          "matching-packaged-startup",
          "CD=1",
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
