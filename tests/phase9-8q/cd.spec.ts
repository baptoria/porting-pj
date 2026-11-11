import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isoBlob, rawTone } from "../../scripts/iso-fixture.mjs";
import { folderFixture } from "../folder-fixture";
import { stop } from "../phase9-8i/helpers";
const text = (s: string) => new TextEncoder().encode(s);
for (const mode of ["none", "directory", "iso"])
  test("native K CD support: " + mode, async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    await page.goto("/porting-pj/ed4-dev/");
    await expect(page.locator("#offline")).toHaveText("오프라인 준비 완료");
    const probe = Buffer.from(
      (await readFile("tests/fixtures/phase9-8q-cd-probe.b64", "utf8")).trim(),
      "base64",
    );
    const files: Record<string, Uint8Array> = {
      "PROBE.COM": probe,
      "GAME.BAT": text("PROBE.COM\r\n"),
      "ED4/EFFECT/ED4-01.RAW": rawTone(440, 0.1),
    };
    if (mode === "iso") {
      files["DISC.BIN"] = new Uint8Array(
        await isoBlob({
          "ED4/EFFECT/ED4-01.RAW": rawTone(440, 0.1),
        }).arrayBuffer(),
      );
    }
    await page.locator("#simple-import").click();
    await page
      .locator("#simple-folder")
      .setInputFiles(await folderFixture(files, "cd-native"));
    await expect(page.locator("#simple-import-dialog")).not.toBeVisible();
    await page.locator("#game-settings").click();
    await page
      .locator("#prelude")
      .fill(
        mode === "directory"
          ? "mount d . -t cdrom"
          : mode === "iso"
            ? "imgmount d C:\\DISC.BIN -t iso"
            : "",
      );
    await page.locator("#settings-form button[type=submit]").click();
    await page.locator("#play").click();
    await expect(page.locator("#logs")).toContainText(
      mode === "none" ? "Q_CD_ABSENT" : "Q_CD_READONLY_OK",
    );
    expect(await page.locator("#logs").textContent()).not.toContain(
      "Q_CD_FAILURE",
    );
    await stop(page);
  });
