/** Regressions for the Enterprise Code Review findings on PR #2 (Jira ANA-19, ANA-20, ANA-21). */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const focusInDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test.describe("ANA-19 · context lens keeps modal focus for its whole mounted lifetime", () => {
  test("motion on: Tab / Shift+Tab cannot leave the lens during the exit animation; focus returns to the opener after removal", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const opener = page.getByTestId("context-work");
    await opener.click();
    const lens = page.getByTestId("context-lens");
    await expect(lens).toBeVisible();

    await page.keyboard.press("Escape");
    // the lens is still mounted as an aria-modal dialog while it animates out
    await expect(page.locator('[data-state="closing"] [role="dialog"][aria-modal="true"]')).toHaveCount(1);
    for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      if ((await page.locator('[role="dialog"]').count()) === 0) break; // animation finished between presses
      expect(await focusInDialog(page), `focus stays in the mounted dialog after ${key}`).toBe(true);
    }

    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("a second close request during the exit animation does not close a lens that is reopened right after", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.getByTestId("context-work").click();
    await expect(page.getByTestId("context-lens")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
    await page.mouse.click(40, 860); // backdrop click while closing
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await page.getByTestId("context-session").click();
    await expect(page.getByTestId("context-lens")).toHaveAttribute("data-lens", "session");
    await page.waitForTimeout(500); // longer than any stale close timer
    await expect(page.getByTestId("context-lens")).toBeVisible();
    await expect(page.getByTestId("context-lens")).toHaveAttribute("data-lens", "session");
  });

  test("search over a lens is a modal stack: first Escape closes search only, second closes the lens", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const opener = page.getByTestId("context-knowledge");
    await opener.click();
    await expect(page.getByTestId("context-lens")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("search-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("search-panel")).toBeHidden();
    await page.waitForTimeout(400);
    await expect(page.getByTestId("context-lens")).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="context-lens"]'))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("reduced motion: closing removes the lens immediately and restores focus to the opener", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const opener = page.getByTestId("context-community");
    await opener.click();
    await expect(page.getByTestId("context-lens")).toBeVisible();
    await page.keyboard.press("Escape");
    // no exit animation: gone without waiting for the 280 ms timer
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
    await expect(opener).toBeFocused();
  });
});

test.describe("ANA-20 · Toolbox action: announced state matches behaviour", () => {
  test("the action is a normal, operable button that explains why the tool cannot open", async ({ page }) => {
    await page.goto("/toolbox");
    const card = page.getByTestId("tool-jira");
    const action = card.getByRole("button", { name: "Why unavailable" });
    await expect(action).toBeVisible();
    await expect(action).not.toHaveAttribute("aria-disabled", /.*/);
    await expect(action).toBeEnabled();
    await expect(card.getByRole("button", { name: "Open" })).toHaveCount(0);
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast")).toContainText("not configured");
    // the reason is also visible without activating anything
    await expect(card).toContainText("Link not configured");
  });

  test("no element in the app announces aria-disabled while staying actionable", async ({ page }) => {
    for (const route of ["/toolbox", "/pulse", "/vault"]) {
      await page.goto(route);
      await expect(page.locator('[aria-disabled="true"]')).toHaveCount(0);
    }
  });
});

test.describe("ANA-21 · search combobox expanded state follows the popup, not the result count", () => {
  test("open with results: expanded, active descendant set", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByTestId("search-input");
    await input.fill("brain");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  });

  test("open with zero results: still expanded, no active descendant, no-results message announced", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByTestId("search-input");
    await input.fill("zzzz");
    await expect(page.getByTestId("search-panel")).toContainText("No matches yet");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.*/);
    await expect(page.getByTestId("search-panel").locator('[aria-live="polite"]')).toHaveText("0 results");
    await expect(page.getByRole("listbox")).toBeAttached();
  });

  test("closed: the combobox is gone, so no stale expanded state remains", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toHaveCount(0);
  });
});
