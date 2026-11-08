import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile, readFile, open } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, zipSync, strFromU8 } from "fflate";
async function ready(page: Page) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4/");
  await page.locator("#advanced-settings").evaluate(el => { (el as HTMLDetailsElement).open = true; });
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
}
function raw(n = 1) {
  const b = Buffer.alloc(88208);
  b.write("RAWTEST" + n);
  for (let i = 8; i < b.length; i += 4) {
    b.writeInt16LE(Math.round(Math.sin(((i - 8) / 4 / 22050) * 440) * 8000), i);
    b.writeInt16LE(
      Math.round(Math.sin(((i - 8) / 4 / 22050) * 660) * 8000),
      i + 2,
    );
  }
  return b;
}
async function start(page: Page) {
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중", {
    timeout: 30000,
  });
}
async function stop(page: Page) {
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.locator(button).click();
  return readFile((await (await pending).path())!);
}
test("folder body + RAW, native DOS lazy reads, no music in save, offline reopening", async ({
  page,
  context,
}, info) => {
  await ready(page);
  const dir = info.outputPath("synthetic-game");
  await mkdir(dir, { recursive: true });
  const fixture = unzipSync(
    new Uint8Array(await readFile("public/test-program.zip")),
  );
  for (const [name, data] of Object.entries(fixture))
    await writeFile(join(dir, name), data);
  await writeFile(join(dir, "ED4-01.RAW"), raw(1));
  await writeFile(join(dir, "ED4-02.RAW"), raw(2));
  await page.locator("#open-import").click();
  await page.locator("#folder-file").setInputFiles(dir);
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("synthetic-game");
  await start(page);
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText(
    "RAWTEST1 RAW READ AND SEEK OK",
  );
  await page.keyboard.press("n");
  await expect(page.locator("#logs")).toContainText(
    "RAWTEST2 RAW READ AND SEEK OK",
  );
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await stop(page);
  const backup = unzipSync(new Uint8Array(await download(page, "#backup")));
  expect(Object.keys(backup).filter((k) => k.endsWith(".RAW"))).toEqual([]);
  expect(strFromU8(backup["FILES/TEST.SAV"])).toContain("ED4_SAVE_OK");
  const diag = JSON.parse(
    (await download(page, "#export-diagnostics")).toString(),
  );
  expect(diag.engine.music.mounted).toBe(2);
  expect(diag.engine.music.bytes).toBeGreaterThan(0);
  expect(diag.engine.music.bytes).toBeLessThan(176416);
  await writeFile(
    info.outputPath("lazy-read-diagnostics.json"),
    JSON.stringify(diag, null, 2),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await start(page);
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK");
  await stop(page);
});
test("separate music, explicit track preview and switching, profile sharing and source collision", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#demo").click();
  await expect(page.locator("#status")).toContainText("공개 테스트 준비 완료");
  await page.locator("#music-files").setInputFiles([
    {
      name: "ED4-01.RAW",
      mimeType: "application/octet-stream",
      buffer: raw(1),
    },
    {
      name: "ED4-02.RAW",
      mimeType: "application/octet-stream",
      buffer: raw(2),
    },
  ]);
  await expect(page.locator("#music-track option")).toHaveCount(2);
  const pack = await page.locator("#music-pack").inputValue();
  await page.locator("#music-link").click();
  await expect(page.locator("#status")).toContainText("연결했습니다");
  await expect(page.locator("#status")).toContainText("연결했습니다");
  await page.locator("#raw-preview").click();
  await expect(page.locator("#music-info")).toHaveAttribute(
    "data-state",
    "playing",
  );
  await page.locator("#raw-stop").click();
  await page.locator("#music-track").selectOption("1");
  await page.locator("#raw-preview").click();
  await page.waitForTimeout(150);
  await page.locator("#raw-stop").click();
  await start(page);
  await page.keyboard.press("s");
  await stop(page);
  await page.locator("#demo").click();
  await expect(page.locator("#status")).toContainText("공개 테스트 준비 완료");
  await page.locator("#music-pack").selectOption(pack);
  await page.locator("#music-link").click();
  await expect(page.locator("#status")).toContainText("연결했습니다");
  await start(page);
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("NO SAVE FILE");
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await stop(page);
  await expect(page.locator("#music-pack option")).toHaveCount(2);
  await page.locator("#music-delete").click();
  await expect(page.locator("#status")).toContainText("연결을 먼저 해제");
});
test("streaming RAW ZIP validates CRC and rollback preserves prior pack", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#demo").click();
  await expect(page.locator("#status")).toContainText("공개 테스트 준비 완료");
  const zip = zipSync({ "ED4-01.RAW": raw(1) }, { level: 0 });
  await page
    .locator("#music-zip")
    .setInputFiles({
      name: "music.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await expect(page.locator("#music-track option")).toHaveCount(1);
  await page.locator("#music-link").click();
  await expect(page.locator("#status")).toContainText("연결했습니다");
  const bad = Buffer.from(zip);
  const nameLength = bad.readUInt16LE(26),
    extraLength = bad.readUInt16LE(28);
  bad[30 + nameLength + extraLength + 8] ^= 1;
  await page
    .locator("#music-zip")
    .setInputFiles({
      name: "bad.zip",
      mimeType: "application/zip",
      buffer: bad,
    });
  await expect(page.locator("#status")).toContainText("CRC 불일치");
  await expect(page.locator("#music-pack option")).toHaveCount(2);
  await start(page);
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await stop(page);
});
test("landscape fallback, portrait advice, multitouch and adjustable controls", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      value: () => Promise.reject(Error("test denied")),
    });
    Object.defineProperty(screen.orientation, "lock", {
      value: () => Promise.reject(Error("test denied")),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator("#demo").click();
  await expect(page.locator("#status")).toContainText("공개 테스트 준비 완료");
  await start(page);
  await expect(page.locator("#rotate-notice")).toBeVisible();
  await page.locator("#fullscreen").click();
  await expect(page.locator("#logs")).toContainText("방향 잠금");
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await page.setViewportSize({ width: 844, height: 390 });
  await page
    .locator('[aria-label="위"]')
    .dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch" });
  await page
    .locator("#confirm-key")
    .dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch" });
  await page
    .locator('[aria-label="위"]')
    .dispatchEvent("pointercancel", { pointerId: 1 });
  await page
    .locator("#confirm-key")
    .dispatchEvent("pointerup", { pointerId: 2 });
  await expect(page.locator("#logs")).toContainText("KEY RECEIVED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("landscape.png") });
  await stop(page);
  await page.locator("#control-opacity").fill("60");
  await page.locator("#control-y").fill("10");
  await page.reload();
  await expect(page.locator("#control-opacity")).toHaveValue("60");
  await expect(page.locator("#control-y")).toHaveValue("10");
});
test("500 MiB sequential folder ingest, 54 RAW files, bounded runtime mount", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const dir = info.outputPath("large-game");
  await mkdir(dir, { recursive: true });
  const block = Buffer.alloc(1024 * 1024);
  const begun = Date.now();
  // At most one 1 MiB Node buffer; disk inputs passed by path, not protocol base64.
  for (let i = 1; i <= 54; i++) {
    const f = await open(
      join(dir, `ED4-${String(i).padStart(2, "0")}.RAW`),
      "w",
    );
    await f.write(Buffer.from("RAWTEST" + (i === 2 ? "2" : "1")));
    for (let n = 0; n < 8; n++) await f.write(block);
    await f.close();
  }
  for (let i = 0; i < 2; i++) {
    const f = await open(join(dir, `CORE${i}.DAT`), "w");
    for (let n = 0; n < 34; n++) await f.write(block);
    await f.close();
  }
  const fixture = unzipSync(
    new Uint8Array(await readFile("public/test-program.zip")),
  );
  for (const [name, data] of Object.entries(fixture))
    await writeFile(join(dir, name), data);
  await ready(page);
  await page.locator("#open-import").click();
  await page.locator("#folder-file").setInputFiles(dir);
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM", {
    timeout: 180000,
  });
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("large-game");
  await expect(page.locator("#music-track option")).toHaveCount(54);
  await start(page);
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await page.keyboard.press("n");
  await expect(page.locator("#logs")).toContainText("RAWTEST2");
  await page.keyboard.press("s");
  await stop(page);
  const backup = await download(page, "#backup");
  expect(backup.length).toBeLessThan(10000);
  const diag = JSON.parse(
    (await download(page, "#export-diagnostics")).toString(),
  );
  expect(diag.music[0].bytes).toBe(54 * (8 * 1024 * 1024 + 8));
  expect(diag.engine.music.mounted).toBe(54);
  expect(diag.engine.music.largestRead).toBeLessThanOrEqual(1024 * 1024);
  expect(diag.engine.music.bytes).toBeLessThan(1024 * 1024);
  await writeFile(
    info.outputPath("large-observations.json"),
    JSON.stringify(
      {
        scope: "PC Chrome synthetic only; not Galaxy nor total peak RSS",
        totalInputBytes:
          500 * 1024 * 1024 +
          432 +
          Object.values(fixture).reduce((n, b) => n + b.length, 0),
        endToEndMs: Date.now() - begun,
        backupBytes: backup.length,
        diagnostic: diag,
      },
      null,
      2,
    ),
  );
});

