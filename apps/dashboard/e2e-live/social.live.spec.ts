/**
 * LIVE Instagram runtime proof for ANA-38 — runs only by hand against a dashboard whose server is configured with the
 * real worker (SOCIAL_IG_WORKER_URL / SOCIAL_IG_INTERNAL_READ_KEY). Read-only: it never writes to Instagram or the worker.
 * The result file records states, counts and availability distributions only — never captions, ids, links or metric
 * values. Screenshots are taken only after every caption is replaced and every thumbnail source removed (PO decision:
 * captions never in screenshots); they still show real metric values, so LIVE_EVIDENCE_DIR is required and must be outside the repository.
 * SOCIAL_IG_INTERNAL_READ_KEY must be exported to this process too: the spec checks the BFF body never contains it.
 *
 *   LIVE_BASE_URL=http://127.0.0.1:3300 LIVE_EVIDENCE_DIR=<dir outside the repo> SOCIAL_IG_INTERNAL_READ_KEY=… \
 *     npx playwright test -c playwright.live.config.ts social.live
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const REPO = path.resolve(__dirname, "../../..");
const DIR = process.env.LIVE_EVIDENCE_DIR ? path.resolve(process.env.LIVE_EVIDENCE_DIR) : "";
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

const tally = (values: (string | null)[]) => values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v ?? "null"]: (acc[v ?? "null"] ?? 0) + 1 }), {});

test("live: the cockpit renders real Instagram data through the server-side worker adapter", async ({ page, request }) => {
  test.setTimeout(180_000);
  expect(DIR, "LIVE_EVIDENCE_DIR is required").not.toBe("");
  expect(DIR.startsWith(REPO + path.sep) || DIR === REPO, "LIVE_EVIDENCE_DIR must be outside the repository").toBe(false);
  const key = process.env.SOCIAL_IG_INTERNAL_READ_KEY;
  expect(key, "SOCIAL_IG_INTERNAL_READ_KEY is needed for the leak check").toBeTruthy();
  await page.emulateMedia({ reducedMotion: "reduce" });

  // 1 · the BFF answers with a real snapshot; no credential or token in what the browser could receive
  const api = await request.get("/api/social/instagram");
  const body = await api.text();
  const parsed = JSON.parse(body) as { ok: boolean; stale?: boolean; snapshot?: { provider_api_version: string; coverage: Record<string, unknown> } };
  expect(parsed.ok).toBe(true);
  expect(body).not.toContain("access_token");
  expect(body.includes(key!)).toBe(false);

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
  // ANA-39: lane states, suggested next step and eligible counts only (no caption, keyword or post id leaves the page)
  const hypotheses = Object.fromEntries(
    await page.locator('[data-testid^="hypothesis-"]').evaluateAll((els) =>
      els.map((e) => [
        e.getAttribute("data-testid"),
        {
          lanes: Object.fromEntries([...e.querySelectorAll('[data-testid^="lane-"]')].map((l) => [l.getAttribute("data-testid")!.split("-").slice(2).join("-"), l.getAttribute("data-state")])),
          suggested: e.querySelector('[data-testid^="decision-"]')?.getAttribute("data-suggested") ?? null,
        },
      ]),
    ),
  );
  const h1Eligible = await page.getByTestId("eligible-H1").getByTestId("fit-row").count();
  const h1Sources = tally(await page.getByTestId("eligible-H1").getByTestId("fit-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-source"))));
  const comparison = await page.getByTestId("engagement-comparison").getAttribute("data-state");
  const commercial = tally(await page.locator('[data-testid^="commercial-"][data-state]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state"))));

  await page.getByTestId("tab-observations").click();
  // Redaction does not rely on the CSS cascade (an injected stylesheet was observed not to win reliably): caption text
  // is replaced and thumbnail sources are removed in the DOM, then checked, right before every screenshot.
  const redact = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-caption]")) el.textContent = "▇▇▇ redacted ▇▇▇";
      for (const img of document.querySelectorAll<HTMLImageElement>("[data-testid=content-row] img")) {
        img.removeAttribute("src");
        img.removeAttribute("srcset");
      }
    });
  const unredacted = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll("[data-caption]")].filter((e) => e.textContent !== "▇▇▇ redacted ▇▇▇").length +
        [...document.querySelectorAll<HTMLImageElement>("[data-testid=content-row] img")].filter((i) => i.getAttribute("src")).length,
    );
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    await redact();
    expect(await unredacted(), "no caption or thumbnail survives into the screenshot").toBe(0);
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
        h1_eligible: h1Eligible,
        h1_eligible_sources: h1Sources,
        engagement_comparison: comparison,
        commercial,
      },
      null,
      2,
    ),
  );
});
