import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { bootPlan } from "../src/boot-trace";
import { dosNeStub } from "../src/dos-ne";
import { dookyPrelude } from "../src/folder-music-import";
const text = (s: string) => new TextEncoder().encode(s);
// Synthetic MZ image with a DOS exit stub and NE target metadata. No game bytes.
export function neFixture(target = 5) {
  const b = new Uint8Array(256),
    d = new DataView(b.buffer);
  b.set([77, 90]);
  d.setUint16(2, 128, true);
  d.setUint16(4, 1, true);
  d.setUint16(8, 4, true);
  d.setUint32(60, 128, true);
  b.set([0xb8, 0, 0x4c, 0xcd, 0x21], 64);
  b.set([78, 69], 128);
  b[128 + 0x36] = target;
  return b;
}
it("HF1 distinguishes bounded DOS MZ/NE5 from Windows NE, PE, truncation and bad entry", () => {
  expect(dosNeStub(neFixture())).toBe(true);
  for (const os of [0, 1, 2, 3, 4])
    expect(dosNeStub(neFixture(os))).toBe(false);
  const invalid = neFixture();
  new DataView(invalid.buffer).setUint16(20, 0xffff, true);
  expect(dosNeStub(invalid)).toBe(false);
  expect(dosNeStub(neFixture().subarray(0, 150))).toBe(false);
  const pe = neFixture();
  pe.set([80, 69, 0, 0], 128);
  expect(dosNeStub(pe)).toBe(false);
});
it("HF1 traces original DOS NE5 invocation plus only the exact native CD mount", () => {
  const bat = text("@DRIVER.EXE ED4.EXE\r\n"),
    files = {
      "GAME.BAT": bat,
      "DRIVER.EXE": neFixture(),
      "ED4.EXE": text("stub"),
      "LOADER.COM": text("stub"),
    };
  const plan = bootPlan(
    files,
    "GAME.BAT",
    "mount d . -t cdrom\nLOADER.COM",
    true,
  );
  expect(plan.issues).toEqual([]);
  expect(bootPlan(files, "GAME.BAT").issues.join()).toContain("PE/NE");
  expect(
    plan.steps.find((s) => s.program === "DRIVER.EXE")?.formatEvidence,
  ).toBe("DOS-MZ-stub-with-NE-target-5");
  expect(
    Object.values(plan.generated).some((b) =>
      new TextDecoder().decode(b).includes("@DRIVER.EXE ED4.EXE\r\n"),
    ),
  ).toBe(true);
  expect(files["GAME.BAT"]).toBe(bat);
  for (const mount of [
    "mount c . -t cdrom",
    "mount d OTHER -t cdrom",
    "mount d . -t cdrom & exit",
    "mount d . -t cdrom > NUL",
  ])
    expect(
      bootPlan(files, "GAME.BAT", mount, true).issues.length,
    ).toBeGreaterThan(0);
  for (const os of [0, 1, 2, 4])
    expect(
      bootPlan(
        { ...files, "DRIVER.EXE": neFixture(os) },
        "GAME.BAT",
        "",
        true,
      ).issues.join(),
    ).toContain("PE/NE");
});
it("HF1 reproduces old Latin1-only rejection and verifies opt-in corrected parser", async () => {
  const b = new Blob([
      Buffer.from("\ufeff[NEW]\rCD ED4\rLOADER.COM\rGAME.BAT", "utf16le"),
    ]),
    c = new AbortController();
  await expect(dookyPrelude(b, c.signal)).rejects.toThrow();
  expect(await dookyPrelude(b, c.signal, true)).toBe("LOADER.COM");
});
it.skipIf(!process.env.ED4_Q_LOCAL_FOLDER)(
  "HF1 actual read-only DRIVER header and full original BAT trace",
  async () => {
    const root = process.env.ED4_Q_LOCAL_FOLDER! + "/ED4/",
      files: any = {};
    for (const n of [
      "GAME.BAT",
      "DRIVER.EXE",
      "LOGO.EXE",
      "SOUNDRV.COM",
      "ED4.EXE",
      "LOADER.COM",
    ])
      files[n] = new Uint8Array(await readFile(root + n));
    expect(dosNeStub(files["DRIVER.EXE"])).toBe(true);
    const p = bootPlan(
      files,
      "GAME.BAT",
      "mount d . -t cdrom\nLOADER.COM",
      true,
    );
    expect(p.issues).toEqual([]);
    expect(p.steps.some((s) => s.program === "DRIVER.EXE")).toBe(true);
  },
);
