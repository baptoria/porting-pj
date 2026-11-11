import { it, expect } from "vitest";
import {
  detectDookyFolder,
  inspectDookyFolder,
  autoBootReport,
  DOOKY_CD_PRESET,
} from "../src/dooky-auto";
import { scanGameFolder } from "../src/folder-registration";
import { folderMusicPlan } from "../src/folder-music-import";
import { isoBlob, rawTone } from "../scripts/iso-fixture.mjs";
const config = "[NEW]\nTITLE:example\nCD ED4\nLOADER.COM\nGAME.BAT";
const bat =
  "@ECHO OFF\nLOGO.EXE\nSOUNDRV.COM\nDRIVER.EXE ED4.EXE\nSOUNDRV.COM/U\n@ECHO ON";
function fixture(changes: Record<string, Blob | string | null> = {}) {
  const data: Record<string, Blob | string | null> = {
    "ED4/GAME.BAT": bat,
    "ED4/ED4/GAME.BAT": "OTHER.EXE",
    "ED4/ED4/OTHER.EXE": "different installation",
    "DosBox/autoexec.conf": config,
    "DosBox/Settings.conf": "private=not-exported\x01CD=1",
    "DosBox/CD/ED4.iso": isoBlob({ "ED4/EFFECT/USER.RAW": rawTone() }),
  };
  for (const name of [
    "LOGO.EXE",
    "SOUNDRV.COM",
    "DRIVER.EXE",
    "ED4.EXE",
    "LOADER.COM",
  ])
    data["ED4/" + name] = "user modified bytes: no hash/size gate";
  Object.assign(data, changes);
  return scanGameFolder(
    Object.entries(data)
      .filter(([, v]) => v !== null)
      .map(([path, value]) =>
        Object.assign(new File([value!], path.split("/").at(-1)!), {
          webkitRelativePath: "user-folder/" + path,
        }),
      ),
  );
}
const detect = (s = fixture()) =>
  detectDookyFolder(s, new AbortController().signal);
it("selects configured outer installation using independent evidence, no game hash gate", async () => {
  const scan = fixture(),
    plan = await detect(scan);
  expect(plan?.root).toBe("ED4");
  expect(plan?.evidence).toHaveLength(4);
  const selected = folderMusicPlan(scan, plan!.root);
  expect(selected.files.some((f) => f.path.startsWith("ED4/"))).toBe(false);
  expect(selected.iso).toBeDefined();
  expect(JSON.stringify(plan)).not.toContain("private");
});
it.each([
  "DosBox/autoexec.conf",
  "DosBox/Settings.conf",
  "DosBox/CD/ED4.iso",
  "ED4/LOADER.COM",
  "ED4/DRIVER.EXE",
])(
  "does not infer environment from packaging names without %s",
  async (path) => {
    expect(await detect(fixture({ [path]: null }))).toBeUndefined();
  },
);
it("rejects inconsistent branches, CD declaration and unrecognized batch for auto configuration only", async () => {
  for (const changes of [
    { "DosBox/autoexec.conf": config + "\n[NEW]\nCD ED4/ED4\nGAME.BAT" },
    { "DosBox/Settings.conf": "CD=0" },
    { "DosBox/Settings.conf": "CD=1\nCD=0" },
    { "ED4/GAME.BAT": bat + "\nOTHER.EXE" },
    { "DosBox/CD/ED4.iso": new Blob(["broken"]) },
  ] as Record<string, Blob | string | null>[])
    expect(await detect(fixture(changes))).toBeUndefined();
});
it("does not require stock file sizes, raw count, upper case or exact batch spacing", async () => {
  const scan = fixture({
    "ED4/GAME.BAT": bat
      .replace("SOUNDRV.COM/U", "SOUNDRV.COM /U > NUL")
      .toLowerCase(),
  });
  expect(await detect(scan)).toBeDefined();
});
it("does not choose between two complete independent configured packages", async () => {
  const a = fixture(),
    b = fixture();
  a.files = a.files
    .map((f) => ({ ...f, path: "A/" + f.path }))
    .concat(b.files.map((f) => ({ ...f, path: "B/" + f.path })));
  a.roots = ["", "A/ED4", "B/ED4"];
  expect(await detect(a)).toBeUndefined();
});
it("cancellation is never swallowed as unknown installation", async () => {
  const c = new AbortController();
  c.abort();
  await expect(detectDookyFolder(fixture(), c.signal)).rejects.toThrow();
});
it("reads explicit UTF-16LE BOM in packaged Settings.conf without guessing unknown encodings", async () => {
  const settings = Buffer.from(
    "\ufeffprivate=not-exported\x01CD=1\x01Floppy=0",
    "utf16le",
  );
  expect(
    await detect(fixture({ "DosBox/Settings.conf": new Blob([settings]) })),
  ).toBeDefined();
  expect(
    await detect(
      fixture({ "DosBox/Settings.conf": new Blob([settings.subarray(2)]) }),
    ),
  ).toBeUndefined();
});
it("diagnostics distinguish configured directory CD, observed request, failures and unobserved menu", () => {
  const p: any = {
    executable: "GAME.BAT",
    launch: { presetId: DOOKY_CD_PRESET },
  };
  const report = autoBootReport(
    p,
    [
      "Drive D is mounted as CDRom ./",
      "MSCDEX: INT 2F 1500",
      "Music System Installation Failed",
    ],
    { music: { reads: 0, bytes: 0 } },
  );
  expect(report.cd?.imageMounted).toBe(false);
  expect(report.musicInitialization).toBe("failed");
  expect(report.menuReached).toBe("requires-screen-observation");
  expect(autoBootReport(undefined, [], {}).distribution).toBe(
    "unclassified-or-existing",
  );
});

