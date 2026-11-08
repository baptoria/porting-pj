import { test, expect, chromium } from "@playwright/test";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
});

test("real DOS worker: input, save, restart, isolation, backup, offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#demo").click();
  await expect(page.locator("#profile-title")).toHaveText("공개 DOS 테스트");
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중", {
    timeout: 30000,
  });
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#logs")).toContainText("KEY RECEIVED");
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await expect(page.locator("#canvas")).toHaveAttribute(
    "data-audio-signal",
    "true",
  );
  await expect(page.locator("#canvas")).toHaveAttribute(
    "data-audio-state",
    "running",
  );
  await page.screenshot({
    path: "test-results/dos-running.png",
    fullPage: true,
  });
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backup").click();
  const download = await downloadPromise;
  const bytes = new Uint8Array(await readFile((await download.path())!));
  const backup = unzipSync(bytes);
  expect(strFromU8(backup["FILES/TEST.SAV"])).toBe("ED4_SAVE_OK!\r\n");
  await page.reload();
  await expect(page.locator("#profile-title")).toHaveText("공개 DOS 테스트");
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK!");
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
  // A second profile uses its own save key even with identical program bytes.
  await page.locator("#demo").click();
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("NO SAVE FILE");
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
  expect(errors).toEqual([]);
});

test("browser process restart restores saves; backup recovery after data removal", async ({}, testInfo) => {
  const profileDir = testInfo.outputPath("browser-profile");
  const launch = () =>
    chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
  let context = await launch();
  let page = context.pages()[0];
  page.on("dialog", (d) => void d.accept());
  try {
    await page.goto("http://localhost:4173/porting-pj/ed4/");
    await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
    await page.locator("#demo").click();
    await page.locator("#play").click();
    await expect(page.locator("#run-state")).toHaveText("실행 중");
    await page.keyboard.press("s");
    await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
    await page.locator("#stop").click();
    await expect(page.locator("#run-state")).toHaveText("종료됨");
    const downloading = page.waitForEvent("download");
    await page.locator("#backup").click();
    const file = await downloading;
    const savedPath = testInfo.outputPath("backup.zip");
    await file.saveAs(savedPath);
    await context.close();
    context = await launch();
    page = context.pages()[0];
    page.on("dialog", (d) => void d.accept());
    await page.goto("http://localhost:4173/porting-pj/ed4/");
    await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
    await page.locator("#play").click();
    await expect(page.locator("#run-state")).toHaveText("실행 중");
    await page.keyboard.press("l");
    await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK!");
    await page.locator("#stop").click();
    await expect(page.locator("#run-state")).toHaveText("종료됨");
    // Delete profile, archive and save through UI, then recover the external backup.
    await page.locator("#edit-profile").click();
    await page.locator("#remove-profile").click();
    await expect(page.locator("#profile-count")).toHaveText("00");
    await page.locator("#storage-open").click();
    await page.locator("[data-delete-archive]").click();
    await expect(page.locator("[data-delete-archive]")).toHaveCount(0);
    await page.locator("[data-delete-save]").click();
    await expect(page.locator("[data-delete-save]")).toHaveCount(0);
    await page.locator("#recover-profile").click();
    await page.locator("#recover-file").setInputFiles(savedPath);
    await expect(page.locator("[data-relink]")).toHaveCount(1);
    await page.locator("[data-relink]").click();
    await page.locator("#relink-file").setInputFiles("public/test-program.zip");
    await expect(page.locator("[data-relink]")).toHaveCount(0);
    await page.locator('[data-close="storage-dialog"]').click();
    await page.locator("#play").click();
    await expect(page.locator("#run-state")).toHaveText("실행 중");
    await page.keyboard.press("l");
    await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK!");
    await page.locator("#stop").click();
    await expect(page.locator("#run-state")).toHaveText("종료됨");
  } finally {
    await context.close();
  }
});

test("mobile portrait layout and rejected ZIP do not register a profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-portrait.png",
    fullPage: true,
  });
  await page.locator("#open-import").click();
  await page
    .locator("#zip-file")
    .setInputFiles({
      name: "unsafe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync({ "../BAD.COM": strToU8("x") })),
    });
  await expect(page.locator("#status")).toContainText("안전하지 않은 ZIP 경로");
  await expect(page.locator("#profile-count")).toHaveText("00");
});

test("ZIP upload, patch conflicts, standalone, mobile touch and layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#open-import").click();
  await page.locator("#zip-file").setInputFiles("public/test-program.zip");
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
  await page.locator("#import-name").fill("테스트 원본");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("테스트 원본");
  await page.locator("#open-import").click();
  await page.locator("#import-kind").selectOption("patch");
  await page
    .locator("#zip-file")
    .setInputFiles({
      name: "patch.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(
        zipSync({
          "README.TXT": strToU8("Patched README"),
          "PATCH.TXT": strToU8("hello"),
        }),
      ),
    });
  await expect(page.locator("#conflict-row")).toBeVisible();
  await page.locator("#allow-conflicts").check();
  await page.locator("#import-name").fill("수정 모드");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("수정 모드");
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  // Real pointer path (setPointerCapture requires a trusted active pointer).
  await page.locator('[aria-label="위"]').click();
  await expect(page.locator("#logs")).toContainText("KEY RECEIVED");
  await page.screenshot({ path: "test-results/mobile-landscape.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#keyboard-toggle").click();
  await page.locator('#virtual-keyboard [data-key="83"]').click();
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await page.locator("#keyboard-toggle").click();
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
  await page.locator("#open-import").click();
  await page.locator("#import-kind").selectOption("standalone");
  await page.locator("#zip-file").setInputFiles("public/test-program.zip");
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
  await page.locator("#import-name").fill("독립 모드");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-kind")).toHaveText("독립 모드");
});

test("second tab cannot write", async ({ page, context }) => {
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  const second = await context.newPage();
  await second.goto("/porting-pj/ed4/");
  await expect(second.locator("#status")).toContainText("다른 탭");
  await second.locator("#demo").click();
  await expect(second.locator("#profile-count")).toHaveText("00");
  await second.close();
});
