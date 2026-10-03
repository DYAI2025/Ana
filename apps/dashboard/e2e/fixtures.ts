import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ consoleErrors: string[] }>({
  /** Navigations wait until the client app is interactive, so keyboard shortcuts never race hydration. */
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.locator("html[data-ready]").waitFor({ state: "attached" });
      return response;
    };
    await use(page);
  },

  /** Every test fails on an uncaught page error or console error — broken behaviour must stay visible. */
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      await use(errors);
      expect(errors, "no console or page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
