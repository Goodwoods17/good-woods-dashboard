import { defineConfig, devices } from "@playwright/test";

// E2E browser smoke. Runs the production build (`next start`) and drives it with
// a real browser — catches the interactive class of bugs (dead buttons, effect
// loops) that tsc/lint/jsdom structurally cannot see. See ADR 0018 + the
// CI authed-smoke spec.

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  // Fail the build if test.only is committed.
  forbidOnly: !!process.env.CI,
  // CI is occasionally flaky on cold starts; one retry there, none locally.
  retries: process.env.CI ? 1 : 0,
  // Deterministic, readable CI output; rich HTML report locally.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Start the production server (`next start`) and wait for it. The app must be
  // built first (`npm run build`). CI injects the local Supabase env via
  // $GITHUB_ENV before this step, so the server inherits it. Locally we reuse a
  // server if one's already up.
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
