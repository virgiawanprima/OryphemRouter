import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  // Auto-manage the server lifecycle: start, wait until ready, kill after tests.
  // reuseExistingServer lets a manually-run `npm run dev` be reused instead of
  // spawning a duplicate (fast local iteration without manual start/poll).
  webServer: {
    command: process.env.ORYPHEM_WEB_SERVER_CMD || "npm run dev",
    url: process.env.ORYPHEM_URL || "http://localhost:20129",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    stdout: "pipe",
    stderr: "pipe",
  },
  use: {
    baseURL: process.env.ORYPHEM_URL || "http://localhost:20129",
    navigationTimeout: 45000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
