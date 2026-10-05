import { test as base, expect, type Page } from "@playwright/test";

/** Control surface of the local fake Jira (e2e/fake-jira/server.mjs) — test-only, never a real Jira. */
export const FAKE_JIRA = `http://127.0.0.1:${process.env.FAKE_JIRA_PORT ?? 3199}`;

export interface FakeJiraControl {
  fault(fault: Record<string, unknown>): Promise<void>;
  board(patch: { filterId?: string; withReview?: boolean }): Promise<void>;
  searchLag(ms: number): Promise<void>;
  setStatus(key: string, statusId: string): Promise<void>;
  state(): Promise<{ creates: number; issues: { key: string; summary: string; status: string; labels: string[] }[] }>;
}

export const test = base.extend<{ consoleErrors: string[]; jira: FakeJiraControl }>({
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
export async function workReady(page: Page) {
  await page.locator('html[data-work="ready"]').waitFor({ state: "attached" });
}

export { expect };
