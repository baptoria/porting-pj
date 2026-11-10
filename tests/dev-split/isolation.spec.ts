import { test, expect, Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { folderFixture } from "../folder-fixture";
import { testProgram } from "../../scripts/test-program.mjs";
import { writeIsoFixture, rawTone } from "../../scripts/iso-fixture.mjs";
import { menu, stop } from "../phase9-8i/helpers";
const text = (s: string) => new TextEncoder().encode(s),
  url = (dev = false) => "/porting-pj/" + (dev ? "ed4-dev" : "ed4") + "/";
async function fixture(iso = false) {
  const files: Record<string, Uint8Array> = {
    "ED4/GAME.BAT": text("ED4TEST.COM\r\n"),
    "ED4/ED4TEST.COM": testProgram(
      ["EFFECT\\ED4-01.RAW", "EFFECT\\ED4-01.RAW"],
      false,
    ),
  };
  if (!iso) files["ED4/EFFECT/ED4-01.RAW"] = rawTone(440, 0.1);
  const dir = await folderFixture(
    files,
    iso ? "developer-library" : "public-library",
  );
  if (iso) {
    await mkdir(join(dir, "DosBox/CD"), { recursive: true });
    await writeIsoFixture(join(dir, "DosBox/CD/ED4.iso"), {
      "ED4/EFFECT/ED4-01.RAW": rawTone(660, 0.1),
    });
  }
  return dir;
}
async function ready(page: Page, dev = false) {
  await page.goto(url(dev));
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료", {
    timeout: 30000,
  });
}
async function register(page: Page, iso = false) {
  const dir = await fixture(iso);
  await page.bringToFront();
  await page.locator("#simple-import").click();
  await expect(page.locator("#simple-import-dialog")).toBeVisible();
  await page.locator("#simple-folder").setInputFiles(dir);
  if (!iso) {
    await expect(page.locator("#simple-folder-confirm")).toBeVisible();
    await page.locator("#simple-folder-confirm").click();
  }
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
}
async function run(page: Page) {
  await page.bringToFront();
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
}
async function key(page: Page, key: string, result: string) {
  await page.locator("#canvas").focus();
  await page.keyboard.press(key);
  await expect(page.locator("#logs")).toContainText(result);
}
async function settings(page: Page, dev = false) {
  if (!dev) await page.locator("#launcher-advanced").click();
  else
    await page
      .locator("#advanced-settings")
      .evaluate((e) => ((e as HTMLDetailsElement).open = true));
}
async function state(page: Page, dev = false) {
  return page.evaluate(async (dev) => {
    const result: any = {};
    for (const [name, stores] of [
      [
        dev ? "ed4-mobile-dev-v1" : "ed4-mobile-v1",
        [
          "archives",
          "profiles",
          "saves",
          "recovery",
          "recoveryPolicies",
          "catalog",
        ],
      ],
      [dev ? "ed4-music-dev-v1" : "ed4-music-v1", ["packs"]],
    ] as [string, string[]][]) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const q = indexedDB.open(name);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      for (const s of stores)
        result[s] = await new Promise((r) => {
          const q = db.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => r(q.result);
        });
      db.close();
    }
    result.raw = {};
    try {
      const dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(dev ? "ed4-dev-music" : "ed4-music");
      for await (const [id, pack] of (dir as any).entries())
        for await (const [key, h] of pack.entries()) {
          const b = await (await h.getFile()).arrayBuffer();
          result.raw[id + "/" + key] = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
          );
        }
    } catch (e) {
      if ((e as DOMException).name !== "NotFoundError") throw e;
    }
    result.preferences = Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) =>
          dev
            ? k.startsWith("ed4-dev:")
            : k.startsWith("ed4-") && !k.startsWith("ed4-dev:"),
        )
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    );
    return JSON.parse(
      JSON.stringify(result, (_, v) =>
        v instanceof Uint8Array ? Array.from(v) : v,
      ),
    );
  }, dev);
}
async function cachesFor(page: Page, dev = false) {
  return page.evaluate(
    async (dev) =>
      (await caches.keys())
        .filter((k) =>
          k.startsWith(
            "ed4-shell-" +
              encodeURIComponent(
                "/porting-pj/" + (dev ? "ed4-dev" : "ed4") + "/",
              ) +
              "-",
          ),
        )
        .sort(),
    dev,
  );
}

