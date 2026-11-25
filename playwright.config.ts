import { defineConfig, devices } from "@playwright/test";
// E2E_PORT picks another port when 5330 is taken: an existing server there is reused, whatever it is.
const port = Number(process.env.E2E_PORT ?? 5330);
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1200, height: 800 } },
  webServer: {
    command: `npx vite --config e2e/app/vite.config.ts --port ${port}`,
    port,
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
