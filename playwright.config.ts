import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "**/*.spec.ts", fullyParallel: true, workers: 2,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1440, height: 960 },
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npm run preview:test", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
});
