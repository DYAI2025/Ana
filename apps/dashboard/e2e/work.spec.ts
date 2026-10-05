/**
 * ANA-5 — Jira-backed Board and Backlog, end to end through the production build and the server-side Jira
 * adapter, against a local fake Jira (synthetic data). Every claim is checked against the fake's own state
 * (an independent readback), not only against what the page shows.
 */
import type { Page } from "@playwright/test";
import { expect, FAKE_JIRA, test, workSettled } from "./fixtures";

const column = (page: Page, name: string) => page.locator(`[data-column-name="${name}"]`);
const card = (page: Page, key: string) => page.locator(`[data-ticket-id="${key}"]`);
const STATES = ["Backlog", "Zur Entwicklung ausgewählt", "In Arbeit", "Review", "Erledigt"];

async function openBoard(page: Page) {
  await page.goto("/board");
  await workSettled(page);
}

test.describe("Board — projection of Jira Board 734 / filter 10733", () => {
  test("AC1/AC2 · five Jira states with real keys, summaries, statuses and assignees; empty Kanban-backlog column not rendered", async ({ page }) => {
    await openBoard(page);
    await expect(page.getByTestId("prototype-flag")).toContainText("Jira live");
    await expect(page.locator("[data-column-name]")).toHaveCount(5);
    expect(await page.locator("[data-column-name]").evaluateAll((els) => els.map((el) => el.getAttribute("data-column-name")))).toEqual(STATES);
    const issue = card(page, "ANA-904");
    await expect(column(page, "In Arbeit").locator('[data-ticket-id="ANA-904"]')).toBeVisible();
    await expect(issue).toContainText("Prepare the shared resource map");
    await expect(issue.getByTestId("ticket-status")).toHaveText("In Arbeit");
    await expect(issue).toContainText("Avery Example");
    await expect(issue.getByRole("link", { name: "Open ANA-904 in Jira" })).toHaveAttribute("href", `${FAKE_JIRA}/browse/ANA-904`);
    await expect(card(page, "ANA-901")).toContainText("Unassigned");
    await expect(page.getByTestId("work-source")).toContainText("Jira · ANA board (734) · filter 10733");
  });

  test("AC3 · the dedicated Backlog and the Board's Backlog column show the same Jira items", async ({ page }) => {
    await openBoard(page);
    const onBoard = await column(page, "Backlog").locator("[data-ticket-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-ticket-id")));
    await page.getByTestId("open-backlog").click();
    await expect(page).toHaveURL(/\/backlog$/);
    await workSettled(page);
    const inBacklog = await page.getByTestId("backlog-item").evaluateAll((els) => els.map((el) => el.getAttribute("data-backlog-key")));
    expect(inBacklog).toEqual(onBoard);
    expect(inBacklog).toEqual(["ANA-901", "ANA-902", "ANA-907"]);
    await expect(page.locator('[data-backlog-key="ANA-907"]')).toContainText("Idea");
  });

  test("owner filter is built from Jira assignees, including Unassigned", async ({ page }) => {
    await openBoard(page);
    await page.getByRole("button", { name: "Avery Example" }).click();
    expect(await page.getByTestId("ticket").evaluateAll((els) => els.map((el) => el.getAttribute("data-ticket-id")))).toEqual(["ANA-902", "ANA-904"]);
    await page.getByTestId("filter-unassigned").click();
    expect(await page.getByTestId("ticket").evaluateAll((els) => els.map((el) => el.getAttribute("data-ticket-id")))).toEqual(["ANA-901", "ANA-907"]);
    await page.getByTestId("filter-all").click();
    await expect(page.getByTestId("ticket")).toHaveCount(8);
  });

  test("AC5/AC6 · drag and keyboard moves run Jira transitions, into and out of Review, each confirmed by Jira", async ({ page, jira }) => {
    await openBoard(page);
    await card(page, "ANA-903").dragTo(column(page, "In Arbeit"));
    await expect(page.getByTestId("toast")).toContainText("ANA-903 → In Arbeit · confirmed by Jira");
    await expect(column(page, "In Arbeit").locator('[data-ticket-id="ANA-903"]')).toBeVisible();

    await card(page, "ANA-904").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("toast")).toContainText("ANA-904 → Review · confirmed by Jira");
    await expect(column(page, "Review").locator('[data-ticket-id="ANA-904"]')).not.toHaveAttribute("data-pending", "true");
    await expect(card(page, "ANA-904")).toBeFocused();

    await card(page, "ANA-905").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("toast")).toContainText("ANA-905 → Erledigt · confirmed by Jira");

    const state = await jira.state();
    const status = (key: string) => state.issues.find((i) => i.key === key)!.status;
    expect([status("ANA-903"), status("ANA-904"), status("ANA-905")]).toEqual(["In Arbeit", "Review", "Erledigt"]);
  });

  test("a slow Jira confirmation never takes keyboard focus away from the card the person moved on to", async ({ page, jira }) => {
    await jira.fault({ op: "transition", mode: "commit-then-delay", ms: 900, times: 1 });
    await openBoard(page);
    await card(page, "ANA-903").focus();
    await page.keyboard.press("Shift+ArrowRight"); // slow: Jira answers after ~0.9 s
    await expect(card(page, "ANA-903")).toHaveAttribute("data-pending", "true");
    await expect(card(page, "ANA-903")).toBeFocused(); // keyboard focus follows the card into its new column
    await card(page, "ANA-904").focus(); // the person moves on while the first move is still being written
    await expect(page.getByTestId("toast")).toContainText("ANA-903 → In Arbeit · confirmed by Jira");
    await page.waitForTimeout(150); // past the confirmation's animation frame
    await expect(card(page, "ANA-904")).toBeFocused();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("toast")).toContainText("ANA-904 → Review · confirmed by Jira");
    expect((await jira.state()).issues.find((i) => i.key === "ANA-903")!.status).toBe("In Arbeit");
  });

  test("AC8 · reload rebuilds the board from Jira (a change made in Jira appears, nothing local survives)", async ({ page, jira }) => {
    await openBoard(page);
    // a local, confirmed move first — then Jira changes the same issue behind the page's back
    await card(page, "ANA-901").dragTo(column(page, "Zur Entwicklung ausgewählt"));
    await expect(page.getByTestId("toast")).toContainText("ANA-901 → Zur Entwicklung ausgewählt · confirmed by Jira");
    await jira.setStatus("ANA-901", "10216"); // someone moves it to Review directly in Jira
    await page.reload();
    await workSettled(page);
    await expect(column(page, "Review").locator('[data-ticket-id="ANA-901"]')).toBeVisible();
    // no browser store holds work: only the language choice is kept
    const stores = await page.evaluate(async () => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      indexedDb: (await indexedDB.databases()).map((db) => db.name),
    }));
    expect(stores).toEqual({ local: ["ana.locale"].filter((k) => stores.local.includes(k)), session: [], indexedDb: [] });
  });

  test("AC8 · reconnect: when the network returns the board is read from Jira again; while Jira is unreadable nothing is shown as current", async ({ page, jira, context }) => {
    await openBoard(page);
    await page.getByTestId("nav-now").click(); // in-app navigation keeps the current Jira read
    await page.locator('html[data-work="ready"]').waitFor({ state: "attached" });
    await jira.fault({ op: "board", mode: "network" }); // Jira becomes unreachable
    await context.setOffline(true);
    await context.setOffline(false); // the browser reports "online": the app re-reads Jira, which now fails
    await page.locator('html[data-work="stale"]').waitFor({ state: "attached" });
    await expect(page.getByTestId("context-work")).toContainText("Jira state unknown");
    await page.getByTestId("context-work").click();
    await expect(page.getByTestId("work-stale")).toHaveAttribute("data-state", "UNKNOWN");
    await page.keyboard.press("Escape");
    await page.request.post(`${FAKE_JIRA}/__fake/reset`); // Jira reachable again
    await jira.setStatus("ANA-901", "10113"); // and meanwhile someone moved an issue in Jira
    await context.setOffline(true);
    await context.setOffline(false);
    await page.locator('html[data-work="ready"]').waitFor({ state: "attached" });
    // in-app navigation shows what the reconnect read brought — no page reload involved
    await page.getByTestId("nav-board").click();
    await workSettled(page);
    await expect(column(page, "In Arbeit").locator('[data-ticket-id="ANA-901"]')).toBeVisible();
  });

  test("AC7 · an unsupported transition is BLOCKED, the issue stays where Jira has it", async ({ page, jira }) => {
    await jira.fault({ op: "transitions", mode: "drop-transition", toStatusId: "10216" });
    await openBoard(page);
    await card(page, "ANA-904").focus();
    await page.keyboard.press("Shift+ArrowRight");
    const notice = page.getByTestId("move-failure");
    await expect(notice).toHaveAttribute("data-state", "BLOCKED");
    await expect(notice).toContainText("Jira's workflow does not allow this move");
    await expect(column(page, "In Arbeit").locator('[data-ticket-id="ANA-904"]')).toBeVisible();
    // the card itself carries the state where the person is looking, and leads to the full notice
    const chip = card(page, "ANA-904").getByTestId("ticket-failure");
    await expect(chip).toHaveAttribute("data-state", "BLOCKED");
    await expect(chip).toBeInViewport();
    await chip.click();
    await expect(notice).toBeFocused();
    await expect(notice).toBeInViewport();
    expect((await jira.state()).issues.find((i) => i.key === "ANA-904")!.status).toBe("In Arbeit");
  });

  test("AC7 · a readback mismatch is an ERROR and the board shows Jira's truth, not the requested state", async ({ page, jira }) => {
    await jira.fault({ op: "transition", mode: "ignore" });
    await openBoard(page);
    await card(page, "ANA-902").dragTo(column(page, "Zur Entwicklung ausgewählt"));
    const notice = page.getByTestId("move-failure");
    await expect(notice).toHaveAttribute("data-state", "ERROR");
    await expect(notice).toContainText("readback does not match");
    await expect(column(page, "Backlog").locator('[data-ticket-id="ANA-902"]')).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });

  test("AC7 · a move whose source changed in Jira meanwhile is UNKNOWN and reconciles to Jira", async ({ page, jira }) => {
    await openBoard(page);
    await jira.setStatus("ANA-902", "10115"); // done in Jira, board still shows Backlog
    await card(page, "ANA-902").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("move-failure")).toHaveAttribute("data-state", "UNKNOWN");
    await expect(column(page, "Erledigt").locator('[data-ticket-id="ANA-902"]')).toBeVisible();
    expect((await jira.state()).issues.find((i) => i.key === "ANA-902")!.status).toBe("Erledigt");
  });

  test("Review not mapped on the board: four columns plus an honest note about issues Jira hides", async ({ page, jira }) => {
    await jira.board({ withReview: false });
    await openBoard(page);
    await expect(page.locator("[data-column-name]")).toHaveCount(4);
    await expect(page.getByTestId("work-unmapped")).toContainText("ANA-905");
    await expect(page.getByTestId("work-unmapped")).toContainText("Review");
  });
});

