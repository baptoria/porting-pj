import { test, expect, Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { register, trace, diagnostic, stop, menu, text } from "../phase9-8i/helpers";
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
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(u: string | URL, o?: WorkerOptions) {
          super(u, o);
          this.addEventListener("message", (e) => {
            if (e.data?.name === "ws-sound-push") w.pcmMain++;
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
  await page.locator("#fullscreen").click();
}
async function tone(page: Page, n: number) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("3");
  await expect.poll(() => page.evaluate(() => (window as any).mixDone)).toBe(n);
}

test("K real AudioWorklet output has 500/1000 then 1000/2000 Hz and half duration; pause/resume and 1x return", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.capture = { rate: 0, blocks: [] };
    const make = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = make.call(this);
      if (!w.capture.rate) {
        w.capture.rate = this.sampleRate;
        const tap = this.createScriptProcessor(1024, 1, 1);
        tap.onaudioprocess = (e) => {
          if (w.capture.blocks.length < 500)
            w.capture.blocks.push(Array.from(e.inputBuffer.getChannelData(0)));
          e.outputBuffer.getChannelData(0).fill(0);
        };
        gain.connect(tap);
        tap.connect(this.destination);
        w.publicTap = tap;
      }
      return gain;
    };
  });
  await fixture(page, "12000");
  await trace(page, "phase9-8k");
  await expect(page.locator("#logs")).toContainText("MIX_READY");
  await full(page);
  const results: any[] = [];
  for (const rate of [1, 2, 1]) {
    if (results.length) {
      await page.locator("#speed-toggle").click();
      await expect(page.locator("#speed-toggle")).toHaveAttribute(
        "aria-pressed",
        String(rate === 2),
      );
    }
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      (window as any).capture.blocks = [];
    });
    await tone(page, results.length + 1);
    await page.waitForTimeout(250);
    const output = await page.evaluate(
      ({ rate }) => {
        const c = (window as any).capture,
          samples = c.blocks.flat(),
          sr = c.rate,
          first = samples.findIndex((x: number) => Math.abs(x) > 0.01),
          last = samples.reduce(
            (n: number, x: number, i: number) => (Math.abs(x) > 0.01 ? i : n),
            -1,
          );
        const win = samples.slice(
          first + Math.floor((0.12 / rate) * sr),
          first + Math.floor((0.37 / rate) * sr),
        );
        const amp = (hz: number) => {
          let a = 0,
            b = 0;
          for (let i = 0; i < win.length; i++) {
            a += win[i] * Math.cos((2 * Math.PI * hz * i) / sr);
            b += win[i] * Math.sin((2 * Math.PI * hz * i) / sr);
          }
          return (2 * Math.hypot(a, b)) / win.length;
        };
        return {
          rate,
          outputRate: sr,
          span: (last - first) / sr,
          bgmHz: 500 * rate,
          seHz: 1000 * rate,
          bgmAmplitude: amp(500 * rate),
          seAmplitude: amp(1000 * rate),
          sampleCount: samples.length,
        };
      },
      { rate },
    );
    const d = await diagnostic(page);
    results.push({ ...output, engine: d.engine });
    await page.locator("#player-menu").click();
    expect(output.bgmAmplitude).toBeGreaterThan(0.01);
    expect(output.seAmplitude).toBeGreaterThan(0.01);
    expect(d.engine.integratedSpeed.fault).toBeNull();
    if (rate === 2) {
      await menu(page);
      await page.locator("#pause").click();
      await expect(page.locator("#run-state")).toHaveText("일시 정지");
      await page.waitForTimeout(1200);
      await page.locator("#pause").click();
      await expect(page.locator("#run-state")).toHaveText("실행 중");
      await page.locator("#player-menu").click();
      await expect(page.locator("#speed-toggle")).toBeEnabled();
    }
  }
  await writeFile(
    info.outputPath("rendered-output.json"),
    JSON.stringify(results, null, 2),
  );
  expect(results[0].span / results[1].span).toBeGreaterThan(1.9);
  expect(results[0].span / results[1].span).toBeLessThan(2.1);
  expect(Math.abs(results[2].span - results[0].span)).toBeLessThan(0.025);
  await stop(page);
});

test("K real persistent producer starvation triggers verified native 1x, not CPU blame or silent replacement", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const w = window as any,
      Native = Worker;
    window.Worker = class extends Native {
      constructor(u: string | URL, o?: WorkerOptions) {
        super(u, o);
        if (String(u).includes("dos-worker-phase9-8k-")) {
          w.publicWorker = this;
          this.addEventListener("message", (e) => {
            if (e.data?.props?.sessionId)
              w.publicSession = e.data.props.sessionId;
          });
        }
      }
    };
  });
  await fixture(page, "12000");
  await trace(page, "phase9-8k");
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
    const s = window as any,
      w = s.publicWorker,
      props = { sessionId: s.publicSession };
    w.postMessage({ name: "wc-pause", props });
    setTimeout(() => w.postMessage({ name: "wc-resume", props }), 350);
  });
  await menu(page);
  await expect(page.locator("#speed-limit")).toContainText("1× 복구 확인", {
    timeout: 8000,
  });
  await page.waitForTimeout(3500);
  const d = await diagnostic(page);
  expect(d.engine.integratedSpeed.recoveryOutput.status).toBe("recent-output-healthy");
  await writeFile(
    info.outputPath("recovery.json"),
    JSON.stringify(d.engine, null, 2),
  );
  expect(d.engine.artifact.id).toBe("phase9-8k");
  expect(d.engine.integratedSpeed.rate).toBe(1);
  expect(d.engine.integratedSpeed.verified).toBe(true);
  expect(d.engine.integratedSpeed.audio.underflowFrames).toBeGreaterThan(0);
  expect(d.engine.integratedSpeed.audio.droppedFrames).toBe(0);
  expect(d.engine.runtimeErrors.events).toEqual([]);
  await stop(page);
});
