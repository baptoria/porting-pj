import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
});
async function start(page: Page) {
  await page.locator("#play").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
}
async function stop(page: Page) {
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
}
async function backup(page: Page) {
  const pending = page.waitForEvent("download");
  await page.locator("#backup").click();
  const download = await pending;
  return new Uint8Array(await readFile((await download.path())!));
}
async function key(page: Page, key: string, text: string) {
  await page.keyboard.press(key);
  await expect(page.locator("#logs")).toContainText(text);
}

test("actual DOS tombstones, resource separation, backup/restore and immutable original", async ({
  page,
}) => {
  await page.locator("#demo").click();
  await start(page);
  await key(page, "s", "SAVE WRITTEN");
  await key(page, "r", "RESOURCE WRITTEN");
  await stop(page);
  const originalBackup = await backup(page),
    contents = unzipSync(originalBackup);
  expect(strFromU8(contents["RESOURCES/RESOURCE.DAT"])).toBe(
    "RESOURCE_CHANGED\r\n",
  );
  expect(contents["FILES/RESOURCE.DAT"]).toBeUndefined();
  await start(page);
  await key(page, "d", "SAVE DELETED");
  await key(page, "x", "RESOURCE DELETED");
  await stop(page);
  const deleted = unzipSync(await backup(page)),
    meta = JSON.parse(strFromU8(deleted["ED4-BACKUP.JSON"]));
  expect(meta.tombstones).toContain("TEST.SAV");
  expect(meta.resourceTombstones).toContain("RESOURCE.DAT");
  expect(deleted["FILES/TEST.SAV"]).toBeUndefined();
  await page.reload();
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await start(page);
  await key(page, "l", "NO SAVE FILE");
  await stop(page);
  const again = JSON.parse(
    strFromU8(unzipSync(await backup(page))["ED4-BACKUP.JSON"]),
  );
  expect(again.tombstones).toContain("TEST.SAV");
  await page.locator("#restore").click();
  await page.locator("#restore-file").setInputFiles({
    name: "before-delete.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(originalBackup),
  });
  await expect(page.locator("#status")).toContainText("백업을 복원");
  await start(page);
  await key(page, "l", "ED4_SAVE_OK!");
  await stop(page);
  const immutable = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("ed4-mobile-v1");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise<string>((res, rej) => {
      const r = db.transaction("archives").objectStore("archives").getAll();
      r.onsuccess = () => {
        const a = r.result[0];
        res(new TextDecoder().decode(a.files["RESOURCE.DAT"]));
        db.close();
      };
      r.onerror = () => rej(r.error);
    });
  });
  expect(immutable).toBe("BASE_RESOURCE\r\n");
});

test("exact ZIP hash mismatch, requirements, BAT and diagnostic export", async ({
  page,
}, info) => {
  await page.locator("#demo").click();
  await page.locator("#edit-profile").click();
  await page.locator("#edit-exe").selectOption("START.BAT");
  await page.locator("#required-version").fill("wrong-version");
  await page.locator("#settings-form button[type=submit]").click();
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("요구 원본 버전 불일치");
  await page.locator("#edit-profile").click();
  await page.locator("#required-version").fill("");
  await page.locator("#settings-form button[type=submit]").click();
  await start(page);
  await key(page, "s", "SAVE WRITTEN");
  await stop(page);
  await page.locator("#storage-open").click();
  await page.locator("[data-delete-archive]").click();
  await page.locator("[data-relink]").click();
  await page.locator("#relink-file").setInputFiles({
    name: "different.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "START.BAT": strToU8("echo different") })),
  });
  await expect(page.locator("#status")).toContainText("해시 불일치");
  await expect(page.locator("[data-relink]")).toHaveCount(1);
  await page.locator("[data-relink]").click();
  await page.locator("#relink-file").setInputFiles("public/test-program.zip");
  await expect(page.locator("[data-relink]")).toHaveCount(0);
  await page.locator("[data-close=storage-dialog]").click();
  const downloading = page.waitForEvent("download");
  await page.locator("#export-diagnostics").click();
  const file = await downloading;
  const report = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(report.archives[0].identity.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.archives[0].analysis.batFiles).toContain("START.BAT");
  expect(report.measurements.map((m: any) => m.stage)).toContain(
    "Runtime ZIP assembly",
  );
  expect(
    report.measurements.find((m: any) => m.stage === "DOS snapshot")
      .wasmHeapBytes,
  ).toBeGreaterThan(0);
  await writeFile(
    info.outputPath("diagnostics.json"),
    JSON.stringify(report, null, 2),
  );
});

