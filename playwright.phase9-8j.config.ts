import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/phase9-8j",
  outputDir: "artifacts/phase9-8j/browser",
  timeout: 120000,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/phase9-8j/tests.json" }],
  ],
});
