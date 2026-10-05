import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE runtime proof against the real Jira (ANA-5). Never part of CI. Start the dashboard yourself with server-side
 * Jira credentials (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN), then:
 *
 *   LIVE_BASE_URL=http://127.0.0.1:3300 LIVE_EVIDENCE_DIR=<dir outside the repo> npx playwright test -c playwright.live.config.ts
 *
 * The run creates exactly one clearly labelled verification idea and moves only that issue.
 */
export default defineConfig({
  testDir: "./e2e-live",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? "http://127.0.0.1:3300",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
