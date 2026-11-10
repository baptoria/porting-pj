import { test, expect, Page, chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { folderFixture } from "../folder-fixture";
import { writeIsoFixture, rawTone } from "../../scripts/iso-fixture.mjs";
import { testProgram } from "../../scripts/test-program.mjs";
const text = (s: string) => new TextEncoder().encode(s);
const tracks = {
  "ED4/EFFECT/ED4-01.RAW": rawTone(440, 0.4),
  "ED4/EFFECT/ED4-02.RAW": rawTone(660, 0.4),
};
async function fixture(
  extra: Record<string, Uint8Array> = {},
  songs: any = tracks,
) {
  const dir = await folderFixture(
    {
      "ED4/GAME.BAT": text("ED4TEST.COM\r\n"),
      "ED4/ED4TEST.COM": testProgram(
        ["EFFECT\\ED4-01.RAW", "EFFECT\\ED4-02.RAW"],
        false,
      ),
      "DosBox/launcher.txt": text("not game"),
      ...extra,
    },
    "dooky",
  );
  await mkdir(join(dir, "DosBox/CD"), { recursive: true });
  await writeIsoFixture(join(dir, "DosBox/CD/ED4.iso"), songs);
  return dir;
}
async function boot(page: Page) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("http://localhost:4173/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료", {
    timeout: 30000,
  });
}
async function register(page: Page, dir: string) {
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(dir);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible({
    timeout: 60000,
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-mobile-v1");
      q.onsuccess = () => r(q.result);
    });
    const result: any = {};
    for (const n of ["archives", "profiles", "saves", "recovery"])
      result[n] = await new Promise((r) => {
        const q = db.transaction(n).objectStore(n).getAll();
        q.onsuccess = () => r(q.result);
      });
    db.close();
    const md = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-music-v1");
      q.onsuccess = () => r(q.result);
    });
    result.packs = Array.from(md.objectStoreNames).includes("packs")
      ? await new Promise((r) => {
          const q = md.transaction("packs").objectStore("packs").getAll();
          q.onsuccess = () => r(q.result);
        })
      : [];
    md.close();
    result.opfs = [];
    try {
      const dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("ed4-music");
      for await (const [id, pack] of (dir as any).entries())
        for await (const [key, h] of pack.entries()) {
          const f = await h.getFile();
          result.opfs.push({ id, key, size: f.size });
        }
    } catch {}
    result.opfs.sort((a: any, b: any) =>
      (a.id + a.key).localeCompare(b.id + b.key),
    );
    return JSON.parse(
      JSON.stringify(result, (_, v) =>
        v instanceof Uint8Array ? Array.from(v) : v,
      ),
    );
  });
}
async function normal(page: Page) {
  await page.locator("#game-settings").click();
  await page.locator("#play-engine").selectOption("phase9-7");
  await page.locator("[data-close=settings-dialog]").click();
}
async function run(page: Page) {
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
}
async function stop(page: Page) {
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
}

test("one parent-folder selection imports ISO songs; DOS lazy reads, save, restart and offline persistence", async ({
  browser,
}, info) => {
  const profile = resolve("artifacts/phase9-8n", `profile-${Date.now()}`);
  let context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    viewport: { width: 844, height: 390 },
  });
  try {
    let page = context.pages()[0];
    await boot(page);
    await register(page, await fixture());
    await expect(page.locator("#status")).toContainText("음악 파일 2개");
    await normal(page);
    const initial = await state(page);
    expect(initial.profiles).toHaveLength(1);
    expect(initial.packs).toHaveLength(1);
    expect(initial.opfs).toHaveLength(2);
    expect(initial.opfs.reduce((n: number, e: any) => n + e.size, 0)).toBe(
      Object.values(tracks).reduce((n, b) => n + b.length, 0),
    );
    expect(Object.keys(initial.archives[0].files)).toEqual(
      expect.arrayContaining(["GAME.BAT", "ED4TEST.COM"]),
    );
    expect(
      Object.keys(initial.archives[0].files).some(
        (p) => p.includes("DOSBOX") || p.endsWith(".RAW") || p.endsWith(".ISO"),
      ),
    ).toBe(false);
    for (const t of initial.packs[0].tracks)
      expect(t.sha256).toBe(
        createHash("sha256")
          .update(tracks[("ED4/" + t.path) as keyof typeof tracks])
          .digest("hex"),
      );
    await run(page);
    await page.locator("#canvas").focus();
    await page.keyboard.press("m");
    await expect(page.locator("#logs")).toContainText("RAW READ AND SEEK OK");
    await page.keyboard.press("n");
    await expect
      .poll(
        async () =>
          (
            (await page.locator("#logs").textContent())!.match(
              /RAW READ AND SEEK OK/g,
            ) || []
          ).length,
      )
      .toBe(2);
    await page.keyboard.press("s");
    await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
    await stop(page);
    const before = await state(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
    });
    page = context.pages()[0];
    await context.setOffline(true);
    await boot(page);
    expect(await state(page)).toEqual(before);
    await run(page);
    await page.keyboard.press("l");
    await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK");
    await page.keyboard.press("m");
    await expect(page.locator("#logs")).toContainText("RAW READ AND SEEK OK");
    await stop(page);
  } finally {
    await context.close();
  }
});