test("vanilla / two mods save isolation, layer order and save shadow diagnostics", async ({
  page,
}) => {
  await page.locator("#demo").click();
  await start(page);
  await key(page, "s", "SAVE WRITTEN");
  await stop(page);
  async function mod(name: string, value: string) {
    await page.locator("#open-import").click();
    await page.locator("#import-kind").selectOption("patch");
    await page.locator("#zip-file").setInputFiles({
      name: name + ".zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync({ "RESOURCE.DAT": strToU8(value) })),
    });
    await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM");
    await page.locator("#allow-conflicts").check();
    await page.locator("#import-name").fill(name);
    await page.locator("#import-submit").click();
    await expect(page.locator("#profile-title")).toHaveText(name);
  }
  await mod("mode-a", "first");
  await start(page);
  await key(page, "l", "NO SAVE FILE");
  await key(page, "s", "SAVE WRITTEN");
  await key(page, "r", "RESOURCE WRITTEN");
  await stop(page);
  await page.locator("#add-patch").click();
  await page.locator("#patch-file").setInputFiles({
    name: "second.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "RESOURCE.DAT": strToU8("second") })),
  });
  await expect(page.locator("#status")).toContainText("수정 ZIP을 추가");
  await page.locator("#inspect-profile").click();
  await expect(page.locator("#compatibility-report")).toContainText(
    "저장 변경분",
  );
  await expect(page.locator("#compatibility-report")).toContainText(
    "second.zip",
  );
  await page.locator("#edit-profile").click();
  await page.locator('[data-up="1"]').click();
  await expect(page.locator("#patch-list .data-row").first()).toContainText(
    "second.zip",
  );
  await page.locator('[data-remove-patch="1"]').click();
  await expect(page.locator("#patch-list .data-row")).toHaveCount(1);
  await page.locator("[data-close=settings-dialog]").click();
  await mod("mode-b", "third");
  await start(page);
  await key(page, "l", "NO SAVE FILE");
  await stop(page);
  await page.locator("[data-profile]").filter({ hasText: "mode-a" }).click();
  await start(page);
  await key(page, "l", "ED4_SAVE_OK!");
  await stop(page);
  await page
    .locator("[data-profile]")
    .filter({ hasText: "공개 DOS 테스트" })
    .click();
  await start(page);
  await key(page, "l", "ED4_SAVE_OK!");
  await stop(page);
});

test("v1 IndexedDB and backup migration remains playable", async ({ page }) => {
  await page.goto("/porting-pj/ed4/licenses/NOTICE.html");
  const files = unzipSync(
    new Uint8Array(await readFile("public/test-program.zip")),
  );
  const entries = Object.entries(files).map(([p, data]) => [
    p,
    Array.from(data),
  ]);
  const profile = {
    id: "legacy-profile",
    gameId: "ed4",
    engineId: "js-dos-v7",
    name: "Phase 1 legacy",
    kind: "vanilla",
    baseId: "legacy-base",
    patchIds: [],
    executable: "ED4TEST.COM",
    settings: { cycles: 12000, memory: 16, sound: "sb16", prelude: "" },
    createdAt: 0,
  };
  await page.evaluate(
    async ({ entries, profile }) => {
      await new Promise<void>((res, rej) => {
        const r = indexedDB.deleteDatabase("ed4-mobile-v1");
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("ed4-mobile-v1", 1);
        r.onupgradeneeded = () => {
          for (const [store, key] of [
            ["archives", "id"],
            ["profiles", "id"],
            ["saves", "profileId"],
          ])
            r.result.createObjectStore(store, { keyPath: key });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(["archives", "profiles", "saves"], "readwrite");
      tx.objectStore("archives").put({
        id: "legacy-base",
        name: "legacy.zip",
        files: Object.fromEntries(
          entries.map(([p, v]) => [p, new Uint8Array(v as number[])]),
        ),
        size: 2000,
        createdAt: 0,
      });
      tx.objectStore("profiles").put(profile);
      tx.objectStore("saves").put({
        profileId: profile.id,
        files: { "TEST.SAV": new TextEncoder().encode("LEGACY_SAVE\r\n") },
        updatedAt: 0,
      });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { entries, profile },
  );
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await expect(page.locator("#profile-title")).toHaveText("Phase 1 legacy");
  await start(page);
  await key(page, "l", "LEGACY_SAVE");
  await stop(page);
  const old = zipSync({
    "ED4-BACKUP.JSON": strToU8(
      JSON.stringify({
        format: "ed4-save",
        version: 1,
        gameId: "ed4",
        profileId: profile.id,
        profile,
      }),
    ),
    "FILES/TEST.SAV": strToU8("OLD_BACKUP_RESTORED\r\n"),
  });
  await page.locator("#restore").click();
  await page.locator("#restore-file").setInputFiles({
    name: "legacy-backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(old),
  });
  await expect(page.locator("#status")).toContainText("백업을 복원");
  await start(page);
  await key(page, "l", "OLD_BACKUP_RESTORED");
  await stop(page);
  await page.locator("#inspect-profile").click();
  await expect(page.locator("#compatibility-report")).toContainText(
    "legacy:legacy-base",
  );
});

test("mobile diagnostic layout, large ZIP rejection and quota failure preserve profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#demo").click();
  await page.locator("#inspect-profile").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, "estimate", {
      configurable: true,
      value: async () => ({ usage: 1000, quota: 1000 }),
    });
  });
  await page.locator("#demo").click();
  await expect(page.locator("#status")).toContainText("저장 공간이 부족");
  await expect(page.locator("#profile-count")).toHaveText("01");
  await page.locator("#open-import").click();
  const zip = zipSync({ "HUGE.DAT": new Uint8Array([1]) }),
    view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 24; i++)
    if (view.getUint32(i, true) === 0x02014b50)
      view.setUint32(i + 24, 0x40000000, true);
  await page.locator("#zip-file").setInputFiles({
    name: "huge.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await expect(page.locator("#status")).toContainText("크기가 제한");
  await expect(page.locator("#profile-count")).toHaveText("01");
});
