/**
 * ANA-38 — Instagram cockpit end to end through the production build, the server-side Social BFF and a local fake
 * Instagram worker (synthetic data only). Expected values come from e2e/fake-social/core.mjs.
 */
import type { Page } from "@playwright/test";
import { expect, socialSettled, test } from "./fixtures";

const ROUTE = "/pulse/social/instagram";
const row = (page: Page, id: string) => page.locator(`[data-testid="content-row"][data-media-id="${id}"]`);
const rateText = (page: Page, id: string, rate: string) => row(page, id).locator(`[data-rate="${rate}"]`);

async function openCockpit(page: Page) {
  await page.goto(ROUTE);
  await socialSettled(page);
}

test.describe("Instagram cockpit — real-data shape, honest states", () => {
  test("AC1 · Pulse links to the cockpit; no new top-level rail item", async ({ page }) => {
    await page.goto("/pulse");
    const railBefore = await page.locator('[data-testid^="nav-"]').count();
    await page.getByTestId("pulse-social-link").click();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
    await socialSettled(page);
    expect(await page.locator('[data-testid^="nav-"]').count()).toBe(railBefore);
    await expect(page.getByTestId("nav-pulse")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Pulse" })).toHaveAttribute("href", "/pulse");
  });

  test("AC2/AC12 · LUMEN shell, rows A–E in order, Topbar says live Instagram (not Prototype)", async ({ page }) => {
    await openCockpit(page);
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    await expect(page.getByTestId("prototype-flag")).toHaveAttribute("data-live", "instagram");
    await expect(page.getByTestId("prototype-flag")).toContainText("Instagram live · read-only");
    const order = await page.locator("[data-testid=instagram-cockpit] > div > section").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(order).toEqual(["hero", "cluster", "stream", "content-map", "audience", "content-rows", "patterns", "comments"]);
    // the 5/7 · 12 · 7/5 · 12 · 7/5 rhythm at 1440: widths in proportion (minus the 20px gap), rows aligned
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const [hero, cluster, stream, map, audience, rows, patterns, comments] = await Promise.all(["hero", "cluster", "stream", "content-map", "audience", "content-rows", "patterns", "comments"].map(box));
    expect(Math.abs((hero!.width + 10) / (cluster!.width + 10) - 5 / 7)).toBeLessThan(0.03);
    expect(Math.abs((map!.width + 10) / (audience!.width + 10) - 7 / 5)).toBeLessThan(0.05);
    expect(Math.abs((patterns!.width + 10) / (comments!.width + 10) - 7 / 5)).toBeLessThan(0.05);
    expect(Math.abs(stream!.width - rows!.width)).toBeLessThan(1);
    expect(Math.abs(hero!.y - cluster!.y)).toBeLessThan(1);
    expect(Math.abs(map!.y - audience!.y)).toBeLessThan(1);
  });

  test("AC4/AC5 · posts, captions, permalinks and metrics render; coverage is explicit", async ({ page }) => {
    await openCockpit(page);
    await expect(page.getByTestId("coverage-retrieved")).toHaveText("28 of 212 posts retrieved");
    await expect(page.getByTestId("coverage-paging")).toHaveText("More posts exist beyond this sample");
    await expect(page.getByTestId("coverage-insights")).toHaveText("Insights for 25 posts; 3 without (Instagram call budget 45/45)");
    await expect(page.getByTestId("last-verified")).toContainText("10 Oct 2026");
    await expect(page.getByTestId("content-row")).toHaveCount(28);
    const r = row(page, "syn002");
    await expect(r).toContainText("Remote job opportunities this week: how to apply");
    await expect(r.locator('[data-metric="reach"]')).toContainText("5.2k");
    await expect(r.getByTestId("row-permalink")).toHaveAttribute("href", "https://example.invalid/p/syn2");
    await expect(page.getByTestId("hero-value")).toHaveText("1.60×");
    await expect(page.getByTestId("hero")).toContainText("1.00× = median of 18 mature Reel posts");
    await expect(page.getByTestId("coverage-priority")).toHaveText("Insights fetched first for posts at least 7 days old");
    await expect(page.getByTestId("cluster-high-intent")).toContainText("n = 18");
    await expect(page.getByTestId("cluster-followers")).toContainText("12,400");
  });

  test("a trial Reel is labelled in its row; Reels without a flag are not", async ({ page }) => {
    await openCockpit(page);
    await expect(row(page, "syn001").getByTestId("row-trial")).toContainText("Trial Reel");
    await expect(page.getByTestId("row-trial")).toHaveCount(1);
  });

  test("AC8 · missing values are named, never shown as 0; no synthetic history", async ({ page }) => {
    await openCockpit(page);
    // ANA-60 moved views and the reach index from the row into the detail: they are checked there
    await row(page, "syn007").getByTestId("row-toggle").click();
    await expect(row(page, "syn007").getByTestId("row-detail").locator('[data-metric="views"]')).toHaveText(/Unavailable/);
    for (const id of ["syn025", "syn026", "syn027"]) {
      // reach and the four rates of the row: named, never 0
      await expect(row(page, id).locator('[data-availability="NOT_FETCHED"]')).toHaveCount(5);
      await row(page, id).getByTestId("row-toggle").click();
      await expect(row(page, id).getByTestId("row-index")).toHaveText("No insights");
    }
    await expect(page.getByTestId("cluster-engaged28")).toHaveAttribute("data-availability", "UNAVAILABLE");
    await expect(page.getByTestId("cluster-engaged28")).not.toContainText(/\b0\b/);
    await expect(page.getByTestId("stream")).toHaveAttribute("data-state", "INSUFFICIENT_EVIDENCE");
    await expect(page.getByTestId("stream")).toContainText("Historical observations required");
    // only the decorative icon: no chart graphic exists in the stream panel
    await expect(page.getByTestId("stream").locator('svg:not([aria-hidden="true"])')).toHaveCount(0);
    await expect(page.getByTestId("audience")).toHaveAttribute("data-state", "NOT_CONNECTED");
    await expect(page.getByTestId("comments")).toHaveAttribute("data-state", "UNSUPPORTED");
  });

  test("AC6 · comparisons stay within one format and mature posts; exclusions are disclosed", async ({ page }) => {
    await openCockpit(page);
    await expect(page.getByTestId("content-map")).toContainText("Reel posts at least 7 days old, n = 18. Other formats are not mixed in.");
    await expect(page.getByTestId("map-point")).toHaveCount(18);
    await row(page, "syn000").getByTestId("row-toggle").click();
    await expect(row(page, "syn000").getByTestId("row-index")).toHaveText("Too young to compare");
    await row(page, "syn020").getByTestId("row-toggle").click();
    await expect(row(page, "syn020").getByTestId("row-index")).toHaveText("Format group too small");
    await page.getByTestId("content-filter-carousel").click();
    await expect(page.getByTestId("content-count")).toHaveText("3 of 28 posts");
    // choosing a Reel on the map while the list shows only carousels brings the post back into view, focused
    await page.getByTestId("map-point").first().click();
    await expect(page.getByTestId("content-count")).toHaveText("28 of 28 posts");
    await expect(page.locator('[data-testid="content-row"] [data-testid="row-detail"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="content-row"]:has([data-testid="row-detail"]) [data-testid="row-toggle"]')).toBeFocused();
  });

  test("metric inspector: keyboard open, every provenance field, Escape returns focus", async ({ page }) => {
    await openCockpit(page);
    const trigger = page.getByTestId("inspect-hero");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("metric-inspector");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    for (const field of ["Provider", "Instagram field", "Unit", "Calculation", "Period", "Baseline", "Source", "API version", "Observed", "Availability"]) {
      await expect(dialog.getByText(field, { exact: true })).toBeVisible();
    }
    await expect(dialog).toContainText("post reach ÷ median reach of mature posts in the same format");
    await expect(dialog).toContainText("v26.0");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("row detail: lifetime metrics with inspectors, derived rates, theme provenance and a session override", async ({ page }) => {
    await openCockpit(page);
    const r = row(page, "syn004");
    await r.getByTestId("row-toggle").click();
    const detail = r.getByTestId("row-detail");
    await expect(detail).toContainText("Caption shown on this computer only; not stored.");
    await expect(detail.getByTestId("rate-high_intent_rate")).toContainText("6.67%");
    await expect(detail.getByTestId("theme-provenance")).toHaveAttribute("data-source", "derived-keyword");
    await expect(detail.getByTestId("theme-provenance")).toContainText("ugc, rates, template, guide, step by step");
    await detail.getByTestId("edit-themes").click();
    await detail.getByLabel("Creator / UGC").uncheck();
    await expect(detail.getByTestId("theme-provenance")).toHaveAttribute("data-source", "manual-session");
    await detail.getByTestId("inspect-saves").click();
    await expect(page.getByTestId("metric-inspector")).toContainText("instagram:media/syn004/insights#saved");
    await page.keyboard.press("Escape");
    // a Reel also shows how it is watched (ANA-51): watch time in seconds, skips in the first 3 s in percent
    await expect(detail.getByTestId("reel-avg_watch_time")).toContainText("18.0 s");
    await expect(detail.getByTestId("reel-skip_rate")).toContainText("38.0%");
    await detail.getByTestId("inspect-avg_watch_time").click();
    await expect(page.getByTestId("metric-inspector")).toContainText("ig_reels_avg_watch_time");
    await expect(page.getByTestId("metric-inspector")).toContainText("Milliseconds (shown in seconds)");
  });

  test("row detail: a carousel has no Reel viewing values", async ({ page }) => {
    await openCockpit(page);
    const r = row(page, "syn020");
    await r.getByTestId("row-toggle").click();
    await expect(r.getByTestId("row-detail")).toBeVisible();
    await expect(r.getByTestId("reel-viewing")).toHaveCount(0);
  });

  test("pattern observations carry sample, formula, comparator, sources, counterexamples and limits", async ({ page }) => {
    await openCockpit(page);
    const winner = page.getByTestId("observation-hidden-winner");
    await expect(winner).toHaveAttribute("data-state", "OBSERVED");
    await expect(winner).toContainText("median of 18 mature Reel posts");
    await expect(winner).toContainText("(saves + shares) ÷ reach, divided by the same-format median");
    await winner.locator("summary").click();
    await expect(winner).toContainText("Shows association, not cause.");
    await winner.getByTestId("evidence-post").first().click();
    await expect(row(page, "syn004").getByTestId("row-detail")).toBeVisible();
  });

  test("AC7 · Substack offer signals: inspect H1 end to end, H2/H3 parked, commercial data NOT_CONNECTED", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("tab-offers").click();
    const offers = page.getByTestId("offer-signals");
    await expect(offers).toContainText("They are not customer demand.");
    await expect(page.getByTestId("parked-H2")).toContainText("Parked");
    await expect(page.getByTestId("parked-H3")).toContainText("Parked");
    for (const c of ["substack-registrations", "paid-subscribers", "link-clicks", "sales"]) {
      await expect(page.getByTestId(`commercial-${c}`)).toHaveAttribute("data-state", "NOT_CONNECTED");
    }
    await expect(page.getByTestId("next-test")).toContainText("within 14 days");
    await expect(page.getByTestId("hypothesis-H1")).toHaveAttribute("data-state", "SIGNAL");
    await page.getByTestId("inspect-hypothesis-H1").click();
    const inspection = page.getByTestId("inspection-H1");
    // exact for the synthetic fixture (see insights.test.ts): 4 supporting, 5 contradicting
    await expect(page.getByTestId("supporting-H1").getByTestId("evidence-post")).toHaveCount(4);
    await expect(page.getByTestId("contradicting-H1").getByTestId("evidence-post")).toHaveCount(5);
    await expect(page.getByTestId("next-test-n")).toHaveText("Compared without overlap: 6 H1 posts, 6 H4 posts (needs 8 each for a lean).");
    await expect(page.getByTestId("next-test")).toContainText("No current lean between H1 and H4.");
    await expect(inspection).toContainText("Themes are keyword suggestions, not confirmed topics.");
    const first = inspection.getByTestId("evidence-post").first();
    await first.click();
    await expect(page.locator('[data-testid="content-row"] [data-testid="row-detail"]')).toHaveCount(1);
  });

  test("keyboard: tabs move with arrow keys", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("tab-observations").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("tab-offers")).toBeFocused();
    await expect(page.getByTestId("tab-offers")).toHaveAttribute("aria-selected", "true");
  });

  test("inspector provenance per derived rate, translated formulas", async ({ page }) => {
    await openCockpit(page);
    await row(page, "syn004").getByTestId("row-toggle").click();
    await page.getByTestId("inspect-rate-saves_per_reach").click();
    const dialog = page.getByTestId("metric-inspector");
    await expect(dialog).toContainText("saved, reach");
    await expect(dialog).toContainText("saves ÷ reach");
    await page.keyboard.press("Escape");
    await page.getByTestId("inspect-high-intent").click();
    await expect(dialog).toContainText("median of (saves + shares) ÷ reach over 18 posts");
  });

  test("every row value has an accessible label at desktop width; tab panels exist for every tab", async ({ page }) => {
    await openCockpit(page);
    const cell = row(page, "syn002").locator('[data-metric="reach"]');
    await expect(cell).toContainText("Reach");
    expect(await cell.locator("span").first().evaluate((e) => getComputedStyle(e).display)).not.toBe("none");
    // ANA-60: the four rates carry their own label (the reach index moved into the detail)
    await expect(row(page, "syn002").getByText("Like rate", { exact: true })).toHaveCount(1);
    const missing = await page.getByRole("tab").evaluateAll((tabs) => tabs.filter((t) => !document.getElementById(t.getAttribute("aria-controls") ?? "")).length);
    expect(missing).toBe(0);
  });

  test("theme editor keeps keyboard focus on its toggle when closing", async ({ page }) => {
    await openCockpit(page);
    await row(page, "syn004").getByTestId("row-toggle").click();
    const toggle = page.getByTestId("edit-themes");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  test("re-selecting the open post while the filter hides it shows it again", async ({ page }) => {
    await openCockpit(page);
    const point = page.getByTestId("map-point").first();
    await point.click();
    await page.getByTestId("content-filter-carousel").click();
    await expect(page.locator('[data-testid="content-row"] [data-testid="row-detail"]')).toHaveCount(0);
    await point.click();
    await expect(page.getByTestId("content-count")).toHaveText("28 of 28 posts");
    await expect(page.locator('[data-testid="content-row"] [data-testid="row-detail"]')).toHaveCount(1);
  });

  test("German locale translates the cockpit", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("ana.locale", "de"));
    await openCockpit(page);
    await expect(page.getByRole("heading", { name: "Neueste Inhalte" })).toBeVisible();
    await expect(page.getByTestId("coverage-retrieved")).toHaveText("28 von 212 Beiträgen abgerufen");
    await expect(page.getByTestId("hero").locator("svg text").first()).toHaveText("1,00×");
    await row(page, "syn004").getByTestId("row-toggle").click();
    await page.getByTestId("inspect-rate-saves_per_reach").click();
    await expect(page.getByTestId("metric-inspector")).toContainText("Gespeichert ÷ Reichweite");
  });
});

