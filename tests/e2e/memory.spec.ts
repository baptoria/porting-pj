import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, unzipSync } from "fflate";
test("measure ZIP stages with 8 and 32 MiB synthetic payloads", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/porting-pj/ed4/");
  await page.locator("#advanced-settings").evaluate(el => { (el as HTMLDetailsElement).open = true; });
  await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
  const program = unzipSync(
      new Uint8Array(await readFile("public/test-program.zip")),
    ),
    observations = [];
  for (const mib of [8, 32]) {
    const data = new Uint8Array(mib * 1024 * 1024);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = seed & 255;
    }
    const zip = zipSync(
      { ...program, "PAYLOAD.BIN": data },
      { level: 1, mtime: new Date("2020-01-01") },
    );
    await page.locator("#open-import").click();
    const zipPath = info.outputPath(`synthetic-${mib}m.zip`);
    await writeFile(zipPath, zip);
    await page.locator("#zip-file").setInputFiles(zipPath);
    await expect(page.locator("#import-exe")).toHaveValue("ED4TEST.COM", {
      timeout: 30000,
    });
    await page.locator("#import-submit").click();
    await expect(page.locator("#profile-title")).toHaveText(
      `synthetic-${mib}m`,
    );
    await page.locator("#play").click();
    await expect(page.locator("#run-state")).toHaveText("실행 중", {
      timeout: 30000,
    });
    await page.keyboard.press("s");
    await expect(page.locator("#logs")).toContainText("SAVE WRITTEN");
    await page.locator("#stop").click();
    await expect(page.locator("#run-state")).toHaveText("종료됨");
    const pending = page.waitForEvent("download");
    await page.locator("#export-diagnostics").click();
    const downloaded = await pending;
    const report = JSON.parse(
      await readFile((await downloaded.path())!, "utf8"),
    );
    observations.push({
      payloadMiB: mib,
      zipBytes: zip.length,
      measurements: report.measurements.slice(-5),
      userAgent: report.userAgent,
    });
  }
  await writeFile(
    info.outputPath("memory-observations.json"),
    JSON.stringify(
      {
        scope:
          "Desktop Chrome samples, not Android, not peak/RSS; no before/after performance claim",
        observations,
      },
      null,
      2,
    ),
  );
});
