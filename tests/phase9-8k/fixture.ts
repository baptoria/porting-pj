import { test, expect, Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { register, trace, diagnostic, stop, menu, text } from "../phase9-8i/helpers";
export async function fixture(page: Page, cycles: string) {
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
export async function full(page: Page) {
  if(await page.locator('#fullscreen').isVisible())await page.locator('#fullscreen').click();
  else await expect(page.locator('body')).toHaveClass(/running/); // Mobile already enters immersive mode.
}
export async function tone(page: Page, n: number) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("3");
  await expect.poll(() => page.evaluate(() => (window as any).mixDone)).toBe(n);
}