test.describe("Connector failures stay visible (AC7)", () => {
  for (const [label, fault, state, text] of [
    ["auth", { op: "board", mode: "status", status: 401 }, "BLOCKED", "Jira rejected the dashboard's credentials."],
    ["permission", { op: "search", mode: "status", status: 403 }, "BLOCKED", "not allowed"],
    ["unreachable", { op: "board", mode: "network" }, "UNKNOWN", "Jira could not be reached."],
    ["server error", { op: "statuses", mode: "status", status: 500 }, "ERROR", "Jira answered with an error."],
  ] as const) {
    test(`${label}: Board and Backlog show ${state}, no work, no Add idea`, async ({ page, jira }) => {
      await jira.fault(fault); // stays active for every read in this test
      await openBoard(page);
      await expect(page.getByTestId("work-failure")).toHaveAttribute("data-state", state);
      await expect(page.getByTestId("work-failure")).toContainText(text);
      await expect(page.getByTestId("ticket")).toHaveCount(0);
      // the top bar never claims a live Jira connection while there is none
      await expect(page.getByTestId("prototype-flag")).toContainText("Jira not connected");
      await page.goto("/backlog");
      await workSettled(page);
      await expect(page.getByTestId("work-failure")).toHaveAttribute("data-state", state);
      await expect(page.getByTestId("prototype-flag")).toContainText("Jira not connected");
      await expect(page.getByTestId("add-idea")).toBeDisabled();
      await expect(page.getByTestId("backlog-item")).toHaveCount(0);
    });
  }

  test("a drifted board (filter changed) is BLOCKED instead of silently substituted", async ({ page, jira }) => {
    await jira.board({ filterId: "10734" });
    await openBoard(page);
    await expect(page.getByTestId("work-failure")).toHaveAttribute("data-state", "BLOCKED");
    await expect(page.getByTestId("work-failure")).toContainText("Board 734 is no longer the expected source");
  });

  test("Retry recovers once Jira answers again", async ({ page, jira }) => {
    await jira.fault({ op: "board", mode: "network", times: 1 });
    await openBoard(page);
    await expect(page.getByTestId("work-failure")).toBeVisible();
    await page.getByTestId("work-retry").click();
    await expect(page.getByTestId("work-source")).toBeVisible();
    await expect(page.getByTestId("ticket")).toHaveCount(8);
  });
});

