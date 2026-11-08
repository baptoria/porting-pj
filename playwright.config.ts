import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:4173/porting-pj/ed4/",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node scripts/serve-pages.mjs",
    url: "http://localhost:4173/porting-pj/ed4/",
    reuseExistingServer: false,
  },
});
