import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const FAKE_JIRA_PORT = Number(process.env.FAKE_JIRA_PORT ?? 3199);
// E2E_BASE_URL=http://localhost:3200 reuses an already running server (fast local iteration); CI builds its own
const external = process.env.E2E_BASE_URL;

/**
 * The browser tests run the production build against a local fake Jira (e2e/fake-jira) — never against a real
 * Jira. The credentials below are test values for that fake only.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: external
    ? undefined
    : [
        {
          command: `node e2e/fake-jira/server.mjs`,
          url: `http://127.0.0.1:${FAKE_JIRA_PORT}/__fake/health`,
          env: { FAKE_JIRA_PORT: String(FAKE_JIRA_PORT) },
          reuseExistingServer: false,
          timeout: 20_000,
        },
        {
          command: `npm run build && npx next start --port ${PORT}`,
          url: `http://localhost:${PORT}`,
          env: {
            JIRA_BASE_URL: `http://127.0.0.1:${FAKE_JIRA_PORT}`,
            JIRA_EMAIL: "e2e@example.invalid",
            JIRA_API_TOKEN: "e2e-fake-token",
            JIRA_TIMEOUT_MS: "1500",
          },
          reuseExistingServer: false,
          timeout: 240_000,
        },
      ],
});
