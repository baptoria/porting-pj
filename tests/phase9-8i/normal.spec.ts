import { test, expect, Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { memoryProbe } from "../../scripts/phase9-5b-probe.mjs";
import { register, trace, diagnostic, stop, text } from "./helpers";
test("same GAME.BAT and public aperture: direct/trace stable fail readback, direct/trace 9-7 and H/I succeed", async ({
  page,
}, info) => {
  await register(page, {
    "GAME.BAT": text("@ECHO OFF\r\nPROBE.COM\r\n"),
    "PROBE.COM": memoryProbe(3),
  });
  const rows = [];
  for (const [route, id] of [
    ["direct", "stable"],
    ["trace", "stable"],
    ["direct", "phase9-7"],
    ["trace", "phase9-7"],
    ["trace", "phase9-8h"],
    ["trace", "phase9-8i"],
  ]) {
    if (route === "direct") {
      await page.locator("#play-engine").selectOption(id);
      await page.locator("#play").click();
    } else await trace(page, id);
    await expect(page.locator("#logs")).toContainText(
      id === "stable"
        ? "PUBLIC_APERTURE_READBACK_MISMATCH"
        : "PUBLIC_468_COPY_AND_RETF_OK",
    );
    const d = await diagnostic(page);
    expect(d.engine.artifact.id).toBe(id);
    expect(d.engine.artifact.verification).toBe(id==="stable"?"pinned-release-hash":"sha256-of-compiled-module");
    expect(d.engine.runtimeErrors.events).toEqual([]);
    rows.push({
      route,
      id,
      settings: d.bootSettings,
      engine: d.engine.artifact,
      logs: d.logs,
    });
    await stop(page);
  }
  await writeFile(
    info.outputPath("routes.json"),
    JSON.stringify(rows, null, 2),
  );
});
test("explicit normal 9-7 saves and restores through direct GAME.BAT; I diagnostics discard writes and reuse RAW", async ({
  page,
  context,
}) => {
  const files = {
    ...unzipSync(await readFile("public/test-program.zip")),
    "GAME.BAT": text("@ECHO OFF\r\nED4TEST.COM\r\n"),
    "ED4-01.RAW": text("RAWTEST1\0\0\0\0"),
  };
  await register(page, files);
  await page.locator("#play-engine").selectOption("phase9-7");
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.keyboard.press("s");
  await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
  await stop(page);
  await page.reload();
  await expect(page.locator("#play-engine")).toHaveValue("phase9-7");
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK");
  await stop(page);
  const before = await snapshot(page);
  await context.setOffline(true);
  await page.reload();
  await trace(page, "phase9-8i");
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.keyboard.press("d");
  await expect(page.locator("#logs")).toContainText("SAVE DELETED");
  await page.keyboard.press("m");
  await expect(page.locator("#logs")).toContainText("RAW READ AND SEEK OK");
  await stop(page);
  expect(await snapshot(page)).toBe(before);
  await page.locator("#play").click();
  await expect(page.locator("#logs")).toContainText("ED4 TEST READY");
  await page.keyboard.press("l");
  await expect(page.locator("#logs")).toContainText("ED4_SAVE_OK");
  await stop(page);
});
test("normal worker creation failure shows exact launch stage and keeps diagnostics", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(u: string | URL, o?: WorkerOptions) {
        if (String(u).endsWith("/dos-worker.js"))
          throw Error("PUBLIC_WORKER_START_FAILURE");
        super(u, o);
      }
    };
  });
  await register(page, {
    "GAME.BAT": text("PROBE.COM\r\n"),
    "PROBE.COM": memoryProbe(3),
  });
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("worker-wasm-start");
  await expect(page.locator("#status")).toContainText(
    "PUBLIC_WORKER_START_FAILURE",
  );
  await expect(page.locator("#run-state")).toHaveText("시작 실패");
});

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("ed4-mobile-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const out: any = { db: {}, opfs: {} };
    for (const name of Array.from(db.objectStoreNames))
      out.db[name] = await new Promise((resolve, reject) => {
        const q = db.transaction(name).objectStore(name).getAll();
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    db.close();
    async function walk(dir: FileSystemDirectoryHandle, path: string) {
      for await (const [name, entry] of (dir as any).entries()) {
        if (entry.kind === "directory") await walk(entry, path + "/" + name);
        else {
          const bytes = await (await entry.getFile()).arrayBuffer();
          out.opfs[path + "/" + name] = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          );
        }
      }
    }
    await walk(await navigator.storage.getDirectory(), "");
    return JSON.stringify(out, (_, v) =>
      v instanceof Uint8Array ? Array.from(v) : v,
    );
  });
}

test("I corrupt worklet is refused with an explicit error and no fallback to Stable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = fetch;
    window.fetch = (input: any, init?: RequestInit) =>
      String(input).includes("audio-worklet-phase9-8i-")
        ? Promise.resolve(
            new Response("PUBLIC CORRUPT WORKLET", { status: 200 }),
          )
        : original(input, init);
  });
  await register(page, {
    "GAME.BAT": text("PROBE.COM\r\n"),
    "PROBE.COM": memoryProbe(3),
  });
  await page
    .locator("#advanced-settings")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator("#boot-open").click();
  await page.locator("#boot-engine").selectOption("phase9-8i");
  await page.locator("#boot-start").click();
  await expect(page.locator("#run-state")).toHaveText("시작 실패");
  await expect(page.locator("#status")).toContainText(
    "AudioWorklet 무결성 불일치",
  );
  const d = await diagnostic(page);
  expect(d.engine.artifact.id).toBe("phase9-8i");
  expect(d.engine.identity.actualEngine).toBeNull();
});

for(const id of ['stable','phase9-7'])test(`normal ${id} waits for the real first frame after backend ready`,async({page})=>{
 await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);let released=false,timer=false;const frames:any[]=[];this.addEventListener('message',e=>{if(!released&&['ws-frame-set-size','ws-update-lines'].includes(e.data?.name)){e.stopImmediatePropagation();frames.push(e.data);if(!timer){timer=true;setTimeout(()=>{released=true;for(const data of frames)this.dispatchEvent(new MessageEvent('message',{data}));},300);}}});}};});
 const files={...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':text('ED4TEST.COM\r\n')};await register(page,files);await page.locator('#play-engine').selectOption(id);await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#logs')).toContainText('DOS backend 준비 후 첫 화면 대기');await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await stop(page);
});
