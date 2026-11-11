import { zipSync } from "fflate";
import { separateSaveArchives } from "../src/folder-music-import";
import { it, expect, vi, beforeEach } from "vitest";
import { scanGameFolder } from "../src/folder-registration";
import {
  folderMusicPlan,
  prepareFolderMusic,
  dookyPrelude,
} from "../src/folder-music-import";
import { prepareRegistration } from "../src/simple-registration";
import { isoBlob, rawTone } from "../scripts/iso-fixture.mjs";
vi.mock("../src/simple-registration", async (original) => ({
  ...(await original<typeof import("../src/simple-registration")>()),
  prepareRegistration: vi.fn(),
}));
const bytes = (s: string) => new TextEncoder().encode(s);
const file = (path: string) =>
  Object.assign(new File(["fixture"], path.split("/").at(-1)!), {
    webkitRelativePath: path,
  });
const draft = () =>
  ({
    archive: { files: {} },
    files: {},
    analysis: { candidates: [], reason: "fixture" },
    conflicts: [],
    committed: false,
  }) as any;
beforeEach(() => {
  vi.mocked(prepareRegistration).mockReset().mockResolvedValue(draft());
});
it("finds sibling ISO before narrowing the game root, never importing the desktop launcher", () => {
  const scan = scanGameFolder(
    [
      "pack/ED4/GAME.BAT",
      "pack/ED4/DATA.DAT",
      "pack/DosBox/CD/ED4.iso",
      "pack/DosBox/autoexec.conf",
      "pack/DosBox/DosBox.zip",
    ].map(file),
  );
  const plan = folderMusicPlan(scan, "ED4");
  expect(plan.iso?.path).toBe("DosBox/CD/ED4.iso");
  expect(plan.startup?.path).toBe("DosBox/autoexec.conf");
  expect(plan.files.map((f) => f.path)).toEqual(["GAME.BAT", "DATA.DAT"]);
});
it("isolates nested installations and requires a choice instead of merging all roots", () => {
  const scan = scanGameFolder(
    [
      "pack/ED4/GAME.BAT",
      "pack/ED4/ED4/GAME.BAT",
      "pack/ED4/ED4/EFFECT/OLD.RAW",
      "pack/DosBox/CD/ED4.iso",
    ].map(file),
  );
  expect(folderMusicPlan(scan, "").needsRootChoice).toBe(true);
  expect(folderMusicPlan(scan, "ED4").files.map((f) => f.path)).toEqual([
    "GAME.BAT",
  ]);
  expect(folderMusicPlan(scan, "ED4").iso).toBeTruthy();
  expect(folderMusicPlan(scan, "ED4/ED4").iso).toBeUndefined();
});
it("cannot discover an unselected ancestor or borrow another installation ISO", () => {
  const scan = scanGameFolder(
    ["pack/A/ED4/GAME.BAT", "pack/B/DosBox/CD/ED4.iso"].map(file),
  );
  expect(folderMusicPlan(scan, "A/ED4").iso).toBeUndefined();
  expect(
    folderMusicPlan(scanGameFolder([file("ED4/GAME.BAT")]), "").iso,
  ).toBeUndefined();
});
it("retains direct RAW bytes instead of replacing or duplicating them with ISO tracks", () => {
  const scan = scanGameFolder(
      [
        "pack/ED4/GAME.BAT",
        "pack/ED4/EFFECT/USER.RAW",
        "pack/DosBox/CD/ED4.iso",
      ].map(file),
    ),
    plan = folderMusicPlan(scan, "ED4");
  expect(plan.directRaw).toBe(1);
  expect(plan.iso).toBeUndefined();
  expect(plan.files[1].file).toBe(scan.files[1].file);
  expect(plan.notes.join()).toContain("중복 저장하지");
});
it("does not choose between multiple ISO images or attach an ISO to a resource-only patch", () => {
  const scan = scanGameFolder(
    ["pack/GAME.BAT", "pack/A/ED4.iso", "pack/B/ED4.iso"].map(file),
  );
  expect(folderMusicPlan(scan, "").iso).toBeUndefined();
  const patch = scanGameFolder(
    ["pack/MOD.DAT", "pack/ED4.iso"].map(file),
    true,
  );
  expect(folderMusicPlan(patch, "", true).iso).toBeUndefined();
  expect(folderMusicPlan(patch, "", true).files[0].path).toBe("MOD.DAT");
});
it("only accepts the observed bounded launcher startup, never shell fragments or PC settings", async () => {
  const signal = new AbortController().signal;
  expect(
    await dookyPrelude(
      new Blob([
        "[SELECT]\n[NEW]\nTITLE:example\nEXECUTER:DOSBox_ECE\nCFGFILE:DBECE.conf\nCD ED4\nLOADER.COM\nGAME.BAT",
      ]),
      signal,
    ),
  ).toBe("LOADER.COM");
  for (const text of [
    "[NEW]\nCD ED4\nLOADER.COM & EVIL.COM\nGAME.BAT",
    "[NEW]\nCD ED4\ncycles max\nLOADER.COM\nGAME.BAT",
    "[NEW]\nCD ..\nLOADER.COM\nGAME.BAT",
  ])
    await expect(dookyPrelude(new Blob([text]), signal)).rejects.toThrow();
});
const iso = {
  path: "DosBox/CD/ED4.iso",
  file: isoBlob({ "ED4/EFFECT/ED4-01.RAW": rawTone() }),
};
const body = [{ path: "GAME.BAT", file: new Blob(["TEST.COM"]) }];
it('new confirmed CD profile uses native mount and music prefix without modifying archive bytes',async()=>{
 const initial=draft();initial.files={'GAME.BAT':bytes('DRIVER.EXE ED4.EXE'),'LOADER.COM':bytes('modified loader')};initial.music={packId:'new-pack',prefix:''};
 const before=structuredClone(initial.files);vi.mocked(prepareRegistration).mockResolvedValue(initial);
 const r=await prepareFolderMusic(body,'game','vanilla',undefined,()=>{},new AbortController().signal,iso,[],{path:'DosBox/autoexec.conf',file:new Blob(['[NEW]\nCD ED4\nLOADER.COM\nGAME.BAT'])},{root:'ED4',evidence:[]});
 expect(r.registrationPrelude).toBe('mount d . -t cdrom\nLOADER.COM');expect(r.registrationPreset).toBe('ed4-dooky-directory-cd-experimental-v1');expect(r.music?.prefix).toBe('ED4');expect(r.files).toEqual(before);
});
it('missing music never creates a successful automatic CD environment',async()=>{
 const r=await prepareFolderMusic(body,'game','vanilla',undefined,()=>{},new AbortController().signal,undefined,[],undefined,{root:'ED4',evidence:[]});
 expect(r.registrationPreset).toBeUndefined();expect(r.musicNotes?.join()).toContain('적용하지 않았습니다');
});
it("passes bounded ISO slices into the original registration and does not retain ISO itself", async () => {
  const r = await prepareFolderMusic(
    body,
    "game",
    "vanilla",
    undefined,
    () => {},
    new AbortController().signal,
    iso,
  );
  const input = vi.mocked(prepareRegistration).mock.calls[0][0] as any[];
  expect(input.map((f) => f.path)).toEqual(["GAME.BAT", "EFFECT/ED4-01.RAW"]);
  expect(r.isoMusicCount).toBe(1);
  expect(r.isoMusicFailed).toBe(false);
});
it("a failed optional music stream retries core only after existing importer rollback", async () => {
  vi.mocked(prepareRegistration)
    .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"))
    .mockResolvedValueOnce(draft());
  const r = await prepareFolderMusic(
    body,
    "game",
    "vanilla",
    undefined,
    () => {},
    new AbortController().signal,
    iso,
  );
  expect(vi.mocked(prepareRegistration).mock.calls[1][0]).toEqual(body);
  expect(r.isoMusicFailed).toBe(true);
  expect(r.isoMusicCount).toBe(0);
  expect(r.musicNotes?.join()).toContain("저장 공간");
});
it("broken optional ISO does not block core; cancellation never retries or commits", async () => {
  const r = await prepareFolderMusic(
    body,
    "game",
    "vanilla",
    undefined,
    () => {},
    new AbortController().signal,
    { path: "ED4.iso", file: new Blob(["broken"]) },
  );
  expect(r.isoMusicFailed).toBe(true);
  expect(prepareRegistration).toHaveBeenCalledTimes(1);
  vi.mocked(prepareRegistration).mockClear();
  const abort = new AbortController();
  abort.abort();
  await expect(
    prepareFolderMusic(
      body,
      "game",
      "vanilla",
      undefined,
      () => {},
      abort.signal,
      iso,
    ),
  ).rejects.toThrow();
  expect(prepareRegistration).not.toHaveBeenCalled();
});
it("a safe attached-switch BAT keeps original bytes and receives new-profile-only startup", async () => {
  const d = draft(),
    bat = bytes(
      "@ECHO OFF\r\n@SOUNDRV.COM > NUL\r\n@DRIVER.EXE ED4.EXE\r\n@SOUNDRV.COM/U > NUL\r\n@ECHO ON",
    );
  d.files = {
    "GAME.BAT": bat,
    "SOUNDRV.COM": bytes("dos"),
    "DRIVER.EXE": bytes("dos"),
    "ED4.EXE": bytes("dos"),
    "LOADER.COM": bytes("dos"),
  };
  d.analysis.candidates = [
    {
      path: "GAME.BAT",
      entrySafe: true,
      missing: [],
      warnings: ["attached switch"],
      blocked: false,
    },
  ];
  vi.mocked(prepareRegistration).mockResolvedValue(d);
  const r = await prepareFolderMusic(
    body,
    "game",
    "vanilla",
    undefined,
    () => {},
    new AbortController().signal,
    iso,
    [],
    {
      path: "autoexec.conf",
      file: new Blob(["[NEW]\nCD ED4\nLOADER.COM\nGAME.BAT"]),
    },
  );
  expect(r.registrationPrelude).toBe("LOADER.COM");
  expect(r.analysis.automatic).toBe("GAME.BAT");
  expect(r.files["GAME.BAT"]).toBe(bat);
  expect(Object.keys(r.files).some((p) => p.startsWith("ET"))).toBe(false);
});

