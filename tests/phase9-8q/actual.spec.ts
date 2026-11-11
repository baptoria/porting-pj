// Opt-in, read-only original folder. Isolated browser; no game data in fixtures.
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { menu, stop, diagnostic } from "../phase9-8i/helpers";
test("actual folder automatically starts original game with native directory CD", async ({
  page,
  context,
}, info) => {
  test.skip(!process.env.ED4_Q_LOCAL_FOLDER);
  test.setTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4-dev/");
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  await page.locator("#simple-import").click();
  await page
    .locator("#simple-folder")
    .setInputFiles(process.env.ED4_Q_LOCAL_FOLDER!);
  await expect(page.locator("#simple-import-dialog")).not.toBeVisible({
    timeout: 120000,
  });
  for (const stage of ["first", "offline-restart"]) {
    if (stage === "offline-restart") {
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
    }
    await page.locator("#play").click();
    await expect(page.locator("#logs")).toContainText("Now Loading...", {
      timeout: 30000,
    });
    await page.waitForTimeout(8000);
    await page
      .locator("#canvas")
      .screenshot({ path: info.outputPath(stage + ".png") });
    await menu(page);
    await page.locator("#ingame-advanced").click();
    const data = await diagnostic(page);
    expect(data.automaticBoot.decision.registration.decision.detected).toBe(true);
    expect(data.automaticBoot.decision.registration.decision.application.applied).toBe(true);
    expect(data.automaticBoot.decision.beforeLaunch.checks.musicPath).toBe(true);
    expect(data.engine.music.reads).toBeGreaterThan(0);
    expect(data.engine.audioSamples).toBeGreaterThan(0);
    expect(data.engine.runtimeErrors.events).toEqual([]);
    expect(data.profile.launch.presetId).toBe(
      "ed4-dooky-directory-cd-experimental-v1",
    );
    expect(data.automaticBoot.musicInitialization).toBe(
      "passed-failure-branch-observed",
    );
    expect(data.logs.join("\n")).not.toContain(
      "Music System Installation Failed",
    );
    await writeFile(
      info.outputPath(stage + ".json"),
      JSON.stringify(data, null, 2),
    );
    await stop(page);
  }
});