test.describe("ANA-60 · Reel rates overview", () => {
  test("AC-1 · each row shows like, share, save and comment rate in percent; missing inputs are named, never 0", async ({ page }) => {
    await openCockpit(page);
    // syn004: reach 2100, likes 141, shares 52, saved 88, comments 7
    await expect(rateText(page, "syn004", "likes_per_reach")).toContainText("6.7%");
    await expect(rateText(page, "syn004", "shares_per_reach")).toContainText("2.5%");
    await expect(rateText(page, "syn004", "saves_per_reach")).toContainText("4.2%");
    await expect(rateText(page, "syn004", "comments_per_reach")).toContainText("0.3%");
    await expect(row(page, "syn004").locator('[data-metric="reach"]')).toContainText("2.1k");
    for (const r of ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach"]) {
      await expect(rateText(page, "syn025", r)).toHaveText(/Not fetched/);
      await expect(rateText(page, "syn025", r)).not.toContainText(/\b0(\.0)?%/);
    }
    // the head: Post | Category | Reach | four rates; views and the reach index live in the detail now
    await expect(page.locator('[data-testid="content-rows"] [role="group"][aria-label="Sort by"]')).toHaveText(/Post.*Category.*Reach.*Like rate.*Share rate.*Save rate.*Comment rate/);
    await row(page, "syn004").getByTestId("row-toggle").click();
    const detail = row(page, "syn004").getByTestId("row-detail");
    await expect(detail.getByTestId("plain-shares_per_reach")).toHaveText("2.5 shares per 100 reached people");
    await expect(detail.getByTestId("plain-likes_per_reach")).toHaveText("6.7 of 100 reached people liked it");
    await expect(detail.getByTestId("plain-comments_per_reach")).toHaveText("0.3 comments per 100 reached people");
    await expect(detail.getByTestId("rate-likes_per_reach")).toContainText("6.71%");
    await detail.getByTestId("inspect-rate-likes_per_reach").click();
    await expect(page.getByTestId("metric-inspector")).toContainText("likes ÷ reach");
    await expect(page.getByTestId("metric-inspector")).toContainText("likes, reach");
    await page.keyboard.press("Escape");
    await expect(detail.getByTestId("row-index")).toContainText("×");
    await expect(detail.locator('[data-metric="views"]')).toContainText("4,300");
    await page.getByTestId("rates-explained").locator("summary").click();
    await expect(page.getByTestId("rates-explained")).toContainText("of 100 people the post reached, this many saved it");
    // the post column sorts by date: its accessible name starts with what it shows (WCAG 2.5.3)
    await expect(page.getByTestId("sort-date")).toHaveAccessibleName("Post, sort by Date");
    await expect(page.getByTestId("sort-likes_per_reach")).toHaveAccessibleName(/^Like rate/);
  });

  test("AC-2 · the category is the Haiku theme (confidence ≥ 0.5); otherwise 'Not categorised'", async ({ page }) => {
    await openCockpit(page);
    await expect(row(page, "syn004").getByTestId("row-category")).toHaveText(/Everyday life/);
    await expect(row(page, "syn020").getByTestId("row-category")).toHaveText(/Everyday life/); // exactly 0.5
    await expect(row(page, "syn008").getByTestId("row-category")).toHaveText(/Not categorised/); // 0.3
    await expect(row(page, "syn013").getByTestId("row-category")).toHaveText(/Not categorised/); // invalid record
    await expect(row(page, "syn001").getByTestId("row-category")).toHaveText(/Not categorised/); // never read
    // only themes that occur, then "not categorised"
    const options = await page.getByTestId("category-filter").locator("option").allTextContents();
    expect(options).toEqual(["All categories", "Beach & sea", "City & street", "Accommodation", "On the way", "Friends & people", "Everyday life", "Not categorised"]);
    // the browser gets theme and confidence only, for the snapshot's own posts
    const body = await (await page.request.get("/api/social/instagram")).json();
    expect(body.categories.state).toBe("on");
    expect(body.categories.tags.syn004).toEqual({ theme: "lifestyle", confidence: 0.9 });
    expect(body.categories.tags.syn999).toBeUndefined();
  });

  test("AC-2 · tagger off: 'Category not available', no category filter, no summary groups", async ({ page }) => {
    expect((await page.request.get("/api/social/instagram?__categories=off")).status()).toBe(204);
    try {
      await openCockpit(page);
      await expect(row(page, "syn004").getByTestId("row-category")).toHaveText(/Category not available/);
      await expect(page.getByTestId("category-filter")).toHaveCount(0);
      await expect(page.getByTestId("category-summary")).toHaveAttribute("data-state", "unavailable");
      await expect(page.getByTestId("category-summary")).toContainText("Category not available");
      await expect(page.getByTestId("summary-category")).toHaveCount(0);
    } finally {
      // a reused server (E2E_BASE_URL) skips the per-test reset: switch the categories back on here
      await page.request.get("/api/social/instagram?__categories=on");
    }
  });

  test("a chosen category does not keep filtering once categories are gone", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("category-filter").selectOption("lifestyle");
    await expect(page.getByTestId("content-count")).toHaveText("8 of 28 posts");
    expect((await page.request.get("/api/social/instagram?__categories=off")).status()).toBe(204);
    try {
      await page.getByTestId("refresh").click();
      await expect(row(page, "syn004").getByTestId("row-category")).toHaveText(/Category not available/);
      await expect(page.getByTestId("content-count")).toHaveText("28 of 28 posts");
    } finally {
      await page.request.get("/api/social/instagram?__categories=on");
    }
  });

  test("AC-3 · sorting by each rate, missing values last; filters combine with an exact count", async ({ page }) => {
    await openCockpit(page);
    const order = () => page.locator('[data-testid="content-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-media-id")));
    expect((await order()).slice(0, 3)).toEqual(["syn000", "syn001", "syn002"]); // default: newest first
    await page.getByTestId("sort-select").selectOption("likes_per_reach:desc");
    let o = await order();
    expect(o.slice(0, 3)).toEqual(["syn024", "syn023", "syn004"]);
    expect(o.slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
    await page.getByTestId("sort-select").selectOption("likes_per_reach:asc");
    o = await order();
    expect(o.slice(0, 3)).toEqual(["syn000", "syn020", "syn005"]);
    expect(o.slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
    // column heads sort too: first click highest first, second click lowest first
    await page.getByTestId("sort-shares_per_reach").click();
    await expect(page.getByTestId("sort-shares_per_reach")).toHaveAttribute("data-dir", "desc");
    expect((await order()).slice(0, 3)).toEqual(["syn004", "syn010", "syn018"]);
    await page.getByTestId("sort-shares_per_reach").click();
    await expect(page.getByTestId("sort-status")).toHaveText("Sorted by Share rate, lowest first. Posts without this value are listed last.");
    expect((await order()).slice(-3)).toEqual(["syn025", "syn026", "syn027"]);
    await page.getByTestId("sort-saves_per_reach").click();
    expect((await order())[0]).toBe("syn004");
    await page.getByTestId("sort-comments_per_reach").click();
    // 7 ÷ 2100 and 8 ÷ 2400 are both exactly 1 ÷ 300: the newer post first
    expect((await order()).slice(0, 2)).toEqual(["syn004", "syn010"]);
  });

  test("AC-3 · category, format and feed/trial filters combine", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("category-filter").selectOption("lifestyle");
    await expect(page.getByTestId("content-count")).toHaveText("8 of 28 posts");
    await page.getByTestId("content-filter-reel").click();
    await expect(page.getByTestId("content-count")).toHaveText("7 of 28 posts");
    await page.getByTestId("distribution-filter-trial").click();
    await expect(page.getByTestId("content-count")).toHaveText("0 of 28 posts");
    await page.getByTestId("category-filter").selectOption("uncategorised");
    await expect(page.getByTestId("content-count")).toHaveText("1 of 28 posts");
    await expect(page.getByTestId("content-row")).toHaveAttribute("data-media-id", "syn001");
    await page.getByTestId("content-filter-all").click();
    await page.getByTestId("distribution-filter-feed").click();
    await page.getByTestId("category-filter").selectOption("all");
    await expect(page.getByTestId("content-count")).toHaveText("5 of 28 posts");
    await expect(page.getByTestId("content-rows")).toContainText("still to be verified");
  });

  test("AC-4 · category summary: n, median per rate, too few posts below 3, formats shown, click filters", async ({ page }) => {
    await openCockpit(page);
    const beach = page.locator('[data-testid="summary-category"][data-category="beach"]');
    await expect(beach.getByTestId("summary-n")).toHaveText("3 posts");
    // median of 305/6100, 289/5600, 91/1100 → 289/5600 = 5.16%
    await expect(beach.getByTestId("summary-likes_per_reach")).toContainText("5.2%");
    await expect(beach.getByTestId("summary-saves_per_reach")).toContainText("0.8%");
    await expect(beach.getByTestId("summary-formats")).toHaveText("Formats: Reel 2 · Image 1");
    const city = page.locator('[data-testid="summary-category"][data-category="city"]');
    await expect(city.getByTestId("summary-n")).toHaveText("2 posts");
    for (const r of ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach"]) await expect(city.getByTestId(`summary-${r}`)).toContainText("Too few posts");
    await expect(page.locator('[data-testid="summary-category"][data-category="lifestyle"]').getByTestId("summary-formats")).toContainText("including 1 still growing");
    await expect(page.getByTestId("category-summary")).toContainText("over the 28 posts shown");
    // the summary follows the filters
    await page.getByTestId("content-filter-reel").click();
    await expect(beach.getByTestId("summary-n")).toHaveText("2 posts");
    await expect(beach.getByTestId("summary-likes_per_reach")).toContainText("Too few posts");
    await page.getByTestId("content-filter-all").click();
    // a click on a category sets the category filter; a second click clears it
    await beach.getByTestId("summary-pick").click();
    await expect(page.getByTestId("category-filter")).toHaveValue("beach");
    await expect(page.getByTestId("content-count")).toHaveText("3 of 28 posts");
    await expect(page.getByTestId("summary-category")).toHaveCount(1);
    await beach.getByTestId("summary-pick").click();
    await expect(page.getByTestId("category-filter")).toHaveValue("all");
    await expect(page.getByTestId("content-count")).toHaveText("28 of 28 posts");
  });

  test("AC-5 · posts younger than 7 days are marked 'still growing'", async ({ page }) => {
    await openCockpit(page);
    await expect(page.getByTestId("row-growing")).toHaveCount(2);
    await expect(row(page, "syn000").getByTestId("row-growing")).toContainText("still growing");
    await expect(row(page, "syn001").getByTestId("row-growing")).toContainText("still growing");
    await expect(row(page, "syn002").getByTestId("row-growing")).toHaveCount(0);
  });

  test("AC-6 · keyword themes only in the detail, renamed, with the session override", async ({ page }) => {
    await openCockpit(page);
    const keyword = /Travel \/ Freedom|Creator \/ UGC|Money \/ Work|Personal experience|Opportunities \/ Practical resources/;
    // row head and both filter groups (format, feed/trial)
    expect((await page.locator('[data-testid="content-rows"] [role="group"]').allTextContents()).join("|")).not.toMatch(keyword);
    await expect(page.getByTestId("category-summary")).not.toContainText(keyword);
    expect((await page.getByTestId("category-filter").locator("option").allTextContents()).join("|")).not.toMatch(keyword);
    await expect(page.getByTestId("row-category").filter({ hasText: keyword })).toHaveCount(0);
    const r = row(page, "syn004");
    await r.getByTestId("row-toggle").click();
    await expect(r.getByTestId("row-detail")).toContainText("Offer signal themes (keyword-based, for H1/H4)");
    await expect(r.getByTestId("offer-themes")).toContainText("Creator / UGC");
    await r.getByTestId("edit-themes").click();
    await r.getByLabel("Creator / UGC").uncheck();
    await expect(r.getByTestId("offer-themes")).not.toContainText("Creator / UGC");
    await expect(r.getByTestId("theme-provenance")).toHaveAttribute("data-source", "manual-session");
  });

  test("German: plain language, the renamed themes and the categories", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("ana.locale", "de"));
    await openCockpit(page);
    await expect(rateText(page, "syn004", "shares_per_reach")).toContainText("2,5");
    await expect(row(page, "syn004").getByTestId("row-category")).toHaveText(/Alltag/);
    await expect(row(page, "syn008").getByTestId("row-category")).toHaveText(/Nicht eingeordnet/);
    await expect(row(page, "syn000").getByTestId("row-growing")).toContainText("wächst noch");
    await expect(page.locator('[data-testid="summary-category"][data-category="city"]')).toContainText("Zu wenige Posts");
    await row(page, "syn004").getByTestId("row-toggle").click();
    await expect(row(page, "syn004").getByTestId("row-detail")).toContainText("Angebots-Signal-Themen (stichwortbasiert, für H1/H4)");
    await expect(row(page, "syn004").getByTestId("plain-shares_per_reach")).toHaveText("2,5-mal geteilt pro 100 erreichte Personen");
    await expect(row(page, "syn004").getByTestId("plain-saves_per_reach")).toHaveText("4,2 von 100 erreichten Personen haben gespeichert");
  });
});

