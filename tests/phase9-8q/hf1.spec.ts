import { test, expect, Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { folderFixture } from "../folder-fixture";
import { testProgram } from "../../scripts/test-program.mjs";
import { writeIsoFixture, rawTone } from "../../scripts/iso-fixture.mjs";
import { diagnostic, menu, stop } from "../phase9-8i/helpers";
const text = (s: string) => new TextEncoder().encode(s);
async function fixture(mode: "bom" | "missing" | "inner" | "multi") {
  const ret = new Uint8Array([0xb8, 0, 0x4c, 0xcd, 0x21]),
    files: any = {
      "ED4/GAME.BAT": text(
        "@ECHO OFF\r\nLOGO.EXE\r\nSOUNDRV.COM\r\nDRIVER.EXE ED4.EXE\r\nSOUNDRV.COM/U\r\n@ECHO ON",
      ),
      "ED4/DRIVER.EXE": testProgram(["D:\\ED4\\EFFECT\\ED4-01.RAW"], false),
      "ED4/ED4.EXE": ret,
      "ED4/LOGO.EXE": ret,
      "ED4/SOUNDRV.COM": ret,
      "ED4/LOADER.COM": ret,
    };
  if (mode === "inner")
    return folderFixture(
      Object.fromEntries(
        Object.entries(files).map(([p, v]) => [p.slice(4), v as Uint8Array]),
      ),
      "inner",
    );
  files["DosBox/autoexec.conf"] = Buffer.from(
    "\ufeff[NEW]\rTITLE:test\r@CD   ED4\rLOADER.COM\rGAME.BAT",
    "utf16le",
  );
  if (mode !== "missing") files["DosBox/Settings.conf"] = text("CD = 1\r");
  if (mode === "multi") {
    const both = Object.fromEntries(
      ["A", "B"].flatMap((prefix) =>
        Object.entries(files).map(([p, b]) => [
          prefix + "/" + p,
          b as Uint8Array,
        ]),
      ),
    );
    const folder = await folderFixture(both, "two-packages");
    for (const prefix of ["A", "B"]) {
      await mkdir(join(folder, prefix + "/DosBox/CD"), { recursive: true });
      await writeIsoFixture(join(folder, prefix + "/DosBox/CD/ED4.iso"), {
        "ED4/EFFECT/ED4-01.RAW": rawTone(),
      });
    }
    return folder;
  }
  const folder = await folderFixture(files, "hf1-" + mode);
  await mkdir(join(folder, "DosBox/CD"), { recursive: true });
  await writeIsoFixture(join(folder, "DosBox/CD/ED4.iso"), {
    "ED4/EFFECT/ED4-01.RAW": rawTone(),
  });
  return folder;
}
async function profiles(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-mobile-dev-v1");
      q.onsuccess = () => r(q.result);
    });
    return new Promise<any[]>((r) => {
      const q = db.transaction("profiles").objectStore("profiles").getAll();
      q.onsuccess = () => {
        db.close();
        r(q.result);
      };
    });
  });
}
for (const mode of ["bom", "missing", "inner"] as const)
  test(
    "HF1 selected folder " +
      mode +
      " records decision and keeps normal execution",
    async ({ page }) => {
      page.on("dialog", (d) => void d.accept());
      await page.goto("/porting-pj/ed4-dev/");
      await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
      await page.locator("#simple-import").click();
      await page.locator("#simple-folder").setInputFiles(await fixture(mode));
      if (mode === "inner") {
        await expect(page.locator("#simple-choice")).toBeVisible();
        await page.locator("#simple-executable").selectOption("GAME.BAT");
        await page.locator("#simple-confirm").click();
      }
      await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
      const p = (await profiles(page))[0];
      expect(p.launch.presetId).toBe(
        mode !== "inner"
          ? "ed4-dooky-directory-cd-experimental-v1"
          : "ed4-generic-experimental-v1",
      );
      const readDecision = () =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("ed4-dev:ed4-dooky-registration-v1")!,
            )[0],
        );
      expect((await readDecision()).decision.reason).toBe(
        mode === "bom" ? "matched" : mode === "missing" ? "matched-without-complete-settings" : "iso-outside-selection-or-missing",
      );
      await page.reload();
      await page.locator("#play").click();
      await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
      await menu(page);
      await page.locator("#ingame-advanced").click();
      const j = await diagnostic(page);
      expect(j.automaticBoot.decision.registration.decision.detected).toBe(
        mode !== "inner",
      );
      expect(j.automaticBoot.decision.current.prelude).toBe(mode !== "inner");
      expect(j.automaticBoot.decision.beforeLaunch.checks.musicPath).toBe(
        mode !== "inner",
      );
      await stop(page);
    },
  );
