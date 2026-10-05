/**
 * LIVE Jira runtime proof for ANA-5 — runs only by hand against a dashboard that is connected to the real Jira
 * (playwright.live.config.ts). It is bounded on purpose:
 *   - it creates exactly ONE verification idea through the UI and moves only that issue;
 *   - it never touches any other Jira issue;
 *   - the forced failure paths (stale source, target outside the board) are refused before any write.
 * Screenshots go to LIVE_EVIDENCE_DIR (keep them out of the public repository: they show real Jira data).
 * Results go to LIVE_EVIDENCE_DIR/live-result.json.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const DIR = process.env.LIVE_EVIDENCE_DIR ?? "test-results/live";
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];
const log: Record<string, unknown>[] = [];

async function shots(page: Page, name: string) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(DIR, `${viewport.width}x${viewport.height}-${name}.png`) });
  }
  await page.setViewportSize(VIEWPORTS[0]!);
}

test.describe.configure({ mode: "serial" });

test("live: Board and Backlog read Jira, one idea is created and moved through every board column, failures stay visible", async ({ page, request }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // 1 · read
  await page.goto("/board");
  await page.locator('[data-work-phase]:not([data-work-phase="loading"])').waitFor();
  await expect(page.getByTestId("work-source")).toContainText("(734) · filter 10733");
  const columns = await page.locator("[data-column-name]").evaluateAll((els) => els.map((el) => el.getAttribute("data-column-name")));
  // ANA-5 AC2: the live board must expose exactly the five target states, Review included
  expect(columns).toEqual(["Backlog", "Zur Entwicklung ausgewählt", "In Arbeit", "Review", "Erledigt"]);
  const tickets = await page.getByTestId("ticket").count();
  const unmapped = (await page.getByTestId("work-unmapped").count()) ? await page.getByTestId("work-unmapped").textContent() : null;
  log.push({ step: "board-read", columns, tickets, unmapped });
  await shots(page, "live-board");

  await page.getByTestId("open-backlog").click();
  await page.locator('[data-work-phase]:not([data-work-phase="loading"])').waitFor();
  const backlogKeys = await page.getByTestId("backlog-item").evaluateAll((els) => els.map((el) => el.getAttribute("data-backlog-key")));
  log.push({ step: "backlog-read", count: backlogKeys.length });
  await shots(page, "live-backlog");

  // 2 · Add idea (exactly one)
  const summary = `ANA-5 live verification idea ${new Date().toISOString()} — created by the dashboard runtime proof, safe to close`;
  await page.getByTestId("add-idea").click();
  await page.getByTestId("idea-input").fill(summary);
  await page.getByTestId("idea-submit").click();
  const created = page.getByTestId("idea-created");
  await expect(created).toBeVisible({ timeout: 30_000 });
  const key = (await created.textContent())!.match(/ANA-\d+/)![0];
  log.push({ step: "idea-created", key, text: await created.textContent() });
  await expect(page.locator(`[data-backlog-key="${key}"]`)).toBeVisible();
  await shots(page, "live-backlog-idea-created");

  // 3 · the same key on the Board's Backlog column, then move it through every column to the right
  await page.goto(`/board?ticket=${key}`);
  await page.locator('[data-work-phase="ready"]').waitFor();
  const card = page.locator(`[data-ticket-id="${key}"]`);
  await expect(page.locator('[data-backlog="true"]').locator(`[data-ticket-id="${key}"]`)).toBeVisible();
  for (let index = 1; index < columns.length; index += 1) {
    await card.focus();
    await page.keyboard.press("Shift+ArrowRight");
    if (index === 1) await shots(page, "live-board-move-pending");
    await expect(page.getByTestId("toast")).toContainText(`${key} → ${columns[index]} · confirmed by Jira`, { timeout: 30_000 });
    await expect(page.locator(`[data-column-name="${columns[index]}"]`).locator(`[data-ticket-id="${key}"]`)).toBeVisible();
    log.push({ step: "moved", key, to: columns[index] });
    if (columns[index] === "Review") await shots(page, "live-board-in-review");
  }
  // and back out of the last column, proving the reverse transition
  await card.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.getByTestId("toast")).toContainText(`${key} → ${columns[columns.length - 2]} · confirmed by Jira`, { timeout: 30_000 });
  log.push({ step: "moved-back", key, to: columns[columns.length - 2] });
  await shots(page, "live-board-move-confirmed");

  // 4a · a visible UNKNOWN on the real Jira: the verification issue changes in Jira behind the page (through the
  //      dashboard's own API, confirmed by readback); the page still shows the old column and its next move is refused
  const before = await (await request.get("/api/work")).json();
  const live = before.snapshot.issues.find((i: { key: string }) => i.key === key);
  const backlogStatus = before.snapshot.columns[0].statuses[0].id;
  const behind = await (await request.post(`/api/work/issues/${key}/transition`, { data: { fromStatusId: live.status.id, toStatusIds: [backlogStatus] }, headers: { origin: new URL(page.url()).origin } })).json();
  expect(behind).toMatchObject({ ok: true });
  await card.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  const notice = page.getByTestId("move-failure");
  await expect(notice).toHaveAttribute("data-state", "UNKNOWN", { timeout: 30_000 });
  await expect(page.locator('[data-backlog="true"]').locator(`[data-ticket-id="${key}"]`)).toBeVisible();
  log.push({ step: "visible-unknown", key, text: await notice.textContent() });
  await shots(page, "live-board-stale-unknown");

  // 4b · forced failure paths through the dashboard API — refused before any Jira write
  const origin = new URL(page.url()).origin;
  const post = (url: string, data: unknown) => request.post(url, { data, headers: { origin } });
  const state = await (await request.get("/api/work")).json();
  const issue = state.snapshot.issues.find((i: { key: string }) => i.key === key);
  // (the issue is in Backlog now: aim at the next column, claiming a source status it does not have)
  const stale = await (await post(`/api/work/issues/${key}/transition`, { fromStatusId: "1", toStatusIds: [state.snapshot.columns[1].statuses[0].id] })).json();
  const offBoard = await (await post(`/api/work/issues/${key}/transition`, { fromStatusId: issue.status.id, toStatusIds: ["1"] })).json();
  log.push({ step: "forced-failures", stale: stale.failure, offBoard: offBoard.failure });
  expect(stale).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "stale" } });
  expect(offBoard).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "unsupported-transition" } });

  // 5 · reload rebuilds from Jira: the verification issue is where Jira has it (Backlog, after step 4a)
  await page.reload();
  await page.locator('[data-work-phase="ready"]').waitFor();
  await expect(page.locator('[data-backlog="true"]').locator(`[data-ticket-id="${key}"]`)).toBeVisible();
  log.push({ step: "reload", key, column: columns[0] });

  writeFileSync(path.join(DIR, "live-result.json"), JSON.stringify({ at: new Date().toISOString(), log }, null, 2));
});
