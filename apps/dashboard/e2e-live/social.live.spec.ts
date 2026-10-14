/**
 * LIVE Instagram runtime proof for ANA-38 — runs only by hand against a dashboard whose server is configured with the
 * real worker (SOCIAL_IG_WORKER_URL / SOCIAL_IG_INTERNAL_READ_KEY). Read-only: it never writes to Instagram or the worker.
 * The result file records states, counts and availability distributions only — never captions, ids, links or metric
 * values. Screenshots show real data: LIVE_EVIDENCE_DIR must be outside the public repository.
 *
 *   LIVE_BASE_URL=http://127.0.0.1:3300 LIVE_EVIDENCE_DIR=<dir outside the repo> npx playwright test -c playwright.live.config.ts social.live
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const DIR = process.env.LIVE_EVIDENCE_DIR ?? "test-results/live";
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

const tally = (values: (string | null)[]) => values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v ?? "null"]: (acc[v ?? "null"] ?? 0) + 1 }), {});

test("live: the cockpit renders real Instagram data through the server-side worker adapter", async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // 1 · the BFF answers with a real snapshot; no credential or token in what the browser could receive
  const api = await request.get("/api/social/instagram");
  const body = await api.text();
  const parsed = JSON.parse(body) as { ok: boolean; stale?: boolean; snapshot?: { provider_api_version: string; coverage: Record<string, unknown> } };
  expect(parsed.ok).toBe(true);
  expect(body).not.toContain("access_token");
  const key = process.env.SOCIAL_IG_INTERNAL_READ_KEY;
  if (key) expect(body.includes(key)).toBe(false);

  // 2 · the page shows it
  await page.goto("/pulse/social/instagram");
  await page.locator('[data-testid="instagram-cockpit"]:not([data-state="LOADING"])').waitFor({ timeout: 90_000 });
  const state = await page.getByTestId("instagram-cockpit").getAttribute("data-state");
  expect(state).toBe("CONNECTED");
  await expect(page.getByTestId("prototype-flag")).toHaveAttribute("data-live", "instagram");

  const rows = await page.getByTestId("content-row").count();
  expect(rows).toBeGreaterThan(0);
  const availability: Record<string, Record<string, number>> = {};
  for (const metric of ["reach", "views", "saves", "shares", "comments"]) {
    availability[metric] = tally(await page.locator(`[data-testid="content-row"] [data-metric="${metric}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-availability"))));
  }
  const formats = tally(await page.getByTestId("content-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-format"))));
  const insights = tally(await page.getByTestId("content-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-insights"))));
  const cluster = Object.fromEntries(
    await page.locator('[data-testid^="cluster-"][data-availability]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("data-availability")])),
  );
  const patterns = Object.fromEntries(await page.locator('[data-testid^="observation-"]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("data-state")])));
  const mapPoints = await page.getByTestId("map-point").count();
  const heroState = await page.getByTestId("hero").getAttribute("data-state");
  const thumbnails = await page.locator('[data-testid="content-row"] img').count();

  // 3 · inspector and one H1 inspection work on real data
  await page.getByTestId("inspect-followers").click();
  await expect(page.getByTestId("metric-inspector")).toContainText(parsed.snapshot!.provider_api_version);
  await page.keyboard.press("Escape");
  await page.getByTestId("tab-offers").click();
  await page.getByTestId("inspect-hypothesis-H1").click();
  await expect(page.getByTestId("inspection-H1")).toBeVisible();
  const hypotheses = Object.fromEntries(await page.locator('[data-testid^="hypothesis-"]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("data-state")])));
  const commercial = tally(await page.locator('[data-testid^="commercial-"][data-state]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state"))));

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(DIR, `${viewport.width}x${viewport.height}-live-instagram.png`), fullPage: viewport.width === 1440 });
  }

  writeFileSync(
    path.join(DIR, "live-social-result.json"),
    JSON.stringify(
      {
        cockpit_state: state,
        stale: parsed.stale ?? false,
        api_version: parsed.snapshot!.provider_api_version,
        coverage: parsed.snapshot!.coverage,
        rows,
        formats,
        insights,
        row_metric_availability: availability,
        cluster,
        hero_state: heroState,
        map_points: mapPoints,
        thumbnails_rendered: thumbnails,
        patterns,
        hypotheses,
        commercial,
      },
      null,
      2,
    ),
  );
});