test("same-origin builds isolate catalogs, RAW, saves, preferences, locks, updates and offline use", async ({
  context,
  request,
}, info) => {
  await request.post("/__release?app=ed4&version=previous");
  await request.post("/__release?app=ed4-dev&version=previous");
  const pub = await context.newPage(),
    dev = await context.newPage(),
    violations: string[] = [];
  await dev.exposeFunction("__violation", (name: string) =>
    violations.push(name),
  );
  for (const p of [pub, dev]) p.on("dialog", (d) => void d.accept());
  // Fail immediately if developer application code attempts a public namespace.
  await dev.addInitScript(() => {
    const w = window as any;
    w.namespaceViolations = [];
    const check = (ok: boolean, name: string) => {
      if (!ok) {
        w.namespaceViolations.push(name);
        void w.__violation(name);
        throw Error("cross-namespace " + name);
      }
    };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name: string, version?: number) {
      check(!["ed4-mobile-v1", "ed4-music-v1"].includes(name), name);
      return open.call(this, name, version);
    };
    const handle = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = function (
      name: string,
      options?: FileSystemGetDirectoryOptions,
    ) {
      check(name !== "ed4-music", name);
      return handle.call(this, name, options);
    };
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const old = Storage.prototype[method];
      (Storage.prototype as any)[method] = function (
        name: string,
        ...args: any[]
      ) {
        check(!name.startsWith("ed4-") || name.startsWith("ed4-dev:"), name);
        return (old as any).call(this, name, ...args);
      };
    }
  });
  await ready(pub);
  await expect(pub.locator("#developer-badge")).toHaveCount(0);
  await register(pub);
  await run(pub);
  await key(pub, "m", "RAW READ AND SEEK OK");
  await key(pub, "s", "SAVE WRITTEN");
  await stop(pub);
  const publicBefore = await state(pub);
  expect(publicBefore.profiles).toHaveLength(1);
  expect(Object.keys(publicBefore.raw)).toHaveLength(1);
  await ready(dev, true);
  await expect(dev.locator("#developer-badge")).toHaveText(
    "개발 빌드 · 진단 전용",
  );
  await expect(dev.locator("#play")).toBeDisabled();
  await expect(dev.locator("#profiles button")).toHaveCount(0);
  expect((await state(dev, true)).packs).toHaveLength(0);
  await register(dev, true);
  await run(dev);
  await key(dev, "m", "RAW READ AND SEEK OK");
  await key(dev, "s", "SAVE WRITTEN");
  await dev.locator("#fullscreen").click();
  await expect(dev.locator("#speed-toggle")).toBeEnabled();
  for (const value of ["true", "false"]) {
    await dev.locator("#speed-toggle").click();
    await expect(dev.locator("#speed-toggle")).toHaveAttribute(
      "aria-pressed",
      value,
    );
    await expect(dev.locator("#speed-toggle")).toBeEnabled();
  }
  await stop(dev);
  const developerBefore = await state(dev, true);
  expect(developerBefore.profiles[0].id).not.toBe(publicBefore.profiles[0].id);
  expect(Object.keys(developerBefore.raw)).toHaveLength(1);
  expect(await state(pub)).toEqual(publicBefore);
  await pub.reload();
  await dev.reload();
  await expect(pub.locator("#play")).toBeEnabled();
  await expect(dev.locator("#play")).toBeEnabled();
  expect(await state(pub)).toEqual(publicBefore);
  expect(await state(dev, true)).toEqual(developerBefore);
  const scopes = await pub.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations())
      .map((r) => new URL(r.scope).pathname)
      .sort(),
  );
  expect(scopes).toEqual([url(true), url()].sort());
  await expect.poll(() => cachesFor(pub)).toHaveLength(1);
  await expect.poll(() => cachesFor(dev, true)).toHaveLength(1);
  // Developer activation must not wait on or replace the running public session.
  await run(pub);
  await key(pub, "l", "ED4_SAVE_OK");
  const publicCache = await cachesFor(pub);
  await settings(dev, true);
  await dev
    .locator("#launcher-version")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  const devBeforeUpdate = await state(dev, true);
  await request.post("/__release?app=ed4-dev&version=current");
  await dev.locator("#update-check").click();
  await expect(dev.locator("#update-status")).toContainText(
    "검증된 새 실행기",
    { timeout: 30000 },
  );
  await expect(dev.locator("#update-apply")).toBeEnabled();
  await dev.locator("#update-apply").click();
  await expect(dev.locator("#launcher-build")).not.toContainText("-prior");
  await expect(pub.locator("#run-state")).toHaveText("실행 중");
  expect(await cachesFor(pub)).toEqual(publicCache);
  await key(pub, "ArrowUp", "KEY RECEIVED");
  await stop(pub);
  expect((await state(pub)).saves[0].files).toEqual(
    publicBefore.saves[0].files,
  );
  expect(await state(dev, true)).toEqual(devBeforeUpdate);
  // The reverse update also leaves the running developer engine and cache alone.
  await run(dev);
  await key(dev, "l", "ED4_SAVE_OK");
  const developerCache = await cachesFor(dev, true);
  await settings(pub);
  await pub
    .locator("#launcher-version")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await request.post("/__release?app=ed4&version=current");
  await pub.locator("#update-check").click();
  await expect(pub.locator("#update-status")).toContainText(
    "검증된 새 실행기",
    { timeout: 30000 },
  );
  await pub.locator("#update-apply").click();
  await expect(pub.locator("#launcher-build")).not.toContainText("-prior");
  expect(await cachesFor(dev, true)).toEqual(developerCache);
  await expect(dev.locator("#run-state")).toHaveText("실행 중");
  await key(dev, "ArrowUp", "KEY RECEIVED");
  await stop(dev);
  await context.setOffline(true);
  await pub.reload();
  await dev.reload();
  for (const p of [pub, dev]) {
    await expect(p.locator("#offline")).toHaveText("오프라인 준비 완료");
    await run(p);
    await key(p, "l", "ED4_SAVE_OK");
    await key(p, "m", "RAW READ AND SEEK OK");
    await stop(p);
  }
  await context.setOffline(false);
  // Public capability restriction vs developer two-point diagnostics.
  await pub.locator("#boot-open").evaluate((b: HTMLButtonElement) => {
    b.disabled = false;
    b.click();
  });
  await expect(pub.locator("#status")).toContainText("개발 빌드");
  await expect(pub.locator("#menu-audio-before")).toHaveCount(0);
  await expect(dev.locator("#menu-audio-before")).toHaveCount(1);
  const locks = await pub.evaluate(async () =>
    (await navigator.locks.query()).held?.map((lock) => lock.name).sort(),
  );
  expect(locks).toEqual(["ed4-mobile-dev-writer", "ed4-mobile-writer"]);
  await settings(dev, true);
  await dev.locator("#boot-open").click();
  await expect(dev.locator('#boot-engine option[value="phase9-8d"]')).toHaveCount(1);
  await expect(dev.locator('#boot-engine option[value="phase9-8k"]')).toHaveCount(1);
  await dev.locator('#boot-close').click();
  await dev.setViewportSize({ width: 844, height: 390 });
  await dev.screenshot({ path: info.outputPath("developer.png"), fullPage: true });
  await pub.setViewportSize({ width: 844, height: 390 });
  await pub.screenshot({ path: info.outputPath("public.png"), fullPage: true });
  const preserved = await state(pub);
  await settings(dev, true);
  const pack = developerBefore.packs[0].id;
  await dev.locator("#music-pack").selectOption("");
  await dev.locator("#music-link").click();
  await expect(dev.locator("#status")).toContainText("음악");
  await dev.locator("#music-pack").selectOption(pack);
  await dev.locator("#music-delete").click();
  await expect
    .poll(async () => Object.keys((await state(dev, true)).raw).length)
    .toBe(0);
  await dev.locator("#storage-open").click();
  await dev.locator("[data-delete-save]").click();
  await expect(dev.locator("[data-delete-save]")).toHaveCount(0);
  await dev.locator("[data-close=storage-dialog]").click();
  await dev.locator("#game-settings").click();
  await dev.locator("#remove-profile").click();
  await dev.locator("#storage-open").click();
  await dev.locator("[data-delete-archive]").click();
  await expect(dev.locator("[data-delete-archive]")).toHaveCount(0);
  await dev.locator("[data-close=storage-dialog]").click();
  await expect(dev.locator("#profiles button")).toHaveCount(0);
  await dev.reload();
  await expect(dev.locator("#play")).toBeDisabled();
  expect(await state(pub)).toEqual(preserved);
  expect(violations).toEqual([]);
  await writeFile(
    info.outputPath("isolation.json"),
    JSON.stringify(
      {
        scopes,
        locks,
        publicCache,
        developerCache,
        publicProfiles: preserved.profiles.length,
        publicRaw: Object.keys(preserved.raw).length,
        developerCleared: true,
      },
      null,
      2,
    ),
  );
});
