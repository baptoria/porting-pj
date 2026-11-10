import { test, expect, Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { register, trace, diagnostic, stop, menu, text } from "./helpers";
async function fixture(page: Page, cycles: string) {
  const program = Buffer.from(
    (await readFile("tests/fixtures/phase9-8g-mix-probe.b64", "utf8")).trim(),
    "base64",
  );
  const bundle = zipSync({
    "MIX.COM": program,
    ".jsdos/dosbox.conf": text(
      `[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=${cycles}\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nMIX.COM\n`,
    ),
  });
  await page.addInitScript(
    ({ bundle }) => {
      const w = window as any;
      w.pcmMain = 0;
      w.mixDone = 0;
      w.pcmArrival = { last: 0, count: 0, sum: 0, max: 0 };
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(u: string | URL, o?: WorkerOptions) {
          super(u, o);
          this.addEventListener("message", (e) => {
            if (e.data?.name === "ws-sound-push") {
              w.pcmMain++;
              const a = w.pcmArrival,
                now = performance.now();
              if (a.last) {
                const dt = now - a.last;
                a.count++;
                a.sum += dt;
                a.max = Math.max(a.max, dt);
              }
              a.last = now;
            }
            if (e.data?.name === "ws-stdout")
              w.mixDone += (
                e.data.props.message.match(/MIX_DONE/g) ?? []
              ).length;
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
  await register(page, { "MIX.COM": program });
}
async function full(page: Page) {
  if(await page.locator('#fullscreen').isVisible())await page.locator('#fullscreen').click();
  else await expect(page.locator('body')).toHaveClass(/running/); // Mobile already enters immersive mode.
}
async function tone(page: Page, n: number) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("3");
  await expect.poll(() => page.evaluate(() => (window as any).mixDone)).toBe(n);
}
for (const id of ["phase9-8h", "phase9-8i"])
  for (const cycles of ["12000", "16000", "24000", "max"])
    test(`${id} cycles ${cycles}: 30s same public BGM+SE, guest progress and supply`, async ({
      page,
    }, info) => {
      await fixture(page, cycles);
      await trace(page, id);
      await expect(page.locator("#logs")).toContainText("MIX_READY");
      await full(page);
      await page.locator("#speed-toggle").click();
      await expect(page.locator("#speed-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.waitForTimeout(1000);
      const before = await diagnostic(page);
      await page.locator("#run-performance").click();
      await page.locator("#player-menu").click();
      const start = performance.now();
      let n = 0;
      while (performance.now() - start < 31000) await tone(page, ++n);
      const after = await diagnostic(page);
      expect(after.engine.runtimeErrors.events).toEqual([]);
      expect(after.engine.integratedSpeed.audio.droppedFrames).toBe(0);
      expect(after.engine.integratedSpeed.audio.overlaps).toBe(0);
      const a = after.engine.integratedSpeed;
      if (a.fault) {
        expect(a.rate).toBe(1);
        expect(a.verified).toBe(true);
        expect(a.fault).toContain("1× 복구 확인");
      } else expect(a.rate).toBe(2);
      if (id === "phase9-8i") {
        expect(await page.evaluate(() => (window as any).pcmMain)).toBe(0);
        expect(a.audio.sourceNodesCreated).toBe(0);
        expect(after.engine.audioSupply.source).toBe("worker-direct-port");
      }
      await writeFile(
        info.outputPath("comparison.json"),
        JSON.stringify(
          {
            id,
            cycles,
            seconds: (performance.now() - start) / 1000,
            tones: n,
            mainPcmArrival: await page.evaluate(
              () => (window as any).pcmArrival,
            ),
            before: before.engine,
            after: after.engine,
          },
          null,
          2,
        ),
      );
      if (!a.fault) {
        await page.locator("#player-menu").click();
        await page.locator("#speed-toggle").click();
        await expect(page.locator("#speed-toggle")).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
      await stop(page);
    });
test("I direct audio survives main-thread stall and returns 1x without replaying queued PCM", async ({
  page,
}, info) => {
  await fixture(page, "12000");
  await trace(page, "phase9-8i");
  await full(page);
  await page.locator("#speed-toggle").click();
  await expect(page.locator("#speed-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("3");
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const end = performance.now() + 220;
    while (performance.now() < end) {}
  });
  await page.waitForTimeout(500);
  const d = await diagnostic(page);
  await writeFile(
    info.outputPath("stall.json"),
    JSON.stringify(d.engine, null, 2),
  );
  expect(d.engine.integratedSpeed.fault).toBeNull();
  expect(d.engine.integratedSpeed.audio.underflowFrames).toBe(0);
  expect(d.engine.integratedSpeed.audio.droppedFrames).toBe(0);
  await page.locator("#player-menu").click();
  await page.locator("#speed-toggle").click();
  await expect(page.locator("#speed-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await writeFile(
    info.outputPath("stall.json"),
    JSON.stringify(d.engine, null, 2),
  );
  await stop(page);
});
test("I temporary fixed cycles applies after guest max and restores observed auto policy on 1x", async ({
  page,
}, info) => {
  await fixture(page, "max");
  await trace(page, "phase9-8i", 16000);
  await full(page);
  const before = await diagnostic(page);
  expect(before.engine.integratedSpeed.control.last.cyclesAuto).toBe(1);
  await page.locator("#player-menu").click();
  await page.locator("#speed-toggle").click();
  await expect(page.locator("#speed-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(1100);
  const twice = await diagnostic(page);
  expect(twice.engine.integratedSpeed.control.last.cycles).toBe(16000);
  expect(twice.engine.integratedSpeed.control.last.cyclesAuto).toBe(0);
  await page.locator("#player-menu").click();
  await page.locator("#speed-toggle").click();
  await expect(page.locator("#speed-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const restored = await diagnostic(page);
  expect(restored.engine.integratedSpeed.control.last.cyclesAuto).toBe(1);
  await writeFile(
    info.outputPath("policy.json"),
    JSON.stringify(
      {
        before: before.engine.integratedSpeed,
        twice: twice.engine.integratedSpeed,
        restored: restored.engine.integratedSpeed,
      },
      null,
      2,
    ),
  );
  await stop(page);
});



test.describe('mobile I',()=>{
 test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
 test('I max boot then explicit 16000 policy sustains 2x for 31s and restores max on 1x',async({page},info)=>{
  await fixture(page,'max');await trace(page,'phase9-8i',16000);await full(page);await page.locator('#speed-toggle').tap();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(300);const before=await diagnostic(page);await page.locator('#run-performance').click();await page.locator('#player-menu').click();const start=performance.now();let n=0;
  while(performance.now()-start<31000)await tone(page,++n);
  const after=await diagnostic(page),s=after.engine.integratedSpeed,seconds=(performance.now()-start)/1000;
  if(!s.fault&&s.rate===2){await page.locator('#player-menu').click();await page.locator('#speed-toggle').tap();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');}
  const restored=await diagnostic(page);await page.screenshot({path:info.outputPath('mobile-i.png')});await stop(page);
  await writeFile(info.outputPath('policy-sustained.json'),JSON.stringify({seconds,tones:n,before:before.engine,after:after.engine,restored:restored.engine},null,2));
  expect(s.fault).toBeNull();expect(s.rate).toBe(2);expect(s.control.last.cycles).toBe(16000);expect(s.control.last.cyclesAuto).toBe(0);expect(s.audio.underflowFrames).toBe(0);expect(s.audio.droppedFrames).toBe(0);expect(after.engine.performanceWindow.guestTicksPerWallSecond).toBeGreaterThan(1900);expect(after.engine.performanceWindow.guestTicksPerWallSecond).toBeLessThan(2100);expect(restored.engine.integratedSpeed.control.last.cyclesAuto).toBe(1);expect(restored.engine.integratedSpeed.rate).toBe(1);
 });
});