test("HF1 actual original BAT temporary trace can enter DOS NE5 without saving", async ({
  page,
}, info) => {
  test.skip(!process.env.ED4_Q_LOCAL_FOLDER);
  test.setTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#simple-import").click();
  await page
    .locator("#simple-folder")
    .setInputFiles(process.env.ED4_Q_LOCAL_FOLDER!);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible({
    timeout: 120000,
  });
  const before = await profiles(page);
  await page.locator("#launcher-advanced").click();
  await page
    .locator("#advanced-settings")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator("#boot-open").click();
  await expect(page.locator("#boot-start")).toBeEnabled();
  await page.locator("#boot-engine").selectOption("phase9-8k");
  await page.locator("#boot-start").click();
  await expect(page.locator("#logs")).toContainText("Now Loading...", {
    timeout: 30000,
  });
  await page.waitForTimeout(8000);
  await page
    .locator("#canvas")
    .screenshot({ path: info.outputPath("trace-menu.png") });
  await menu(page);
  await page.locator("#ingame-advanced").click();
  const j = await diagnostic(page);
  expect(j.bootTrace.issues).toEqual([]);
  expect(j.bootTrace.lastEntered.program).toBe("DRIVER.EXE");
  expect(j.engine.music.reads).toBeGreaterThan(0);
  expect(j.engine.runtimeErrors.events).toEqual([]);
  await writeFile(info.outputPath("trace.json"), JSON.stringify(j, null, 2));
  await stop(page);
  expect(await profiles(page)).toEqual(before);
  const saves = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-mobile-dev-v1");
      q.onsuccess = () => r(q.result);
    });
    return new Promise<number>((r) => {
      const q = db.transaction("saves").objectStore("saves").count();
      q.onsuccess = () => {
        db.close();
        r(q.result);
      };
    });
  });
  expect(saves).toBe(0);
});

test("HF1 re-evaluates package after explicit root disambiguation, without dropping CD plan", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(await fixture("multi"));
  await expect(page.locator("#simple-folder-choice")).toBeVisible();
  await page.locator("#simple-folder-root").selectOption("A/ED4");
  await page.locator("#simple-folder-confirm").click();
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  const p = (await profiles(page))[0];
  expect(p.launch.presetId).toBe("ed4-dooky-directory-cd-experimental-v1");
  expect(p.settings.prelude).toBe("mount d . -t cdrom\nLOADER.COM");
});

async function catalog(page: Page) {
  return page.evaluate(async () => {
    const out: any = {};
    for (const [name, stores] of [
      ["ed4-mobile-dev-v1", ["archives", "profiles", "saves", "recovery"]],
      ["ed4-music-dev-v1", ["packs"]],
    ] as const) {
      const db = await new Promise<IDBDatabase>((r) => {
        const q = indexedDB.open(name);
        q.onsuccess = () => r(q.result);
      });
      for (const store of stores)
        out[store] = await new Promise((r) => {
          const q = db.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => r(q.result);
        });
      db.close();
    }
    const root = await navigator.storage.getDirectory(),
      music = await root.getDirectoryHandle("ed4-dev-music");
    out.opfs = [];
    for await (const [name, entry] of (music as any).entries())
      out.opfs.push(name);
    out.opfs.sort();
    return out;
  });
}
test("HF1 optional music quota failure and cancellation keep prior saves/profiles/OPFS; no false CD preset", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  const folder = await fixture("bom");
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(folder);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await stop(page);
  const before = await catalog(page);
  await page.evaluate(() => {
    const real = navigator.storage.estimate.bind(navigator.storage);
    (window as any).restoreEstimate = () => (navigator.storage.estimate = real);
    navigator.storage.estimate = async () => ({ quota: 8000, usage: 0 });
  });
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(await fixture("bom"));
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  const after = await catalog(page);
  expect(after.packs).toEqual(before.packs);
  expect(after.opfs).toEqual(before.opfs);
  expect(after.saves).toEqual(before.saves);
  expect(
    after.profiles.find((p: any) => p.id === before.profiles[0].id),
  ).toEqual(before.profiles[0]);
  const added = after.profiles.find((p: any) => p.id !== before.profiles[0].id);
  expect(added.music).toBeUndefined();
  expect(added.launch.presetId).toBe("ed4-generic-experimental-v1");
  const d = await page.evaluate(
    (id) =>
      JSON.parse(
        localStorage.getItem("ed4-dev:ed4-dooky-registration-v1")!,
      ).find((r: any) => r.profileId === id),
    added.id,
  );
  expect(d.decision.detected).toBe(true);
  expect(d.decision.application).toMatchObject({
    applied: false,
    reason: "music-unavailable",
  });
  await page.evaluate(() => (window as any).restoreEstimate());
  const size = 96 * 1024 * 1024 + 8,
    head = new Uint8Array(8),
    v = new DataView(head.buffer);
  v.setUint16(0, 3, true);
  v.setUint16(2, 22050, true);
  v.setUint32(4, size - 8, true);
  const large = await fixture("bom");
  await writeIsoFixture(join(large, "DosBox/CD/ED4.iso"), {
    "ED4/EFFECT/BIG.RAW": { size, head },
  });
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(large);
  await expect(page.locator("#simple-progress-text")).toContainText("BIG.RAW");
  await page.locator("#simple-cancel").click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  expect(await catalog(page)).toEqual(after);
});
