import { expect, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { zipSync } from "fflate";
export async function register(page: Page, files: Record<string, Uint8Array>) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#simple-import").click();
  await page
    .locator("#simple-zip")
    .setInputFiles({
      name: "public-i.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
}
export async function trace(page: Page, id: string, policy = 0) {
  await page
    .locator("#advanced-settings")
    .evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator("#boot-open").click();
  await page.locator("#boot-engine").selectOption(id);
  await page.locator("#boot-cycles-policy").selectOption(String(policy));
  await page.locator("#boot-start").click();
  await expect(page.locator("#run-state")).toHaveText("실행 중");
}
export async function menu(page: Page) {
  if (
    (await page
      .locator("body")
      .evaluate((e) => e.classList.contains("running"))) &&
    (await page.locator("#player-menu").isVisible()) &&
    !((await page.locator("#play-area").getAttribute("class")) ?? "").includes(
      "menu-open",
    )
  )
    await page.locator("#player-menu").click();
}
export async function diagnostic(page: Page) {
  await menu(page);
  const promise = page.waitForEvent("download");
  await page.locator("#run-diagnostics").click();
  return JSON.parse(await readFile((await (await promise).path())!, "utf8"));
}
export async function stop(page: Page) {
  await menu(page);
  await page.locator("#stop").click();
  await expect(page.locator("#run-state")).toHaveText("종료됨");
}
export const text = (s: string) => new TextEncoder().encode(s);
