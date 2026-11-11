import { testProgram } from '../../scripts/test-program.mjs';
import { stop } from '../phase9-8i/helpers';
import { test, expect, type Page } from "@playwright/test";
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open(document.body.dataset.buildAudience==='developer'?'ed4-mobile-dev-v1':'ed4-mobile-v1');
      q.onsuccess = () => r(q.result);
    });
    const out: any = {};
    for (const s of [
      "profiles",
      "archives",
      "saves",
      "recovery",
      "retiredProfiles",
      "cleanup",
    ])
      out[s] = await new Promise((r) => {
        const q = db.transaction(s).objectStore(s).getAll();
        q.onsuccess = () => r(q.result);
      });
    db.close();
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle(document.body.dataset.buildAudience==='developer'?'ed4-dev-music':'ed4-music');
    out.music = [];
    for await (const k of (root as any).keys()) out.music.push(k);
    out.music.sort();
    return out;
  });
}
async function seed(page: Page) {
  await page.goto(process.env.ED4_RELEASE_PUBLIC ? "/porting-pj/ed4/" : "/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.evaluate(async (program) => {
    const open = (name: string) =>
      new Promise<IDBDatabase>((r) => {
        const q = indexedDB.open(name);
        q.onsuccess = () => r(q.result);
      });
    const db = await open(document.body.dataset.buildAudience==='developer'?'ed4-mobile-dev-v1':'ed4-mobile-v1'),
      tx = db.transaction(
        ["profiles", "archives", "catalog", "saves", "recovery"],
        "readwrite",
      );
    for (const id of ["base", "patch", "own"]) {
      const a = {
        id,
        name: id,
        files: { "GAME.BAT": new TextEncoder().encode("ED4TEST.COM\r\n"), "ED4TEST.COM":new Uint8Array(program) },
        size: 1,
        createdAt: 1,
        musicPackId: id,
      };
      tx.objectStore("archives").put(a);
      tx.objectStore("catalog").put({
        ...a,
        files: {},
        available: true,
        fileCount: 1,
      });
    }
    for (const id of ["A", "B", "C"]) {
      const p = {
        id,
        name: "시험 " + id,
        gameId: "ed4",
        engineId: "js-dos-v7",
        kind: id === "B" ? "patch" : "vanilla",
        baseId: id === "C" ? "own" : "base",
        patchIds: id === "B" ? ["patch"] : [],
        executable: "GAME.BAT",
        settings: { cycles: 12000, memory: 16, sound: "sb16", prelude: "" },
        createdAt: 1,
        music: { packId: id === "C" ? "own" : "base", prefix: "" },
      };
      tx.objectStore("profiles").put(p);
      const save = {
        profileId: id,
        profile: p,
        files: { "SAVE/TEST.DAT": new Uint8Array([9]) },
        tombstones: ["SAVE/CONSUMED.DAT"],
        updatedAt: 2,
      };
      tx.objectStore("saves").put(save);
      tx.objectStore("recovery").put({
        id: "point-" + id,
        profileId: id,
        sessionId: "session",
        createdAt: 1,
        kind: "before-restore",
        candidatePaths: [],
        save,
        note: "",
      });
    }
    await new Promise<void>((r, j) => {
      tx.oncomplete = () => r();
      tx.onerror = () => j(tx.error);
    });
    db.close();
    const music = await open(document.body.dataset.buildAudience==='developer'?'ed4-music-dev-v1':'ed4-music-v1'),
      mt = music.transaction("packs", "readwrite");
    for (const id of ["base", "patch", "own"])
      mt.objectStore("packs").put({
        id,
        name: id,
        tracks: [],
        bytes: 4,
        createdAt: 1,
      });
    await new Promise<void>((r) => {
      mt.oncomplete = () => r();
    });
    music.close();
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle(document.body.dataset.buildAudience==='developer'?'ed4-dev-music':'ed4-music', { create: true });
    for (const id of ["base", "patch", "own"]) {
      const d = await root.getDirectoryHandle(id, { create: true }),
        f = await d.getFileHandle("sample", { create: true }),
        w = await f.createWritable();
      await w.write(new Uint8Array([1, 2, 3, 4]));
      await w.close();
    }
  },Array.from(testProgram([],false)));
  await page.reload();
  await expect(page.locator("[data-manage-profile]")).toHaveCount(3);
}
async function manage(page: Page, id: string) {
  if(!await page.locator(`[data-manage-profile="${id}"]`).isVisible())await page.locator("#choose-profile").click();
  await page.locator(`[data-manage-profile="${id}"]`).click();
  await expect(page.locator("#profile-manage")).toBeVisible();
}
async function storage(page: Page) {
  await page.locator("#launcher-advanced").click();
  await page
    .locator("#advanced-settings")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator("#storage-open").click();
}
test("HF2 A/B/C shared references, retained save restore, same-name profiles, mobile deletion and offline reconnect", async ({
  page,
  context,
}, info) => {
  page.on("dialog",d=>void d.accept());
  await page.setViewportSize({ width: 832, height: 384 });
  await seed(page);
  const before = await snapshot(page);
  await manage(page, "C");
  expect(
    await page.locator('[data-profile="A"]').getAttribute("class"),
  ).toContain("selected");
  await page.locator("#manage-name").fill("시험 A");
  await page.locator("#manage-rename").click();
  expect((await snapshot(page)).saves).toEqual(before.saves);
  await manage(page, "A");
  await page.locator("#manage-delete").click();
  await expect(page.locator("#delete-scope")).toHaveValue("profile");
  await page.screenshot({ path: info.outputPath("delete-mobile.png") });
  const box = await page.locator("#profile-delete").boundingBox();
  expect(box!.height).toBeLessThanOrEqual(384);
  for (const selector of ["#delete-confirm", "#delete-cancel"])
    expect(
      (await page.locator(selector).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  await page.locator("#delete-confirm").scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("delete-mobile-actions.png")});
  await page.locator("#delete-cancel").click();
  expect((await snapshot(page)).profiles).toHaveLength(3);
  await manage(page, "A");
  await page.locator("#manage-delete").click();
  await page.locator("#delete-confirm").click();
  await expect(page.locator("#profile-delete")).not.toBeVisible();
  let after = await snapshot(page);
  expect(after.saves).toEqual(before.saves);
  expect(after.music).toEqual(before.music);
  expect(after.retiredProfiles[0].id).toBe("A");
  for(const id of ['B','C']){
    if(!await page.locator(`[data-profile="${id}"]`).isVisible())await page.locator("#choose-profile").click();
    await page.locator(`[data-profile="${id}"]`).click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await stop(page);
  }
  await storage(page);
  await page
    .locator("#retired-profiles button")
    .filter({ hasText: "프로필 복원" })
    .click();
  await expect(page.locator('[data-profile="A"]')).toHaveCount(1);
  await page.locator('[data-close="storage-dialog"]').click();
  await manage(page, "A");
  await page.locator("#manage-delete").click();
  await page.locator("#delete-scope").selectOption("unused");
  await expect(page.locator("#delete-preview")).toContainText(
    "공유 보호: 게임 1개",
  );
  await page.locator("#delete-confirm").click();
  await expect(page.locator("#profile-delete")).not.toBeVisible();
  expect((await snapshot(page)).archives.map((a: any) => a.id)).toContain(
    "base",
  );
  await manage(page, "C");
  await page.locator("#manage-delete").click();
  await page.locator("#delete-scope").selectOption("all");
  await expect(page.locator("#delete-confirm")).toBeDisabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#delete-backup").click(),
  ]);
  expect(download.suggestedFilename()).toBe("ed4-save-C.zip");
  await page.locator("#delete-phrase").fill("삭제");
  await page.locator("#delete-confirm").click();
  await expect(page.locator("#profile-delete")).not.toBeVisible();
  after = await snapshot(page);
  expect(after.music).toEqual(["base", "patch"]);
  expect(after.saves.map((s: any) => s.profileId)).toEqual(["A", "B"]);
  expect(after.recovery.map((p: any) => p.profileId)).toEqual(["A", "B"]);
  expect(after.profiles.map((p: any) => p.id)).toEqual(["B"]);
  await context.setOffline(true);
  await page.reload();
  expect((await snapshot(page)).saves).toEqual(after.saves);
  await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await stop(page);
  expect((await snapshot(page)).saves.find((s:any)=>s.profileId==='A')).toEqual(after.saves.find((s:any)=>s.profileId==='A'));
});
test("HF2 OPFS interrupted cleanup persists across reload and is explicitly retryable", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    (window as any).restoreRemove = () =>
      (FileSystemDirectoryHandle.prototype.removeEntry = original);
    FileSystemDirectoryHandle.prototype.removeEntry = async function (
      name,
      ...args
    ) {
      if (name === "own")
        throw new DOMException("busy", "NoModificationAllowedError");
      return original.call(this, name, ...args);
    };
  });
  await manage(page, "C");
  await page.locator("#manage-delete").click();
  await page.locator("#delete-scope").selectOption("unused");
  await page.locator("#delete-confirm").click();
  await expect(page.locator("#profile-delete")).not.toBeVisible();
  await expect(page.locator("#profile-delete")).not.toBeVisible();
  const before = await snapshot(page);
  expect(before.cleanup.map((j: any) => j.id)).toEqual(["own"]);
  expect(before.music).toContain("own");
  expect(before.saves).toHaveLength(3);
  await page.reload();
  await storage(page);
  await expect(page.locator("#cleanup-state")).toContainText("1개");
  await page.locator("#cleanup-music").click();
  await expect(page.locator("#cleanup-state")).toContainText("0개");
  const after = await snapshot(page);
  expect(after.music).toEqual(["base", "patch"]);
  expect(after.saves).toEqual(before.saves);
});
