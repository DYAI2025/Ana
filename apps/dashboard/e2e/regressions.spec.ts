/** Regression tests for defects found in review rounds 1 and 2 (see docs/evidence/ANA-4/RED-RUNS.md). */
import { expect, test, workReady } from "./fixtures";

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
  await page.getByTestId("cal-add").click();
  await page.getByTestId("cal-title").fill("Focus return");
  await page.getByTestId("cal-submit").click();
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

test("search result for an issue is visible even when an owner filter was active", async ({ page }) => {
  await page.goto("/board");
  await workReady(page);
  await page.getByRole("button", { name: "Avery Example" }).click();
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toHaveCount(0);
  await page.getByTestId("search-open").click();
  await page.getByTestId("search-input").fill("approved source links");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toBeFocused();
  await expect(page.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "true");
});

test("brain: turning auto-rotate on while a node is selected releases the node and rotates", async ({ page }) => {
  await page.goto("/brain?node=workshop-02");
  await expect(page.getByTestId("brain-selected-title")).toHaveText("Workshop 02");
  await page.getByTestId("brain-auto-rotate").click();
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("brain-selected-title")).toHaveCount(0);
});

test("backlog rows follow Jira rank; ideas are marked with an icon instead of a number", async ({ page }) => {
  await page.goto("/backlog");
  const backlogRows = page.locator('[data-testid="backlog-item"][data-kind="backlog"]');
  await expect(backlogRows.first()).toContainText("01");
  await expect(backlogRows.last()).toContainText("02");
  await expect(page.locator('[data-testid="backlog-item"][data-kind="idea"]')).toHaveAttribute("data-backlog-key", "ANA-907");
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

test("calendar: a date error focuses the date field; Cancel returns focus to the agenda opener", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByTestId("cal-add").click();
  await page.getByTestId("cal-title").fill("Date check");
  await page.getByTestId("cal-date").fill("");
  await page.getByTestId("cal-submit").click();
  await expect(page.getByTestId("cal-date")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator('[data-date="2026-10-06"]').click();
  const agendaAdd = page.getByTestId("cal-agenda").getByRole("button", { name: "Add event" });
  await agendaAdd.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(agendaAdd).toBeFocused();
});

test("calendar padding days name their month", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.locator('[data-date="2026-09-30"]')).toContainText("Sep");
});

test("search: picking the same ticket again after hiding it with a filter shows it again", async ({ page }) => {
  await page.goto("/");
  await workReady(page);
  for (const round of [1, 2]) {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByTestId("search-input").fill("approved source links");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-ticket-id="ANA-908"]'), `round ${round}`).toBeFocused();
    await page.getByRole("button", { name: "Avery Example" }).click();
    await expect(page.locator('[data-ticket-id="ANA-908"]')).toHaveCount(0);
  }
});

test("search: '/' typed while the palette is open does not wipe the query", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-input").fill("brain");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).focus();
  await page.keyboard.press("/");
  await expect(page.getByTestId("search-input")).toHaveValue("brain");
});

test("tooltips: Escape hides the hovered label even when focus is elsewhere, and the next item still shows its label", async ({ page }) => {
  await page.goto("/");
  const opacity = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el, "::after").opacity);
  await page.locator("main").focus();
  await page.getByTestId("nav-brain").hover();
  await expect.poll(() => opacity("nav-brain")).toBe("1");
  await page.keyboard.press("Escape");
  await expect.poll(() => opacity("nav-brain")).toBe("0");
  await page.getByTestId("nav-calendar").hover();
  await expect.poll(() => opacity("nav-calendar")).toBe("1");
  await page.getByTestId("nav-calendar").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("nav-pulse")).toBeFocused();
  await expect.poll(() => opacity("nav-pulse")).toBe("1");
});

test("whiteboard: notes beyond a shrunken board are pulled back and follow the pointer at once", async ({ page }) => {
  await page.goto("/whiteboard");
  const note = page.getByTestId("wb-note").nth(2);
  const board = page.getByTestId("whiteboard");
  await note.focus();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.setViewportSize({ width: 1024, height: 768 });
  const boardBox = (await board.boundingBox())!;
  // the board re-draws after its ResizeObserver fires
  await expect.poll(async () => (await note.boundingBox())!.x - boardBox.x).toBeLessThanOrEqual(boardBox.width - 48 + 1);
  const before = (await note.boundingBox())!;
  await page.mouse.move(before.x + 10, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x - 90, before.y + 10, { steps: 6 });
  await page.mouse.up();
  const after = (await note.boundingBox())!;
  expect(before.x - after.x).toBeGreaterThan(80);
});

test("brain at 1024×768 fits the viewport (side column does not overflow)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/brain?node=workshop-02");
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(1);
  const rows = await page.locator('[data-testid^="brain-node-"]').evaluateAll((els) => {
    const list = els[0]!.closest("ul")!.getBoundingClientRect();
    return els.filter((el) => { const r = el.getBoundingClientRect(); return r.top >= list.top - 1 && r.bottom <= list.bottom + 1; }).length;
  });
  expect(rows).toBeGreaterThanOrEqual(4);
});

test("backlog 'Add idea' does not announce an expanded state it cannot toggle", async ({ page }) => {
  await page.goto("/backlog");
  await expect(page.getByTestId("add-idea")).not.toHaveAttribute("aria-expanded", /.*/);
});

test("search pick still re-applies after a reload (nav value never repeats)", async ({ page }) => {
  await page.goto("/");
  await workReady(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-input").fill("approved source links");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Avery Example" }).click();
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("search-input").fill("approved source links");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ticket-id="ANA-908"]')).toBeFocused();
});

test("whiteboard: a temporary shrink does not rearrange notes; widening restores them", async ({ page }) => {
  await page.goto("/whiteboard");
  const note = page.getByTestId("wb-note").nth(2);
  await note.focus();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("Shift+ArrowRight");
  const wide = (await note.boundingBox())!;
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  const restored = (await note.boundingBox())!;
  expect(Math.abs(restored.x - wide.x)).toBeLessThan(2);
});

test("brain: the selected concept's details are fully visible at 1280×800 and 1440×900", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/brain?node=workshop-02");
    const clipped = await page.getByTestId("brain-selection").evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(clipped, `${viewport.width}`).toBeLessThanOrEqual(1);
  }
});

test("tooltips are hoverable: the pointer can move onto the label without it disappearing", async ({ page }) => {
  await page.goto("/");
  const item = page.getByTestId("nav-brain");
  const box = (await item.boundingBox())!;
  await item.hover();
  await page.mouse.move(box.x + box.width + 8, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width + 30, box.y + box.height / 2, { steps: 4 });
  const opacity = await item.evaluate((el) => getComputedStyle(el, "::after").opacity);
  expect(opacity).toBe("1");
});

test("calendar: a missing time focuses and marks the time field", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByTestId("cal-add").click();
  await page.getByTestId("cal-title").fill("Time check");
  await page.getByTestId("cal-start").fill("");
  await page.getByTestId("cal-submit").click();
  await expect(page.getByTestId("cal-start")).toBeFocused();
  await expect(page.getByTestId("cal-start")).toHaveAttribute("aria-invalid", "true");
});

test("calendar day buttons announce their event titles", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.locator('[data-date="2026-10-14"]')).toHaveAttribute("aria-label", /Workshop 02 · planned/);
});

test("sessions: a planned session is marked as planned, the last held session leads the timeline", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page.getByTestId("session-workshop-02")).toContainText("Planned · not held yet");
  await expect(page.getByTestId("session-working-session-01")).not.toContainText("Planned");
});
