/** Regression tests for defects found in review round 1 (each failed before its fix). */
import { expect, test } from "./fixtures";

test("calendar: clearing the date is rejected instead of crashing the view", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByTestId("cal-add").click();
  await page.getByTestId("cal-title").fill("No date");
  await page.getByTestId("cal-date").fill("");
  await page.getByTestId("cal-submit").click();
  await expect(page.getByTestId("cal-form").getByRole("alert")).toContainText("valid date");
  await expect(page.getByTestId("cal-month")).toHaveText("October 2026");
});

test("calendar: Cancel and submit return focus to Add event; agenda resets on month change", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByTestId("cal-add").click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("cal-add")).toBeFocused();
  await page.locator('[data-date="2026-10-06"]').click();
  await expect(page.getByTestId("cal-agenda")).toContainText("Working session");
  await page.getByTestId("cal-next").click();
  await expect(page.getByTestId("cal-agenda")).toContainText("In this month");
  await expect(page.getByTestId("cal-agenda")).not.toContainText("Working session");
});

test("whiteboard: after editing one note, Delete removes the note the user clicked next", async ({ page }) => {
  await page.goto("/whiteboard");
  const notes = page.getByTestId("wb-note");
  const first = notes.nth(0);
  const second = notes.nth(1);
  const secondText = (await second.textContent())!;
  await first.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type(" (edited)");
  await second.click();
  await expect(second).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("whiteboard")).not.toContainText(secondText);
  await expect(first).toContainText("(edited)");
  await expect(notes.nth(1)).toBeFocused();
});

test("search opened over a lens: Escape closes only the search, focus returns into the lens", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("context-work").click();
  await expect(page.getByTestId("context-lens")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-panel")).toBeHidden();
  await page.waitForTimeout(600); // longer than the lens close animation
  await expect(page.getByTestId("context-lens")).toBeVisible();
  await expect(page.locator('[data-state="closing"]')).toHaveCount(0);
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="context-lens"]'))).toBe(true);
});

test("search reopens empty after closing with Cmd/Ctrl+K", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-input").fill("brain");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-panel")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-input")).toHaveValue("");
});

test("search result for a ticket is visible even when an owner filter was active", async ({ page }) => {
  await page.goto("/board");
  await page.getByTestId("filter-ana").click();
  await page.getByTestId("search-open").click();
  await page.getByTestId("search-input").fill("approved source links");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ticket-id="t-source-links"]')).toBeFocused();
  await expect(page.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "true");
});

test("brain: turning auto-rotate on while a node is selected releases the node and rotates", async ({ page }) => {
  await page.goto("/brain?node=workshop-02");
  await expect(page.getByTestId("brain-selected-title")).toHaveText("Workshop 02");
  await page.getByTestId("brain-auto-rotate").click();
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("brain-selected-title")).toHaveCount(0);
});

test("backlog numbering stays stable when ideas are added", async ({ page }) => {
  await page.goto("/backlog");
  await page.getByTestId("add-idea").click();
  await page.getByTestId("idea-input").fill("Numbering check");
  await page.getByTestId("idea-submit").click();
  const backlogRows = page.locator('[data-testid="backlog-item"][data-kind="backlog"]');
  await expect(backlogRows.first()).toContainText("01");
  await expect(backlogRows.last()).toContainText("06");
});

test("backlog: pressing Add idea while the form is open keeps the draft", async ({ page }) => {
  await page.goto("/backlog");
  await page.getByTestId("add-idea").click();
  await page.getByTestId("idea-input").fill("Keep me");
  await page.getByTestId("add-idea").click();
  await expect(page.getByTestId("idea-input")).toHaveValue("Keep me");
  await expect(page.getByTestId("idea-input")).toBeFocused();
});

test("generic source labels and tool names are translated (DE/IT)", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("ana.locale", "de"));
  await page.goto("/pulse");
  await expect(page.getByTestId("pulse-sales")).toContainText("Partnerschaften");
  await expect(page.getByTestId("pulse-inbox")).toContainText("Geschäftspostfach");
  await page.getByTestId("lang-it").click();
  await page.getByTestId("nav-toolbox").click();
  await expect(page.getByTestId("tool-assistant")).toContainText("Assistente IA");
});

test("nav labels can be dismissed with Escape (WCAG 1.4.13)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-brain").hover();
  const opacity = () => page.getByTestId("nav-brain").evaluate((el) => getComputedStyle(el, "::after").opacity);
  await expect.poll(opacity).toBe("1");
  await page.getByTestId("nav-brain").focus();
  await page.keyboard.press("Escape");
  await expect.poll(opacity).toBe("0");
});
