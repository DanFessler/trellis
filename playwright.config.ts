import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5330", viewport: { width: 1200, height: 800 } },
  webServer: {
    command: "npx vite --config e2e/app/vite.config.ts",
    port: 5330,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1200, height: 800 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1200, height: 800 } } },
    // Playwright's WebKit build is frozen on older macOS releases; CI (Linux) always runs it.
    ...(process.env.CI || process.env.WEBKIT
      ? [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1200, height: 800 } } }]
      : []),
  ],
});
