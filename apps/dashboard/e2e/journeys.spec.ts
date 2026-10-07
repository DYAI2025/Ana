/**
 * ANA-4 main journeys (handoff "Browser interaction proof" 1–15), run against the production build.
 */
import type { Page } from "@playwright/test";
import { expect, test, workReady, workSettled } from "./fixtures";

const area = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} has no box`);
  return box.width * box.height;
};

test("1 · Now shows Current Focus first, then Work + Last Session, then secondary context", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("focus-statement")).toBeVisible();
  const focusBox = (await page.getByTestId("focus-statement").boundingBox())!;
  for (const id of ["work", "session", "business", "knowledge", "community"]) {
    const box = (await page.getByTestId(`context-${id}`).boundingBox())!;
    expect(box.y, `${id} sits below the focus statement`).toBeGreaterThan(focusBox.y + focusBox.height);
  }
  const primary = Math.min(await area(page, "context-work"), await area(page, "context-session"));
  for (const id of ["business", "knowledge", "community"]) {
    expect(await area(page, `context-${id}`), `${id} is visually secondary`).toBeLessThan(primary);
  }
  await expect(page.getByTestId("prototype-flag")).toBeVisible();
});

test("2 · a context lens opens, traps focus and closes (Escape, close button, backdrop)", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId("context-work");
  await trigger.click();
  const lens = page.getByRole("dialog");
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-lens", "work");
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(lens).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.getByTestId("context-session").click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-lens", "session");
  await page.getByTestId("lens-close").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByTestId("context-community").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(40, 860);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("3–5 · Board: navigate, filter by assignee, move an issue by drag and by keyboard (through Jira)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-board").click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
  await workSettled(page);

  for (const person of await page.getByTestId("filter-person").all()) {
    const owner = await person.getAttribute("data-owner");
    await person.click();
    const owners = await page.getByTestId("ticket").evaluateAll((els) => els.map((el) => el.getAttribute("data-owner")));
    expect(owners.length, `${owner} has issues`).toBeGreaterThan(0);
    expect(new Set(owners)).toEqual(new Set([owner]));
  }
  await page.getByTestId("filter-all").click();

  await page.locator('[data-ticket-id="ANA-901"]').dragTo(page.locator('[data-column-name="Zur Entwicklung ausgewählt"]'));
  await expect(page.locator('[data-column-name="Zur Entwicklung ausgewählt"] [data-ticket-id="ANA-901"]')).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("confirmed by Jira");

  await page.locator('[data-ticket-id="ANA-905"]').focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator('[data-column-name="Erledigt"] [data-ticket-id="ANA-905"]')).toBeVisible();
  await expect(page.locator('[data-ticket-id="ANA-905"]')).toBeFocused();
});

test("6–7 · Backlog is a separate view and Add idea creates a Jira item, with validation", async ({ page }) => {
  await page.goto("/board");
  await page.getByTestId("open-backlog").click();
  await expect(page).toHaveURL(/\/backlog$/);
  await workSettled(page);
  const before = await page.getByTestId("backlog-item").count();
  await page.getByTestId("add-idea").click();
  await expect(page.getByTestId("idea-form")).toContainText("Creates one Jira task in Backlog");
  await page.getByTestId("idea-submit").click();
  await expect(page.getByTestId("idea-form").getByRole("alert")).toBeVisible();
  await page.getByTestId("idea-input").fill("Try a calmer weekly review");
  await page.getByTestId("idea-submit").click();
  await expect(page.getByTestId("idea-created")).toContainText("confirmed by readback");
  await expect(page.getByTestId("backlog-item")).toHaveCount(before + 1);
  // Jira ranks a new issue last
  await expect(page.getByTestId("backlog-item").last()).toContainText("Try a calmer weekly review");
  await expect(page.getByTestId("add-idea")).toBeFocused();
});

test("8–9 · Session opens and switches Watch / Summary / Transcript / JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-sessions").click();
  await page.getByTestId("session-working-session-01").getByRole("link", { name: "Current focus and first loop", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions\/working-session-01$/);
  await expect(page.getByTestId("panel-watch")).toBeVisible();
  await page.getByTestId("player-toggle").click();
  await expect(page.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "0");
  await page.getByTestId("player-toggle").click();

  await page.getByTestId("tab-transcript").click();
  await expect(page.getByTestId("panel-transcript")).toContainText("[Fictional]");
  await expect(page.getByTestId("panel-transcript")).toContainText("not a real conversation");
  await page.getByTestId("tab-json").click();
  const json = JSON.parse((await page.getByTestId("session-json").textContent()) ?? "{}");
  expect(json).toMatchObject({ session_id: "working-session-01", prototype: true, fictional: true });
  expect(json.evidence_refs[0].status).toBe("not_connected");

  await page.getByTestId("tab-json").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("tab-transcript")).toBeFocused();
  await expect(page.getByTestId("tab-transcript")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("panel-watch")).toBeVisible();
});

test("10 · Brain rotates, zooms and selects a node on the canvas and from the list", async ({ page }) => {
  await page.goto("/brain");
  await expect(page.getByTestId("brain-status")).toHaveAttribute("data-nodes", "20");
  const canvas = page.getByTestId("brain-canvas");
  await page.getByTestId("brain-auto-rotate").click();
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-idle", "true");

  const yaw0 = Number(await canvas.getAttribute("data-yaw"));
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  expect(Math.abs(Number(await canvas.getAttribute("data-yaw")) - yaw0)).toBeGreaterThan(0.5);

  const zoom0 = Number(await canvas.getAttribute("data-zoom"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await canvas.getAttribute("data-zoom"))).toBeGreaterThan(zoom0 + 0.1);
  await page.getByTestId("brain-zoom-out").click();
  await expect(canvas).toHaveAttribute("data-idle", "true");

  // click a real node on the canvas at its published screen position
  const hotspots = JSON.parse((await canvas.getAttribute("data-hotspots")) ?? "[]") as { id: string; x: number; y: number }[];
  // only nodes not covered by the toolbar, the selection card or the legend
  const covers = await page.evaluate(() =>
    ['[data-testid="brain-selection"]', '[role="toolbar"]', '[data-testid="brain-legend-types"]'].map((s) => document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect),
  );
  const inside = hotspots.filter(
    (h) =>
      h.x > 20 && h.x < box.width - 20 && h.y > 20 && h.y < box.height - 20 &&
      !covers.some((c) => box.x + h.x > c.left - 12 && box.x + h.x < c.right + 12 && box.y + h.y > c.top - 12 && box.y + h.y < c.bottom + 12),
  );
  expect(inside.length).toBeGreaterThan(0);
  const target = inside[0]!;
  await page.mouse.click(box.x + target.x, box.y + target.y);
  const label = (await page.getByTestId(`brain-node-${target.id}`).locator("span").nth(1).textContent())!;
  await expect(page.getByTestId("brain-selected-title")).toHaveText(label);

  await page.getByTestId("brain-filter").fill("workshop 02");
  await page.getByTestId("brain-node-ws-workshop-02").click();
  await expect(page.getByTestId("brain-selected-title")).toHaveText("Workshop 02");
  await expect(page.getByTestId("brain-selected-status")).toHaveText("DERIVED");
  await expect(page.getByTestId("brain-selected-created-by")).toHaveText("vince");
});

test("11 · Whiteboard adds and moves a note (pointer and keyboard)", async ({ page }) => {
  await page.goto("/whiteboard");
  const notes = page.getByTestId("wb-note");
  const before = await notes.count();
  await page.getByTestId("wb-add-sticky").click();
  await expect(notes).toHaveCount(before + 1);
  const added = notes.last();
  await expect(added).toBeFocused();

  const first = notes.first();
  const start = (await first.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + 20);
  await page.mouse.down();
  await page.mouse.move(start.x + 220, start.y + 140, { steps: 10 });
  await page.mouse.up();
  const moved = (await first.boundingBox())!;
  expect(moved.x - start.x).toBeGreaterThan(150);
  expect(moved.y - start.y).toBeGreaterThan(100);

  await first.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  expect((await first.boundingBox())!.x).toBeLessThan(moved.x - 20);

  await first.press("Enter");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited note");
  await page.keyboard.press("Enter");
  await expect(first).toContainText("Edited note");
});

test("12 · Calendar shows events and adds one locally with validation", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-month")).toHaveText("October 2026");
  expect(await page.getByTestId("cal-event").count()).toBeGreaterThanOrEqual(1);
  await page.getByTestId("cal-add").click();
  await page.getByTestId("cal-title").fill("Planning call");
  await page.getByTestId("cal-date").fill("2026-10-16");
  await page.getByTestId("cal-start").fill("11:00");
  await page.getByTestId("cal-end").fill("10:00");
  await page.getByTestId("cal-submit").click();
  await expect(page.getByTestId("cal-form").getByRole("alert")).toContainText("End must be after start");
  await page.getByTestId("cal-end").fill("12:00");
  await page.getByTestId("cal-submit").click();
  await expect(page.locator('[data-date="2026-10-16"]')).toContainText("Planning call");
  await expect(page.getByTestId("cal-agenda")).toContainText("Planning call");
  await expect(page.getByTestId("toast")).toContainText("not synced");

  await page.getByTestId("cal-next").click();
  await expect(page.getByTestId("cal-month")).toHaveText("November 2026");
});

test("13 · Pulse, Vault and Toolbox are honest about missing connections", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-pulse").click();
  await expect(page).toHaveURL(/\/pulse$/);
  for (const id of ["community", "sales", "inbox", "drive"]) {
    await expect(page.getByTestId(`pulse-${id}`)).toHaveAttribute("data-state", "not-connected");
    await expect(page.getByTestId(`pulse-${id}`)).toContainText("Not connected yet");
  }
  const pulseText = (await page.getByRole("main").textContent()) ?? "";
  expect(pulseText, "no fabricated metric").not.toMatch(/\d+\s?%|\d+\s?(followers|sales|views|€|\$)/i);

  await page.getByTestId("nav-vault").click();
  await expect(page.getByTestId("vault-empty")).toContainText("No shared Drive folders linked yet.");

  await page.getByTestId("nav-toolbox").click();
  await expect(page.getByTestId("tool-jira")).toContainText("Link not configured");
  await page.getByTestId("tool-jira").getByRole("button", { name: "How to use" }).click();
  await expect(page.getByTestId("tool-jira")).toContainText("Create and move work in Jira");
});

test("14 · EN / DE / IT switching translates chrome and content and persists", async ({ page }) => {
  await page.goto("/board");
  await page.getByTestId("lang-de").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByTestId("nav-now")).toHaveAttribute("aria-label", "Jetzt");
  await expect(page.getByText("Jira-ANA-Board · jede Verschiebung wird in Jira geschrieben und zurückgelesen")).toBeVisible();
  // Jira data stays as Jira holds it; only the interface is translated
  await expect(page.locator('[data-column-name="In Arbeit"]')).toBeVisible();
  await expect(page.locator('[data-ticket-id="ANA-901"]')).toContainText("Nicht zugewiesen");
  await page.reload();
  await expect(page.getByTestId("nav-now")).toHaveAttribute("aria-label", "Jetzt");

  await page.getByTestId("lang-it").click();
  await page.getByTestId("nav-now").click();
  await expect(page.getByTestId("focus-statement")).toContainText("chiudere un ciclo significativo");
  await page.getByTestId("lang-en").click();
  await expect(page.getByTestId("focus-statement")).toContainText("close one meaningful loop");
});

test("15 · global search finds content across modules and navigates", async ({ page }) => {
  await page.goto("/");
  await workReady(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("search-panel")).toBeVisible();
  await expect(page.getByTestId("search-input")).toBeFocused();
  await page.getByTestId("search-input").fill("workshop 02");
  await expect(page.getByTestId("search-result").first()).toBeVisible();
  const labels = await page.getByTestId("search-result").allTextContents();
  expect(labels.join(" | ")).toMatch(/Workshop 02/);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("search-panel")).toBeHidden();
  await expect(page).not.toHaveURL(/\/$/);

  await page.getByTestId("search-open").click();
  await page.getByTestId("search-input").fill("approved source links");
  await page.getByTestId("search-result").first().click();
  await expect(page).toHaveURL(/\/board\?ticket=ANA-908/);
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toBeFocused();

  await page.keyboard.press("/");
  await page.getByTestId("search-input").fill("lavagna");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/whiteboard$/);

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-input").fill("zzzz");
  await expect(page.getByTestId("search-panel")).toContainText("No matches yet");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-panel")).toBeHidden();
});
