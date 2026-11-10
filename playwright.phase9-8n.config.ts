import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/phase9-8n",
  outputDir: "artifacts/phase9-8n/browser",
  reporter: [["list"]],
  timeout: 90000,
});