it("separates only verified packaged save backups, never live saves or unknown resources", async () => {
  const a = {
    path: "SAVE/보관.zip",
    file: new Blob([zipSync({ "ED4_S00_.DAT": bytes("save") })]),
  };
  const live = { path: "SAVE/ED4_S00_.DAT", file: new Blob(["current"]) };
  const unknown = {
    path: "SAVE/수정.zip",
    file: new Blob([zipSync({ "OTHER.DAT": bytes("resource") })]),
  };
  const r = await separateSaveArchives(
    [a, live, unknown],
    new AbortController().signal,
  );
  expect(r.excluded).toEqual([a.path]);
  expect(r.files).toEqual([live, unknown]);
  const c = new AbortController();
  c.abort();
  await expect(separateSaveArchives([a], c.signal)).rejects.toThrow();
});

it("launcher-selected ordinary entry is not blocked by PE/NE heuristics and does not rewrite it", async () => {
  const d = draft(),
    ne = new Uint8Array(128);
  ne[0] = 77;
  ne[1] = 90;
  ne[60] = 64;
  ne[64] = 78;
  ne[65] = 69;
  d.files = {
    "GAME.BAT": bytes("DRIVER.EXE ED4.EXE"),
    "DRIVER.EXE": ne,
    "ED4.EXE": bytes("dos"),
    "LOADER.COM": bytes("dos"),
  };
  d.analysis.candidates = [
    {
      path: "GAME.BAT",
      entrySafe: true,
      missing: [],
      warnings: ["PE/NE"],
      blocked: true,
    },
  ];
  vi.mocked(prepareRegistration).mockResolvedValue(d);
  const r = await prepareFolderMusic(
    body,
    "game",
    "vanilla",
    undefined,
    () => {},
    new AbortController().signal,
    iso,
    [],
    {
      path: "autoexec.conf",
      file: new Blob(["[NEW]\nCD ED4\nLOADER.COM\nGAME.BAT"]),
    },
  );
  expect(r.analysis.automatic).toBe("GAME.BAT");
  expect(r.registrationPrelude).toBe("LOADER.COM");
  expect(r.files["DRIVER.EXE"]).toBe(ne);
});