test.describe("Backlog — Add idea writes one Jira item, confirmed by readback (AC4/AC6)", () => {
  async function addIdea(page: Page, text: string) {
    await page.goto("/backlog");
    await workSettled(page);
    await page.getByTestId("add-idea").click();
    await page.getByTestId("idea-input").fill(text);
    await page.getByTestId("idea-submit").click();
  }

  test("creates exactly one Jira item in Backlog and shows its durable key; Board and Backlog both show it", async ({ page, jira }) => {
    await addIdea(page, "Try a shared weekly review");
    await expect(page.getByTestId("idea-created")).toContainText("ANA-920 created in Jira Backlog · confirmed by readback");
    await expect(page.locator('[data-backlog-key="ANA-920"]')).toContainText("Try a shared weekly review");
    const state = await jira.state();
    expect(state.creates).toBe(1);
    expect(state.issues.find((i) => i.key === "ANA-920")).toMatchObject({ status: "Backlog", labels: ["ana-dashboard", "ana-idea"] });
    await page.getByRole("link", { name: "Back to Board" }).click();
    await workSettled(page);
    await expect(column(page, "Backlog").locator('[data-ticket-id="ANA-920"]')).toBeVisible();
  });

  test("validation happens before anything is sent; nothing is created", async ({ page, jira }) => {
    await addIdea(page, "   ");
    await expect(page.getByTestId("idea-form").getByRole("alert")).toContainText("Write a short idea first.");
    expect((await jira.state()).creates).toBe(0);
  });

  test("a create that Jira committed but answered too late is found by its marker — still exactly one item", async ({ page, jira }) => {
    await jira.fault({ op: "create", mode: "commit-then-delay", ms: 2_500 });
    await addIdea(page, "Late answer from Jira");
    await expect(page.getByTestId("idea-created")).toContainText("created in Jira Backlog · confirmed by readback", { timeout: 15_000 });
    expect((await jira.state()).creates).toBe(1);
  });

  test("an unanswered create stays UNKNOWN; checking again never creates a second item", async ({ page, jira }) => {
    await jira.searchLag(600_000); // Jira's search cannot see the new item yet
    await jira.fault({ op: "create", mode: "commit-then-delay", ms: 2_500 });
    await addIdea(page, "Outcome unknown");
    const failure = page.getByTestId("idea-failure");
    await expect(failure).toHaveAttribute("data-state", "UNKNOWN", { timeout: 15_000 });
    await expect(page.getByTestId("idea-created")).toHaveCount(0);
    await expect(page.getByTestId("idea-submit")).toHaveText("Check Jira again");
    await page.getByTestId("idea-submit").click();
    await expect(failure).toHaveAttribute("data-state", "UNKNOWN", { timeout: 15_000 });
    expect((await jira.state()).creates).toBe(1);
  });

  test("an UNKNOWN idea survives leaving the page: same text, read-only, and checking again never creates a second item", async ({ page, jira }) => {
    await jira.searchLag(600_000);
    await jira.fault({ op: "create", mode: "commit-then-delay", ms: 2_500 });
    await addIdea(page, "Do not lose me");
    await expect(page.getByTestId("idea-failure")).toHaveAttribute("data-state", "UNKNOWN", { timeout: 15_000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("idea-unresolved")).toContainText("Do not lose me");
    await page.getByRole("link", { name: "Back to Board" }).click();
    await workSettled(page);
    await page.getByTestId("open-backlog").click();
    await workSettled(page);
    await expect(page.getByTestId("idea-input")).toHaveValue("Do not lose me");
    await expect(page.getByTestId("idea-input")).toHaveAttribute("readonly", "");
    await page.getByTestId("idea-submit").click();
    await expect(page.getByTestId("idea-failure")).toHaveAttribute("data-state", "UNKNOWN", { timeout: 15_000 });
    expect((await jira.state()).creates).toBe(1);
  });

  test("reload and type the same idea again: Jira's own record shows it is already there — still exactly one item", async ({ page, jira }) => {
    await addIdea(page, "Weekly retrospective notes");
    await expect(page.getByTestId("idea-created")).toContainText("ANA-920 created in Jira Backlog");
    await page.reload();
    await workSettled(page);
    await page.getByTestId("add-idea").click();
    await page.getByTestId("idea-input").fill("Weekly retrospective notes");
    await page.getByTestId("idea-submit").click();
    await expect(page.getByTestId("idea-created")).toContainText("Already in Jira as ANA-920");
    expect((await jira.state()).creates).toBe(1);
  });

  test("a rejected create is an ERROR and no local item appears", async ({ page, jira }) => {
    await jira.fault({ op: "create", mode: "status", status: 400, message: "summary: invalid" });
    await addIdea(page, "Will be rejected");
    await expect(page.getByTestId("idea-failure")).toHaveAttribute("data-state", "ERROR");
    await expect(page.getByTestId("idea-failure")).toContainText("summary: invalid");
    await expect(page.getByTestId("backlog-item")).toHaveCount(3);
    expect((await jira.state()).creates).toBe(0);
  });

  test("a double submit (Enter twice) creates one item", async ({ page, jira }) => {
    // keep the first create in flight (Jira answers after 0.8 s) so the second Enter really lands during it
    await jira.fault({ op: "create", mode: "commit-then-delay", ms: 800, times: 1 });
    await page.goto("/backlog");
    await workSettled(page);
    await page.getByTestId("add-idea").click();
    await page.getByTestId("idea-input").fill("Pressed twice");
    await page.getByTestId("idea-input").press("Enter");
    await expect(page.getByTestId("idea-submit")).toHaveText("Creating in Jira…");
    await page.getByTestId("idea-input").press("Enter", { timeout: 2_000 });
    await expect(page.getByTestId("idea-created")).toBeVisible();
    expect((await jira.state()).creates).toBe(1);
  });
});

test.describe("AC9 · Jira credentials never reach the browser", () => {
  test("the browser only talks to the dashboard; no page or script contains the token", async ({ page }) => {
    const hosts = new Set<string>();
    const bodies: string[] = [];
    page.on("request", (request) => hosts.add(new URL(request.url()).host));
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (/javascript|json|html|x-component|text\//.test(type)) bodies.push(await response.text().catch(() => ""));
    });
    for (const route of ["/", "/board", "/backlog", "/sessions", "/sessions/working-session-01", "/brain", "/whiteboard", "/calendar", "/pulse", "/vault", "/toolbox"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }
    // client-side navigation fetches React Server Component payloads (text/x-component) too
    await page.getByTestId("nav-board").click();
    await workSettled(page);
    await page.getByTestId("open-backlog").click();
    await workSettled(page);
    expect([...hosts]).toEqual([new URL(page.url()).host]);
    const all = bodies.join("\n");
    expect(all).not.toContain("e2e-fake-token");
    expect(all).not.toContain("JIRA_API_TOKEN");
    expect(all).not.toMatch(/Basic [A-Za-z0-9+/=]{12,}/);
  });
});