test("stored ISO slices feed existing real-time decoder: pitch, switching, loop and stop", async ({
  page,
}) => {
  await boot(page);
  await register(page, await fixture());
  const script = await readFile("scripts/phase9-8b-bgm.mjs", "utf8");
  const results = await page.evaluate(async (script) => {
    const url = URL.createObjectURL(
      new Blob([script], { type: "text/javascript" }),
    );
    const { RealtimeBgm } = await import(/* @vite-ignore */ url);
    URL.revokeObjectURL(url);
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("ed4-music-v1");
      q.onsuccess = () => r(q.result);
    });
    const packs: any[] = await new Promise((r) => {
      const q = db.transaction("packs").objectStore("packs").getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    const pack = packs[0];
    const dir = await (
      await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("ed4-music")
    ).getDirectoryHandle(pack.id);
    const files = await Promise.all(
      pack.tracks.map(async (t: any) =>
        (await dir.getFileHandle(t.key)).getFile(),
      ),
    );
    const out = [];
    const format = { encoding: "pcm16le", channels: 2, rate: 22050, offset: 8 };
    for (const file of files) {
      const ctx = new OfflineAudioContext(2, 48000, 48000),
        p = new RealtimeBgm(ctx, ctx.destination, () => true);
      await p.command({ sequence: 1, type: "play", file, format, loop: true });
      const tasks = [];
      for (const time of [0.15, 0.3, 0.45, 0.6, 0.75])
        tasks.push(
          ctx.suspend(time).then(async () => {
            await p.pump();
            await ctx.resume();
          }),
        );
      const rendered = await ctx.startRendering();
      await Promise.all(tasks);
      const b = rendered.getChannelData(0);
      let crosses = 0;
      for (let i = 4801; i < 43200; i++)
        if (b[i - 1] <= 0 && b[i] > 0) crosses++;
      out.push({
        hz: crosses / 0.8,
        seconds: rendered.duration,
        maxRead: p.maxRead,
        underruns: p.underruns,
      });
      p.dispose();
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const p = new RealtimeBgm(ctx, ctx.destination, () => true);
    await p.command({
      sequence: 1,
      type: "play",
      file: files[0],
      format,
      loop: true,
    });
    await p.command({
      sequence: 2,
      type: "play",
      file: files[1],
      format,
      loop: true,
    });
    const switched = p.file === files[1];
    await p.command({ sequence: 3, type: "stop" });
    const stopped = p.nodes.size === 0 && p.state === "stopped";
    p.dispose();
    await ctx.close();
    return { out, switched, stopped };
  }, script);
  expect(results.out[0].hz).toBeGreaterThan(438);
  expect(results.out[0].hz).toBeLessThan(442);
  expect(results.out[1].hz).toBeGreaterThan(658);
  expect(results.out[1].hz).toBeLessThan(662);
  expect(
    results.out.every(
      (r) => r.seconds === 1 && r.underruns === 0 && r.maxRead <= 44100,
    ),
  ).toBe(true);
  expect(results.switched && results.stopped).toBe(true);
  await writeFile(
    "artifacts/phase9-8n/synthetic-audio.json",
    JSON.stringify(results, null, 2),
  );
});

test("bad ISO/header is optional; existing profiles, RAW and saves survive; no ISO works", async ({
  page,
}) => {
  await boot(page);
  await register(page, await fixture());
  await normal(page);
  await run(page);
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await stop(page);
  const before = await state(page);
  const bad = await fixture();
  await writeFile(join(bad, "DosBox/CD/ED4.iso"), "broken");
  await register(page, bad);
  await expect(page.locator("#status")).toContainText(
    "음악 일부 또는 전체를 연결하지 못",
  );
  let after = await state(page);
  expect(after.saves).toEqual(before.saves);
  expect(after.packs).toEqual(before.packs);
  expect(after.opfs).toEqual(before.opfs);
  expect(
    after.profiles.find((p: any) => p.id === before.profiles[0].id),
  ).toEqual(before.profiles[0]);
  await run(page);
  await stop(page);
  await register(
    page,
    await fixture({}, { "ED4/EFFECT/A.RAW": new Uint8Array(12) }),
  );
  await expect(page.locator("#status")).toContainText("RAW 헤더");
  expect((await state(page)).packs).toEqual(before.packs);
  await register(
    page,
    await folderFixture(
      { "GAME.BAT": text("ED4TEST.COM"), "ED4TEST.COM": testProgram() },
      "ordinary",
    ),
  );
  await run(page);
  await stop(page);
});

test("quota failure in optional music rolls back then registers only the body", async ({
  page,
}) => {
  await boot(page);
  await register(page, await fixture());
  const before = await state(page);
  await page.evaluate(() => {
    const real = navigator.storage.estimate.bind(navigator.storage);
    (window as any).restoreSpace = () => (navigator.storage.estimate = real);
    navigator.storage.estimate = async () => ({ quota: 32000, usage: 0 });
  });
  await register(page, await fixture());
  await expect(page.locator("#status")).toContainText(
    "음악 일부 또는 전체를 연결하지 못",
  );
  await expect(page.locator("#status")).toContainText("저장 공간");
  const after = await state(page);
  expect(after.packs).toEqual(before.packs);
  expect(after.opfs).toEqual(before.opfs);
  expect(after.profiles).toHaveLength(2);
  expect(after.profiles.filter((p: any) => !p.music)).toHaveLength(1);
  await page.evaluate(() => (window as any).restoreSpace());
});

test("cancel during sparse large ISO music storage preserves previous data and removes staged OPFS", async ({
  page,
}) => {
  await boot(page);
  await register(page, await fixture());
  const before = await state(page);
  const size = 96 * 1024 * 1024 + 8,
    head = new Uint8Array(8),
    view = new DataView(head.buffer);
  view.setUint16(0, 3, true);
  view.setUint16(2, 22050, true);
  view.setUint32(4, size - 8, true);
  const dir = await fixture({}, { "ED4/EFFECT/BIG.RAW": { size, head } });
  await page.locator("#simple-import").click();
  await page.locator("#simple-folder").setInputFiles(dir);
  await expect(page.locator("#simple-progress-text")).toContainText("보관");
  await page.locator("#simple-cancel").click();
  await expect(page.locator("body")).not.toHaveClass(/busy/);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  expect(await state(page)).toEqual(before);
});

test("actual local distribution: separate installations, ISO import and persisted file hashes (no game execution)", async ({
  browser,
}, info) => {
  test.skip(!process.env.ED4_LOCAL_FOLDER);
  test.setTimeout(180000);
  const profile = resolve(
    "artifacts/phase9-8n",
    `actual-profile-${Date.now()}`,
  );
  let context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
  });
  try {
    let page = context.pages()[0];
    await boot(page);
    await page.locator("#simple-import").click();
    await page
      .locator("#simple-folder")
      .setInputFiles(process.env.ED4_LOCAL_FOLDER!);
    await expect(page.locator("#simple-folder-confirm")).toBeDisabled();
    await page.locator("#simple-folder-root").selectOption("ED4");
    await expect(page.locator("#simple-folder-summary")).toContainText(
      "다른 하위 게임",
    );
    await page.locator("#simple-folder-confirm").click();
    await expect
      .poll(
        async () =>
          !(await page.locator("#simple-import-dialog").isVisible()) ||
          (await page
            .locator("#status")
            .evaluate((e) => e.classList.contains("error"))),
        { timeout: 150000 },
      )
      .toBe(true);
    expect(
      await page.locator("#simple-import-dialog").isVisible(),
      (await page.locator("#status").textContent()) ?? "",
    ).toBe(false);
    const saved = await state(page);
    expect(saved.packs).toHaveLength(1);
    expect(saved.profiles[0].settings.prelude).toBe("LOADER.COM");
    expect(saved.profiles[0].executable).toBe("GAME.BAT");
    expect(
      Object.keys(saved.archives[0].files).some(
        (p) => p.startsWith("ED4/") || p.includes("DOSBOX"),
      ),
    ).toBe(false);
    const index = JSON.parse(
      await readFile("artifacts/phase9-8n/actual-parser.json", "utf8"),
    );
    expect(saved.packs[0].tracks).toHaveLength(index.raw.length);
    expect(saved.packs[0].bytes).toBe(
      index.raw.reduce((n: number, t: any) => n + t.size, 0),
    );
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
    });
    await context.setOffline(true);
    page = context.pages()[0];
    await boot(page);
    const restored = await state(page);
    const persistedHashes = await page.evaluate(async (pack: any) => {
      const dir = await (
        await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("ed4-music")
      ).getDirectoryHandle(pack.id);
      const out: Record<string, string> = {};
      for (const t of pack.tracks) {
        const f = await (await dir.getFileHandle(t.key)).getFile();
        out[t.path] = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
          ),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
      }
      return out;
    }, saved.packs[0]);
    for (const t of saved.packs[0].tracks)
      expect(persistedHashes[t.path]).toBe(t.sha256);
    expect(restored.packs).toEqual(saved.packs);
    expect(restored.opfs).toEqual(saved.opfs);
    await writeFile(
      "artifacts/phase9-8n/actual-browser-import.json",
      JSON.stringify(
        {
          profileCount: saved.profiles.length,
          executable: saved.profiles[0].executable,
          prelude: saved.profiles[0].settings.prelude,
          bodyFiles: Object.keys(saved.archives[0].files).length,
          tracks: saved.packs[0].tracks.map((t: any) => ({
            path: t.path,
            size: t.size,
            sha256: t.sha256,
          })),
          opfsBytes: saved.opfs.reduce((n: number, t: any) => n + t.size, 0),
          reloaded: true,
          browserProcessRestarted: true,
          offline: true,
          persistedHashesVerified: Object.keys(persistedHashes).length,
          gameExecuted: false,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: info.outputPath("actual-registered.png") });
  } finally {
    await context.close();
  }
});
