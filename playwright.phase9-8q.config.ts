import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/phase9-8q",
  outputDir: "artifacts/phase9-8q/browser",
  reporter: [["list"]],
  timeout: 90000,
  use: { ...base.use, baseURL: "http://localhost:4173/porting-pj/ed4-dev/" },
});
