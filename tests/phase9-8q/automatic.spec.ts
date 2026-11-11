import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { folderFixture } from "../folder-fixture";
import { testProgram } from "../../scripts/test-program.mjs";
import { writeIsoFixture, rawTone } from "../../scripts/iso-fixture.mjs";
import { stop, diagnostic, menu } from "../phase9-8i/helpers";
const text = (s: string) => new TextEncoder().encode(s);
test("one folder -> automatic configured root/CD/RAW -> K save, speed, restart offline", async ({
  page,
  context,
}, info) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  const returnDos = new Uint8Array([0xb8, 0, 0x4c, 0xcd, 0x21]);
  const probe = Buffer.from(
    (await readFile("tests/fixtures/phase9-8q-cd-probe.b64", "utf8")).trim(),
    "base64",
  );
  const files = {
    "ED4/GAME.BAT": text(
      "@ECHO OFF\r\nLOGO.EXE\r\nSOUNDRV.COM\r\nDRIVER.EXE ED4.EXE\r\nSOUNDRV.COM/U\r\n@ECHO ON",
    ),
    "ED4/LOGO.EXE": returnDos,
    "ED4/SOUNDRV.COM": returnDos,
    "ED4/ED4.EXE": returnDos,
    "ED4/LOADER.COM": probe,
    "ED4/DRIVER.EXE": testProgram(
      ["D:\\ED4\\EFFECT\\ED4-01.RAW", "D:\\ED4\\EFFECT\\ED4-01.RAW"],
      false,
    ),
    "ED4/ED4/GAME.BAT": text("OTHER.EXE"),
    "ED4/ED4/OTHER.EXE": returnDos,
    "DosBox/autoexec.conf": text(
      "[NEW]\nTITLE:test\nCD ED4\nLOADER.COM\nGAME.BAT",
    ),
    "DosBox/Settings.conf": text("CD=1"),
  };
  const folder = await folderFixture(files, "configured-package");
  await mkdir(join(folder, "DosBox/CD"), { recursive: true });
  await writeIsoFixture(join(folder, "DosBox/CD/ED4.iso"), {
    "ED4/EFFECT/ED4-01.RAW": rawTone(440, 0.1),
  });
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(folder);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  const profile = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-mobile-dev-v1");
      q.onsuccess = () => r(q.result);
    });
    return new Promise<any>((r) => {
      const q = db.transaction("profiles").objectStore("profiles").getAll();
      q.onsuccess = () => {
        db.close();
        r(q.result[0]);
      };
    });
  });
  expect(profile.executable).toBe("GAME.BAT");
  expect(profile.settings.prelude).toBe("mount d . -t cdrom\nLOADER.COM");
  expect(profile.music.prefix).toBe("ED4");
  expect(profile.launch.presetId).toBe(
    "ed4-dooky-directory-cd-experimental-v1",
  );
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("Q_CD_READONLY_OK");
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.locator("#canvas").focus();
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAW READ AND SEEK OK");
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await page.locator("#fullscreen").click();
  for (const value of ["true", "false"]) {
    await page.locator("#speed-toggle").click();
    await expect(page.locator("#speed-toggle")).toHaveAttribute(
      "aria-pressed",
      value,
    );
    await expect(page.locator("#speed-toggle")).toBeEnabled();
  }
  await menu(page);
  await page.locator("#ingame-advanced").click();
  const data = await diagnostic(page);
  expect(data.automaticBoot.cd.imageMounted).toBe(false);
  expect(data.automaticBoot.cdMountedLog).toBe(true);
  expect(data.automaticBoot.rawReads).toBeGreaterThan(0);
  await writeFile(
    info.outputPath("automatic.json"),
    JSON.stringify(data, null, 2),
  );
  await stop(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("Q_CD_READONLY_OK");
  await page.locator("#canvas").focus();
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK");
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAW READ AND SEEK OK");
  await stop(page);
});