it("HF1 records exact failed check without swallowing config errors", async () => {
  const c = new AbortController();
  for (const [changes, reason] of [
    [
      { "DosBox/Settings.conf": null },
      "missing-or-ambiguous-packaged-settings",
    ],
    [
      { "DosBox/autoexec.conf": "[NEW]\nCD ED4\nOTHER.COM\nGAME.BAT" },
      "unsupported-packaged-startup",
    ],
    [
      { "DosBox/autoexec.conf": new Blob([new Uint8Array([255, 254, 65])]) },
      "unreadable-or-invalid-dosboxConfig",
    ],
    [
      { "ED4/GAME.BAT": bat + "\nDELETE.EXE" },
      "unsupported-batch-flow-or-encoding",
    ],
    [
      { "DosBox/CD/ED4.iso": new Blob(["bad"]) },
      "unreadable-or-invalid-isoMusic",
    ],
  ] as [Record<string, Blob | string | null>, string][]) {
    const r = await inspectDookyFolder(fixture(changes), c.signal);
    expect(r.plan).toBeUndefined();
    expect(r.report.reason).toBe(reason);
    if(reason==='missing-or-ambiguous-packaged-settings')expect(r.report.checks.dosboxConfig).toBeNull();
    expect(JSON.stringify(r.report)).not.toContain("user-folder");
  }
});
it("HF1 supports explicit startup BOM and equivalent whitespace/CR, not altered commands", async () => {
  const startup = "[NEW]\rTITLE:local\r@CD   ED4\r@LOADER.COM\r@GAME.BAT";
  const r = await inspectDookyFolder(
    fixture({
      "DosBox/autoexec.conf": new Blob([
        Buffer.from("\ufeff" + startup, "utf16le"),
      ]),
      "DosBox/Settings.conf": "CD = 1\r",
      "ED4/GAME.BAT": bat.replaceAll("\n", "\r\n"),
    }),
    new AbortController().signal,
  );
  expect(r.report.detected).toBe(true);
  expect(r.report.encodings.startup).toBe("utf-16le");
  expect(r.plan?.root).toBe("ED4");
  expect(
    await detect(
      fixture({ "DosBox/autoexec.conf": startup + "\rMOUNT C OTHER" }),
    ),
  ).toBeUndefined();
});
it("HF1 inner folder cannot borrow inaccessible parent ISO or configuration", async () => {
  const scan = fixture();
  scan.files = scan.files
    .filter((f) => f.path.startsWith("ED4/"))
    .map((f) => ({ ...f, path: f.path.slice(4) }));
  scan.roots = ["", "ED4"];
  scan.preferred = "";
  const r = await inspectDookyFolder(scan, new AbortController().signal);
  expect(r.plan).toBeUndefined();
  expect(r.report.reason).toBe("iso-outside-selection-or-missing");
});
it("HF1 rechecks chosen root without merging nested installations", async () => {
  const c = new AbortController();
  expect(
    (await inspectDookyFolder(fixture(), c.signal, "ED4")).plan?.root,
  ).toBe("ED4");
  expect(
    (await inspectDookyFolder(fixture(), c.signal, "ED4/ED4")).report.reason,
  ).toBe("configured-game-root-not-selected-or-missing");
});

it("HF1 refuses bare-CR BAT auto configuration: pinned DOS shell does not treat CR alone as a command delimiter", async () => {
  const r = await inspectDookyFolder(
    fixture({ "ED4/GAME.BAT": bat.replaceAll("\n", "\r") }),
    new AbortController().signal,
  );
  expect(r.report.reason).toBe("unsupported-batch-flow-or-encoding");
  expect(r.plan).toBeUndefined();
});