test.describe("Instagram cockpit — failure states (AC10)", () => {
  const cases: { fault: Record<string, unknown>; state: string; code: string; text: string }[] = [
    { fault: { status: 409, error: "reauth-required" }, state: "PERMISSION_REQUIRED", code: "reauth-required", text: "re-authorized by Ana" },
    { fault: { status: 409, error: "account-mismatch" }, state: "PERMISSION_REQUIRED", code: "account-mismatch", text: "not the expected one" },
    { fault: { status: 401, error: "unauthorized" }, state: "ERROR", code: "auth", text: "refused the dashboard's key" },
    { fault: { status: 502, error: "instagram-media-fetch-failed" }, state: "ERROR", code: "upstream", text: "returned an error" },
    { fault: { invalid: true }, state: "ERROR", code: "invalid-response", text: "could not be read safely" },
    { fault: { hang: true }, state: "ERROR", code: "unavailable", text: "did not answer" },
    { fault: { network: true }, state: "ERROR", code: "unavailable", text: "did not answer" },
  ];
  for (const c of cases) {
    test(`${JSON.stringify(c.fault)} → ${c.state} (${c.code}), no values shown`, async ({ page, social }) => {
      await social.fault(c.fault);
      await openCockpit(page);
      await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", c.state);
      await expect(page.getByTestId("cockpit-failure")).toHaveAttribute("data-code", c.code);
      await expect(page.getByTestId("cockpit-failure")).toContainText(c.text);
      await expect(page.getByTestId("content-row")).toHaveCount(0);
      await expect(page.getByTestId("hero")).toHaveCount(0);
      // the Topbar never claims "live" while the cockpit cannot read Instagram
      await expect(page.getByTestId("prototype-flag")).toHaveText(/Instagram not connected/);
    });
  }

  test("EMPTY: no posts returned is said plainly", async ({ page, social }) => {
    await social.fault({ empty: true });
    await openCockpit(page);
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "EMPTY");
    await expect(page.getByTestId("cockpit-empty")).toContainText("No posts returned");
    // the Topbar flag names the real state too: a verified read of nothing is never "live" (Owner rule: Live only while CONNECTED)
    await expect(page.getByTestId("prototype-flag")).toHaveAttribute("data-social", "EMPTY");
    await expect(page.getByTestId("prototype-flag")).toContainText("Instagram · no posts · read-only");
    await expect(page.getByTestId("prototype-flag")).not.toContainText(/live/i);
    await page.getByTestId("lang-de").click();
    await expect(page.getByTestId("prototype-flag")).toContainText("Instagram · keine Beiträge · nur lesend");
    await page.getByTestId("lang-it").click();
    await expect(page.getByTestId("prototype-flag")).toContainText("Instagram · nessun post · sola lettura");
    await expect(page.getByTestId("prototype-flag")).not.toContainText(/live/i);
  });

  test("STALE: a failed refresh keeps the older snapshot but labels it not current", async ({ page, social }) => {
    await openCockpit(page);
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    await social.fault({ status: 502, error: "instagram-media-fetch-failed" });
    await page.getByTestId("refresh").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "STALE");
    await expect(page.getByTestId("stale-banner")).toContainText("not current");
    await expect(page.getByTestId("prototype-flag")).toHaveText(/Instagram · older snapshot/);
  });

  test("a permission problem after a good read is not hidden behind the older snapshot", async ({ page, social }) => {
    await openCockpit(page);
    await social.fault({ status: 409, error: "reauth-required" });
    await page.getByTestId("refresh").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "PERMISSION_REQUIRED");
    await expect(page.getByTestId("content-row")).toHaveCount(0);
  });

  test("the browser never calls the worker and never sees the key", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await openCockpit(page);
    expect(requests.some((u) => u.includes("/internal/social-snapshot") || u.includes(":3198"))).toBe(false);
    const html = await page.content();
    expect(html).not.toContain("e2e-fake-social-key");
  });
});

