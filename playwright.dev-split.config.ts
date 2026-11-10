import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/dev-split",
  timeout: 120000,
  outputDir: "artifacts/phase9-8p/browser",
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/phase9-8p/browser-results.json" }],
  ],
  use: { ...base.use, actionTimeout: 15000, baseURL: "http://localhost:4175" },
  webServer: {
    command: "node scripts/serve-dev-split-test.mjs",
    url: "http://localhost:4175/porting-pj/ed4/",
    reuseExistingServer: false,
  },
});