test("combined deflated ZIP separates RAW, standalone and patch share music with independent saves", async ({
  page,
}) => {
  await ready(page);
  const program = unzipSync(
      new Uint8Array(await readFile("public/test-program.zip")),
    ),
    audio = new Uint8Array(20 * 1024 * 1024 + 8);
  audio.set(new TextEncoder().encode("RAWTEST1"));
  const zip = zipSync({ ...program, "ED4-01.RAW": audio }, { level: 6 });
  await page.locator("#open-import").click();
  await page.locator("#import-kind").selectOption("standalone");
  await page
    .locator("#zip-file")
    .setInputFiles({
      name: "combined.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("combined");
  const pack = await page.locator("#music-pack").inputValue();
  expect(pack).not.toBe("");
  await start(page);
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await page.keyboard.press("s");
  await stop(page);
  await page.locator("#open-import").click();
  await page.locator("#import-kind").selectOption("patch");
  await page
    .locator("#zip-file")
    .setInputFiles({
      name: "patch.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync({ "MOD.TXT": new Uint8Array([1]) })),
    });
  await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
  await page.locator("#import-submit").click();
  await expect(page.locator("#profile-title")).toHaveText("patch");
  await page.locator("#music-pack").selectOption(pack);
  await page.locator("#music-link").click();
  await expect(page.locator("#status")).toContainText("연결했습니다");
  await start(page);
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("NO SAVE FILE");
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAWTEST1");
  await stop(page);
  await expect(page.locator("#music-pack option")).toHaveCount(2);
  const data = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-mobile-v1");
      q.onsuccess = () => r(q.result);
    });
    return await new Promise<any[]>((r) => {
      const q = db.transaction("profiles").objectStore("profiles").getAll();
      q.onsuccess = () => {
        r(q.result);
        db.close();
      };
    });
  });
  expect(data[0].baseId).toBe(data[1].baseId);
  await page.evaluate(() =>
    Object.defineProperty(navigator.storage, "estimate", {
      configurable: true,
      value: async () => ({ usage: 1, quota: 1 }),
    }),
  );
  await page
    .locator("#music-files")
    .setInputFiles({
      name: "NEW.RAW",
      mimeType: "application/octet-stream",
      buffer: raw(2),
    });
  await expect(page.locator("#status")).toContainText("저장 공간이 부족");
  await expect(page.locator("#music-pack option")).toHaveCount(2);
});