test.describe("Instagram cockpit — tablet 768×1024 (just above the 760 breakpoint)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("content rows fit their panel; panels do not overlap", async ({ page }) => {
    await openCockpit(page);
    const wide = await page.locator('[data-testid="content-row"] > div').evaluateAll((rows) => rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length);
    expect(wide).toBe(0);
    const boxes = await page.locator("[data-testid=instagram-cockpit] > div > section").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
    for (let i = 1; i < boxes.length; i += 1) expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1);
  });
});

test.describe("Instagram cockpit — mobile 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("single column, ranked list instead of the scatter, no horizontal scroll, inspector inside the viewport", async ({ page }) => {
    await openCockpit(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId("content-map").locator("svg")).toBeHidden();
    await expect(page.getByRole("list", { name: "Ranked by reach index" })).toBeVisible();
    await expect(row(page, "syn002").getByText("Share rate", { exact: true })).toBeVisible();
    await expect(row(page, "syn002").getByTestId("row-category")).toContainText("Everyday life");
    await page.getByTestId("inspect-followers").click();
    const box = await page.getByTestId("metric-inspector").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const dir = process.env.EVIDENCE_DIR;
    if (dir) {
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${dir}/390x844-instagram-cockpit.png` });
      await page.getByTestId("content-rows").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/390x844-instagram-content.png` });
      // ANA-60: summary, then an active sort and category filter, then an open detail
      await page.getByTestId("category-summary").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/390x844-instagram-rates-summary.png` });
      await page.getByTestId("sort-select").selectOption("shares_per_reach:desc");
      await page.getByTestId("category-filter").selectOption("lifestyle");
      await page.getByTestId("category-filter").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/390x844-instagram-rates-sorted-filtered.png` });
      await row(page, "syn004").getByTestId("row-toggle").click();
      await row(page, "syn004").getByTestId("row-detail").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/390x844-instagram-rates-detail.png` });
    }
  });
});