it("does not borrow another installation launcher initialization or its ISO", () => {
  const scan = scanGameFolder(
    [
      "pack/ED4/GAME.BAT",
      "pack/ED4/ED4/GAME.BAT",
      "pack/DosBox/CD/ED4.iso",
      "pack/DosBox/autoexec.conf",
    ].map(file),
  );
  const p = folderMusicPlan(scan, "ED4/ED4");
  expect(p.startup).toBeUndefined();
  expect(p.iso).toBeUndefined();
  expect(p.notes.join()).toContain("다른 설치본");
});

it('HF1 applies the same BOM-aware startup analysis during preparation, not only detection',async()=>{
 const d=draft();d.music={packId:'new-pack',prefix:''};d.files['LOADER.COM']=bytes('dos');vi.mocked(prepareRegistration).mockResolvedValue(d);
 const {inspectDookyFolder}=await import('../src/dooky-auto');
 const decision=(await inspectDookyFolder({name:'fixture',files:[],roots:[''],preferred:''},new AbortController().signal)).report;
 decision.detected=true;decision.reason='matched';
 const r=await prepareFolderMusic(body,'game','vanilla',undefined,()=>{},new AbortController().signal,iso,[],{path:'autoexec.conf',file:new Blob([Buffer.from('\ufeff[NEW]\r@CD ED4\rLOADER.COM\rGAME.BAT','utf16le')])},{root:'ED4',evidence:[]},decision);
 expect(r.registrationPrelude).toBe('mount d . -t cdrom\nLOADER.COM');expect(r.registrationDecision?.application?.applied).toBe(true);
});
