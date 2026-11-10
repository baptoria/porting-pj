import { test, expect, Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { timeProbe } from "../../scripts/phase9-8-time-probe.mjs";
async function start(page: Page, files: Record<string, Uint8Array>) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#simple-import").click();
  await page
    .locator("#simple-zip")
    .setInputFiles({
      name: "speed-public.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
  await page
    .locator("#advanced-settings")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator("#boot-open").click();
  await page.locator("#boot-engine").selectOption("phase9-8k");
  await page.locator("#boot-start").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
  await expect(page.locator("#speed-toggle")).toBeEnabled();
  await page.locator("#fullscreen").click();
}
async function menu(page: Page) {
  if (
    !((await page.locator("#play-area").getAttribute("class")) ?? "").includes(
      "menu-open",
    )
  )
    await page.locator("#player-menu").click();
}
async function stop(page: Page) {
  await menu(page);
  await page.locator("#stop").click();
}
async function diagnostic(page: Page) {
  await menu(page);
  const p = page.waitForEvent("download");
  await page.locator("#run-diagnostics").click();
  const d = JSON.parse(await readFile((await (await p).path())!, "utf8"));
  await page.locator("#player-menu").click();
  return d;
}
for (const cycles of ["12000", "max"])
  test(`K BIOS repeated speed measurement (max must sustain supply), scene export and restart, cycles ${cycles}`, async ({
    page,
  }, info) => {
    const bundle = zipSync({
      "TIMER.COM": timeProbe(),
      ".jsdos/dosbox.conf": new TextEncoder().encode(
        `[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=${cycles}\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nTIMER.COM\n`,
      ),
    });
    await page.addInitScript(
      ({ bundle }) => {
        const w = window as any;
        w.timerEvents = [];
        const Native = Worker;
        window.Worker = class extends Native {
          constructor(u: string | URL, o?: WorkerOptions) {
            super(u, o);
            this.addEventListener("message", (e) => {
              if (e.data?.name === "ws-stdout")
                for (const m of e.data.props.message.matchAll(
                  /TIMER_BEGIN|TIMER_DONE/g,
                ))
                  w.timerEvents.push({ kind: m[0], time: performance.now() });
            });
          }
          postMessage(m: any, t?: any) {
            if (m?.name === "wc-run") {
              const bytes = new Uint8Array(bundle);
              m = { ...m, props: { ...m.props, bundles: [bytes] } };
              t = [bytes.buffer];
            }
            super.postMessage(m, t);
          }
        };
      },
      { bundle: Array.from(bundle) },
    );
    await start(page, { "TIMER.COM": timeProbe() });
    await expect(page.locator("#logs")).toContainText("TIMER_READY");
    const rows: any[] = [];
    let n = 0;
    for (const rate of [1, 2, 1, 2, 1]) {
      if (rows.length) {
        await page.locator("#speed-toggle").click();
        await expect(page.locator("#speed-toggle")).toHaveAttribute(
          "aria-pressed",
          String(rate === 2),
        );
        await expect(page.locator("#speed-toggle")).toBeEnabled();
      }
      await page.locator("#canvas").focus();
      await page.keyboard.press("t");
      n += 2;
      await expect
        .poll(() => page.evaluate(() => (window as any).timerEvents.length))
        .toBe(n);
      const es = await page.evaluate(() => (window as any).timerEvents);
      rows.push({ rate, ms: es[n - 1].time - es[n - 2].time });
      if(cycles==='max'){
        const observation=await diagnostic(page),speed=observation.engine.integratedSpeed;
        expect(speed.fault).toBeNull();
        if(speed.fault){
          expect(speed.rate).toBe(1);expect(speed.verified).toBe(true);expect(speed.fault).toContain('1× 복구 확인');expect(observation.engine.runtimeErrors.events).toEqual([]);await expect(page.locator('#speed-toggle')).toBeDisabled();
          await writeFile(info.outputPath('max-incomplete.json'),JSON.stringify({completed:false,reason:'max supply starvation; NOT sustained 2x',rows,engine:observation.engine},null,2));await stop(page);return;
        }
      }

    }
    expect(rows[0].ms / rows[1].ms).toBeGreaterThan(1.7);
    expect(rows[0].ms / rows[1].ms).toBeLessThan(2.3);
    expect(rows[2].ms / rows[0].ms).toBeGreaterThan(0.85);
    expect(rows[2].ms / rows[0].ms).toBeLessThan(1.15);
    await menu(page);
    await page
      .locator("#scene-panel")
      .evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await page.locator("#scene-name").selectOption("필드");
    await page.locator("#scene-capture").click();
    await expect(page.locator("#scene-status")).toContainText("1개 장면");
    const d = await diagnostic(page);
    expect(d.engine.artifact.id).toBe("phase9-8k");
    expect(d.engine.artifact.verification).toBe("sha256-of-compiled-module");
    expect(
      d.engine.integratedSpeed.control.events.some(
        (e: any) => e.kind === "ack" && e.rate === 2,
      ),
    ).toBe(true);
    expect(d.engine.integratedSpeed.fault).toBeNull();
    expect(d.engine.cpuHistory.enabled).toBe(false);
    expect(d.engine.runtimeErrors.events).toEqual([]);
    await writeFile(
      info.outputPath("timings.json"),
      JSON.stringify({ rows, engine: d.engine }, null, 2),
    );
    await page.locator("#canvas").focus();
    await page.keyboard.press("q");
    await stop(page);
    await expect(page.locator("#speed-toggle")).toBeDisabled();
    await page.locator("#boot-open").click();
    await expect(page.locator("#boot-engine")).toHaveValue("stable");
    await page.locator("#boot-engine").selectOption("phase9-8k");
    await page.locator("#boot-start").click();
    await expect(page.locator("#run-state")).toHaveText("실행 중");
    await expect(page.locator("#speed-toggle")).toBeEnabled();
    await expect(page.locator("#speed-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.locator("#fullscreen").click();
    await stop(page);
  });
