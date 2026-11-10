// Existing J lifecycle assertions, exercised through PUBLIC ordinary K at 2x.
import { test, expect, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { tempSaveProgram } from "../../scripts/temp-save-program.mjs";
import { menu, text } from "../phase9-8i/helpers";
import {folderFixture} from '../folder-fixture';
async function register(page:Page,files:Record<string,Uint8Array>){
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture(files,'public-k'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r, j) => {
      const q = indexedDB.open("ed4-mobile-v1");
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    const result: any = {};
    for (const name of ["archives", "saves", "recovery", "profiles"])
      result[name] = await new Promise((r) => {
        const q = db.transaction(name).objectStore(name).getAll();
        q.onsuccess = () => r(q.result);
      });
    db.close();
    result.opfs = {};
    async function walk(dir: FileSystemDirectoryHandle, path: string) {
      for await (const [n, e] of (dir as any).entries()) {
        if (e.kind === "directory") await walk(e, path + "/" + n);
        else
          result.opfs[path + "/" + n] = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                await (await e.getFile()).arrayBuffer(),
              ),
            ),
          );
      }
    }
    await walk(await navigator.storage.getDirectory(), "");
    return JSON.parse(
      JSON.stringify(result, (_, v) =>
        v instanceof Uint8Array ? Array.from(v) : v,
      ),
    );
  });
}
async function setup(page: Page, initial = false) {
  await register(page, {
    "GAME.BAT": text("@ECHO OFF\r\nTEMP.COM\r\n"),
    "TEMP.COM": tempSaveProgram(),
    "MOD.DAT": text("user mod"),
    "_ED4-09.RAW": text("SYNTHETIC-RAW"),
    "SAVE/ED4_98.CFG": text("original config"),
    ...(initial ? { "SAVE/ED4_S99_.DAT": text("TEMP_A") } : {}),
  });
  await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption('phase9-8k');await page.locator('[data-close=settings-dialog]').click();
}
async function start(page: Page) {
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("J TEMP READY");
  await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
  await page.locator('#fullscreen').click();await page.locator('#speed-toggle').click();
  await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
}
async function key(page: Page, key: string, log: string) {
  await page.locator("#canvas").focus();
  await page.keyboard.press(key);
  await expect(page.locator("#logs")).toContainText(log);
}
async function stop(page: Page, consumed = false) {
  await menu(page);
  await page.locator("#stop").click();
  if (consumed) await page.locator("#temp-exit-confirm").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
}
test("A -> consume -> warn -> explicit recovery preview/apply -> B -> consume; originals and journal preserved offline", async ({
  page,
  context,
}) => {
  await setup(page);
  const originalState = await state(page),
    original = originalState.archives;
  await start(page);
  await key(page, "a", "TEMP A CREATED");
  await key(page, "s", "MANUAL SAVED");
  await stop(page);
  let s = await state(page);
  expect(s.recovery).toHaveLength(1);
  expect(s.recovery[0].save.files["SAVE/ED4_98.CFG"]).toEqual(
    Array.from(text("original config")),
  );
  expect(s.saves[0].files["SAVE/ED4_S99_.DAT"]).toEqual(
    Array.from(text("TEMP_A")),
  );
  const aId = s.recovery[0].id;
  await start(page);
  await key(page, "c", "TEMP_A CONSUMED");
  await menu(page);
  await page.locator("#stop").click();
  await expect(page.locator("#temp-exit-dialog")).toBeVisible();
  await page.locator("#temp-exit-return").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await key(page, "s", "MANUAL SAVED");
  await stop(page, true);
  s = await state(page);
  expect(s.saves[0].tombstones).toContain("SAVE/ED4_S99_.DAT");
  expect(s.recovery).toHaveLength(1);
  await page.locator("#launcher-advanced").click();
  await page.locator("#recovery-open").click();
  await expect(page.locator("#recovery-details")).toContainText("삭제 표시");
  const exportEvent = page.waitForEvent("download");
  await page.locator("#recovery-export").click();
  const recoveryDownload = await exportEvent;
  expect(recoveryDownload.suggestedFilename()).toContain("ed4-recovery-");
  const recoveryZip = unzipSync(
    new Uint8Array(await readFile((await recoveryDownload.path())!)),
  );
  expect(recoveryZip["FILES/SAVE/ED4_S99_.DAT"]).toEqual(text("TEMP_A"));
  expect(
    Object.keys(recoveryZip).some(
      (p) => p.endsWith(".RAW") || p.endsWith(".COM"),
    ),
  ).toBe(false);
  await page.locator("#recovery-preview").click();
  await expect(page.locator("#recovery-dialog")).not.toBeVisible();
  await expect(page.locator("#logs")).toContainText("J TEMP READY");
  await expect(page.locator("#stop")).toBeEnabled();
  await key(page, "c", "TEMP_A CONSUMED");
  await stop(page);
  expect((await state(page)).saves).toEqual(s.saves);
  expect((await state(page)).recovery).toEqual(s.recovery);
  await page.locator("#launcher-advanced").click();
  await page.locator("#recovery-open").click();
  await page.locator("#recovery-apply").click();
  await expect(page.locator("#recovery-dialog")).not.toBeVisible();
  expect(
    (await state(page)).recovery.some((r: any) => r.kind === "before-restore"),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#play")).toBeEnabled();
  await start(page);
  await key(page, "c", "TEMP_A CONSUMED");
  await key(page, "b", "TEMP B CREATED");
  await stop(page);
  s = await state(page);
  expect(s.saves[0].files["SAVE/ED4_S99_.DAT"]).toEqual(
    Array.from(text("TEMP_B")),
  );
  expect(
    s.recovery.find((r: any) => r.id === aId).save.files["SAVE/ED4_S99_.DAT"],
  ).toEqual(Array.from(text("TEMP_A")));
  await start(page);
  await key(page, "c", "TEMP_B CONSUMED");
  await stop(page, true);
  await start(page);
  await key(page, "c", "NO TEMP FILE");
  await stop(page);
  expect((await state(page)).opfs).toEqual(originalState.opfs);
  expect((await state(page)).archives).toEqual(original);
  expect((await state(page)).saves[0].tombstones).toContain(
    "SAVE/ED4_S99_.DAT",
  );
});
test("storage write failure keeps running and prior recovery; current file ZIP can be exported", async ({
  page,
}) => {
  await setup(page, true);
  await start(page);
  await key(page, "b", "TEMP B CREATED");
  const before = await state(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).__restorePut = () =>
      (IDBObjectStore.prototype.put = original);
    IDBObjectStore.prototype.put = function (value: any, ...rest: any[]) {
      if (this.name === "saves")
        throw new DOMException("PUBLIC QUOTA FAILURE", "QuotaExceededError");
      return original.call(this, value, ...rest);
    };
  });
  await menu(page);
  await page.locator("#stop").click();
  await expect(page.locator("#logs")).toContainText(
    "게임을 종료하지 않았습니다",
  );
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  const failed = await state(page);
  expect(failed.recovery).toEqual(before.recovery);
  expect(failed.saves).toEqual(before.saves);
  const download = page.waitForEvent("download");
  await page.locator("#export-live").click();
  const currentDownload = await download;
  expect(currentDownload.suggestedFilename()).toContain("ed4-current-files");
  const currentZip = unzipSync(
    new Uint8Array(await readFile((await currentDownload.path())!)),
  );
  expect(currentZip["FILES/SAVE/ED4_S99_.DAT"]).toEqual(text("TEMP_B"));
  await page.evaluate(() => (window as any).__restorePut());
  await stop(page);
  expect((await state(page)).recovery).toHaveLength(2);
});
