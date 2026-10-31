import { test as base, expect, type Page } from "@playwright/test";

/** Control surface of the local fake Jira (e2e/fake-jira/server.mjs) — test-only, never a real Jira. */
export const FAKE_JIRA = `http://127.0.0.1:${process.env.FAKE_JIRA_PORT ?? 3199}`;
/** Control surface of the local fake Instagram worker (e2e/fake-social/server.mjs) — synthetic data only. */
export const FAKE_SOCIAL = `http://127.0.0.1:${process.env.FAKE_SOCIAL_PORT ?? 3198}`;

export interface FakeSocialControl {
  fault(fault: Record<string, unknown> | null): Promise<void>;
  state(): Promise<{ calls: number }>;
}

/** Control surface of the local fake Brain service (e2e/fake-brain/server.mjs) — synthetic data only. */
export const FAKE_BRAIN = `http://127.0.0.1:${process.env.FAKE_BRAIN_PORT ?? 3197}`;
export type FakeBrainMode = "ok" | "mirrored" | "empty" | "unindexed" | "pending" | "down" | "unauthorized" | "invalid" | "slow";

export interface FakeBrainControl {
  mode(mode: FakeBrainMode): Promise<void>;
}

export interface FakeJiraControl {
  fault(fault: Record<string, unknown>): Promise<void>;
  board(patch: { filterId?: string; withReview?: boolean }): Promise<void>;
  searchLag(ms: number): Promise<void>;
  setStatus(key: string, statusId: string): Promise<void>;
  state(): Promise<{ creates: number; issues: { key: string; summary: string; status: string; labels: string[] }[] }>;
}

export const test = base.extend<{ consoleErrors: string[]; jira: FakeJiraControl; social: FakeSocialControl; brain: FakeBrainControl }>({
  /** Every test starts with a healthy fake worker and an empty dashboard snapshot cache (e2e-only reset control). */
  social: [
    async ({ request, baseURL }, provide) => {
      expect((await request.post(`${FAKE_SOCIAL}/__fake/reset`)).ok(), "fake Instagram reset").toBe(true);
      // against an already running server (E2E_BASE_URL) the reset control may be off: start it with SOCIAL_IG_E2E_CONTROLS=1
      if (!process.env.E2E_BASE_URL) expect((await request.get(`${baseURL}/api/social/instagram?__reset`)).status(), "dashboard social cache reset").toBe(204);
      await provide({
        fault: async (fault) => {
          expect((await request.post(`${FAKE_SOCIAL}/__fake/fault`, { data: fault ?? {} })).ok()).toBe(true);
        },
        state: async () => (await request.get(`${FAKE_SOCIAL}/__fake/state`)).json(),
      });
    },
    { auto: true },
  ],

  /** Every test starts from the same synthetic Brain projection. */
  brain: [
    async ({ request }, provide) => {
      const post = async (path: string, data: unknown = {}) => {
        const response = await request.post(`${FAKE_BRAIN}${path}`, { data });
        expect(response.ok(), `fake Brain ${path}`).toBe(true);
      };
      await post("/__fake/reset");
      await provide({ mode: (mode) => post("/__fake/mode", { mode }) });
    },
    { auto: true },
  ],

  /** Every test starts from the same synthetic Jira state. */
  jira: [
    async ({ request }, provide) => {
      const post = async (path: string, data: unknown = {}) => {
        const response = await request.post(`${FAKE_JIRA}${path}`, { data });
        expect(response.ok(), `fake Jira ${path}`).toBe(true);
      };
      await post("/__fake/reset");
      await provide({
        fault: (fault) => post("/__fake/fault", fault),
        board: (patch) => post("/__fake/board", patch),
        searchLag: (ms) => post("/__fake/search-lag", { ms }),
        setStatus: (key, statusId) => post("/__fake/status", { key, statusId }),
        state: async () => (await request.get(`${FAKE_JIRA}/__fake/state`)).json(),
      });
    },
    { auto: true },
  ],

  /** Navigations wait until the client app is interactive, so keyboard shortcuts never race hydration. */
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.locator("html[data-ready]").waitFor({ state: "attached" });
      return response;
    };
    await provide(page);
  },

  /** Every test fails on an uncaught page error or console error — broken behaviour must stay visible. */
  consoleErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      await provide(errors);
      expect(errors, "no console or page errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** Waits until a Board/Backlog page shows a Jira read (or a failure) instead of the loading line. */
export async function workSettled(page: Page) {
  await page.locator('[data-work-phase]:not([data-work-phase="loading"])').waitFor();
}

/** Waits until the app-wide Jira read finished successfully (search over Jira issues needs it). */
/** Waits until the Instagram cockpit left its loading state. */
export async function socialSettled(page: Page) {
  await page.locator('[data-testid="instagram-cockpit"]:not([data-state="LOADING"])').waitFor();
}

export async function workReady(page: Page) {
  await page.locator('html[data-work="ready"]').waitFor({ state: "attached" });
}

export { expect };
