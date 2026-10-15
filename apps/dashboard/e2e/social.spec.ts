/**
 * ANA-38 — Instagram cockpit end to end through the production build, the server-side Social BFF and a local fake
 * Instagram worker (synthetic data only). Expected values come from e2e/fake-social/core.mjs.
 * ANA-39 adds the F1.I1 evidence-lane journeys (topical fit, four lanes, next step / ABSTAIN).
 */
import type { Page } from "@playwright/test";
import { expect, socialSettled, test } from "./fixtures";

const ROUTE = "/pulse/social/instagram";
const row = (page: Page, id: string) => page.locator(`[data-testid="content-row"][data-media-id="${id}"]`);

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
    await expect(page.getByTestId("cluster-content-action")).toContainText("n = 18");
    await expect(page.getByTestId("cluster-followers")).toContainText("12,400");
  });

  test("AC8 · missing values are named, never shown as 0; no synthetic history", async ({ page }) => {
    await openCockpit(page);
    await expect(row(page, "syn007").locator('[data-metric="views"]')).toHaveText(/Unavailable/);
    for (const id of ["syn025", "syn026", "syn027"]) {
      await expect(row(page, id).locator('[data-availability="NOT_FETCHED"]')).toHaveCount(5);
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
    await expect(row(page, "syn000").getByTestId("row-index")).toHaveText("Too young to compare");
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
    await expect(detail.getByTestId("rate-content_action_rate")).toContainText("6.67%");
    await expect(detail.getByTestId("theme-provenance")).toHaveAttribute("data-source", "derived-keyword");
    await expect(detail.getByTestId("theme-provenance")).toContainText("ugc, rates, template, guide, step by step");
    await detail.getByTestId("edit-themes").click();
    await detail.getByLabel("Creator / UGC").uncheck();
    await expect(detail.getByTestId("theme-provenance")).toHaveAttribute("data-source", "manual-session");
    await detail.getByTestId("inspect-saves").click();
    await expect(page.getByTestId("metric-inspector")).toContainText("instagram:media/syn004/insights#saved");
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
    await expect(offers).toContainText("H1 and H4 are product hypotheses, not demand.");
    await expect(page.getByTestId("parked-H2")).toContainText("Parked");
    await expect(page.getByTestId("parked-H3")).toContainText("Parked");
    for (const c of ["substack-registrations", "paid-subscribers", "link-clicks", "sales"]) {
      await expect(page.getByTestId(`commercial-${c}`)).toHaveAttribute("data-state", "NOT_CONNECTED");
    }
    await page.getByTestId("inspect-hypothesis-H1").click();
    const inspection = page.getByTestId("inspection-H1");
    // exact for the synthetic fixture (see offers.test.ts): syn002, syn008 (Reels) and syn022 (carousel)
    await expect(page.getByTestId("eligible-H1").getByTestId("fit-row")).toHaveCount(3);
    await expect(inspection).toContainText("Lifetime metrics keep growing");
    const first = inspection.getByTestId("evidence-post").first();
    await first.click();
    await expect(page.locator('[data-testid="content-row"] [data-testid="row-detail"]')).toHaveCount(1);
  });

  test("ANA-39 AC2/AC3 · travel and money posts are no longer product evidence; four lanes, engagement is not demand", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("tab-offers").click();
    for (const id of ["H1", "H4"]) {
      const card = page.getByTestId(`hypothesis-${id}`);
      await expect(card.getByTestId(`lane-${id}-TOPICAL_FIT`)).toHaveAttribute("data-state", "DERIVED");
      await expect(card.getByTestId(`lane-${id}-CONTENT_RESONANCE`)).toHaveAttribute("data-state", "INSUFFICIENT_EVIDENCE");
      await expect(card.getByTestId(`lane-${id}-AUDIENCE_NEED`)).toHaveAttribute("data-state", "NOT_CONNECTED");
      await expect(card.getByTestId(`lane-${id}-COMMERCIAL_OUTCOME`)).toHaveAttribute("data-state", "NOT_CONNECTED");
      await expect(card.getByTestId(`lane-${id}-CONTENT_RESONANCE`)).toContainText("2 of 3 eligible posts can be compared; at least 3 are needed.");
      await expect(card).not.toContainText(/supporting|contradicting|high.intent|lean/i);
    }
    await expect(page.getByTestId("hypothesis-H1")).toContainText("Travel, nomad, creator or UGC alone does not qualify.");
    await page.getByTestId("inspect-hypothesis-H1").click();
    const rows = page.getByTestId("eligible-H1").getByTestId("fit-row");
    await expect(rows.nth(0)).toHaveAttribute("data-media-id", "syn002");
    await expect(rows.nth(0)).toContainText("caption keywords: job, remote");
    // the high-save island-trip and moving-abroad Reels that ANA-38 counted as H1 support are gone
    for (const travel of ["syn003", "syn005", "syn011", "syn014"]) await expect(page.locator(`[data-testid="fit-row"][data-media-id="${travel}"]`)).toHaveCount(0);
    const inspection = page.getByTestId("inspection-H1");
    await expect(inspection).toContainText("Low resonance is not evidence against the product");
    await expect(page.getByTestId("unindexed-H1")).toHaveText("too few posts of its format: 1");
    await expect(page.getByTestId("disclosure-H1")).toContainText("Reel 2/2, n = 18 · Carousel 0/1, n = 3");
    await expect(page.getByTestId("disclosure-H1")).toContainText("a maturity cutoff, not age matching");
    await expect(page.getByTestId("limits-H1").locator('[data-limit="format-skew"]')).toHaveCount(1);
    await expect(page.getByTestId("engagement-comparison")).toHaveAttribute("data-state", "INSUFFICIENT_EVIDENCE");
    await expect(page.getByTestId("comparison-n")).toHaveText("Compared without overlap: 2 H1-only, 2 H4-only, 0 fitting both (needs 8 on each side).");
    await expect(page.getByTestId("engagement-comparison")).toContainText("not a percentage");
  });

  test("ANA-39 AC2 · a broad 'opportunities' theme override never qualifies H1 or H4", async ({ page }) => {
    await openCockpit(page);
    const r = row(page, "syn005"); // "Island trip vlog part 1"
    await r.getByTestId("row-toggle").click();
    const detail = r.getByTestId("row-detail");
    await detail.getByTestId("edit-themes").click();
    await detail.getByLabel("Opportunities / Practical resources").check();
    await expect(detail.getByTestId("theme-provenance")).toHaveAttribute("data-source", "manual-session");
    for (const id of ["H1", "H4"]) await expect(detail.getByTestId(`fit-${id}`)).toHaveAttribute("data-eligible", "false");
    await page.getByTestId("tab-offers").click();
    await expect(page.getByTestId("lane-H1-TOPICAL_FIT")).toContainText("3 posts");
    await expect(page.getByTestId("lane-H4-TOPICAL_FIT")).toContainText("3 posts");
  });

  test("ANA-39 AC3/AC5 · session correction is hypothesis-specific and visible; next step or ABSTAIN is selectable by keyboard", async ({ page }) => {
    await openCockpit(page);
    const r = row(page, "syn002");
    await r.getByTestId("row-toggle").click();
    const fit = r.getByTestId("fit-H1");
    await expect(fit).toHaveAttribute("data-source", "derived-keyword");
    await r.getByTestId("fit-select-H1").selectOption("exclude");
    await expect(fit).toHaveAttribute("data-source", "manual-session");
    await expect(fit).toHaveAttribute("data-eligible", "false");
    await expect(r.getByTestId("fit-H4")).toHaveAttribute("data-source", "unclassified");
    await page.getByTestId("tab-offers").click();
    await expect(page.getByTestId("lane-H1-TOPICAL_FIT")).toContainText("2 posts: 2 by caption keywords, 0 by session correction");
    await page.getByTestId("inspect-hypothesis-H1").click();
    await expect(page.getByTestId("session-excluded-H1").getByTestId("fit-row")).toHaveAttribute("data-media-id", "syn002");
    await expect(page.getByTestId("session-excluded-H1")).toContainText("excluded by session correction (caption keywords: job, remote)");
    const decision = page.getByTestId("decision-H1");
    await expect(decision).toHaveAttribute("data-suggested", "comparable-observations");
    await expect(page.getByTestId("decision-note-H1")).toContainText("Nothing chosen.");
    await page.getByTestId("decide-H1-ABSTAIN").focus();
    await page.keyboard.press("Space");
    await expect(decision).toHaveAttribute("data-chosen", "ABSTAIN");
    await page.keyboard.press("ArrowDown");
    await expect(decision).toHaveAttribute("data-chosen", "comparable-observations");
    await expect(page.getByTestId("decision-note-H1")).toContainText("Chosen for this session: Wait for more comparable mature posts on this specific subject. Nothing is collected, sent or stored from here.");
    // the choice survives a tab switch (session state lives above the tab panels)
    await page.getByTestId("tab-observations").click();
    await page.getByTestId("tab-offers").click();
    await expect(page.getByTestId("decision-H1")).toHaveAttribute("data-chosen", "comparable-observations");
  });

  test("ANA-39 AC5 · a chosen step that the evidence no longer offers is not shown as chosen", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("tab-offers").click();
    await page.getByTestId("decide-H1-comparable-observations").check();
    await expect(page.getByTestId("decision-H1")).toHaveAttribute("data-chosen", "comparable-observations");
    // a third comparable Reel (session correction) gives H1 enough resonance observations: the step is no longer offered
    const r = row(page, "syn005");
    await r.getByTestId("row-toggle").click();
    await r.getByTestId("fit-select-H1").selectOption("include");
    await expect(page.getByTestId("lane-H1-CONTENT_RESONANCE")).toHaveAttribute("data-state", "OBSERVED");
    await expect(page.getByTestId("decide-H1-comparable-observations")).toHaveCount(0);
    await expect(page.getByTestId("decision-H1")).toHaveAttribute("data-chosen", "");
    await expect(page.getByTestId("decision-note-H1")).toContainText("Nothing chosen.");
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
    await page.getByTestId("inspect-content-action").click();
    await expect(dialog).toContainText("median of (saves + shares) ÷ reach over 18 posts");
  });

  test("every row value has an accessible label at desktop width; tab panels exist for every tab", async ({ page }) => {
    await openCockpit(page);
    const cell = row(page, "syn002").locator('[data-metric="reach"]');
    await expect(cell).toContainText("Reach");
    expect(await cell.locator("span").first().evaluate((e) => getComputedStyle(e).display)).not.toBe("none");
    await expect(row(page, "syn002").getByText("Reach index", { exact: true })).toHaveCount(1);
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

  for (const [locale, lane, abstain] of [
    ["de", "Thematische Passung", "Enthalten — keine Produktentscheidung aus dieser Evidenz"],
    ["it", "Pertinenza tematica", "Astenersi — nessuna decisione di prodotto da questa evidenza"],
  ] as const) {
    test(`ANA-39 AC6 · ${locale}: evidence lanes, next step and ABSTAIN are translated`, async ({ page }) => {
      await page.addInitScript((l) => window.localStorage.setItem("ana.locale", l), locale);
      await openCockpit(page);
      await page.getByTestId("tab-offers").click();
      await expect(page.getByTestId("lane-H1-TOPICAL_FIT")).toContainText(lane);
      await expect(page.getByTestId("decision-H1")).toContainText(abstain);
      await expect(page.getByTestId("offer-signals")).not.toContainText(/high.intent|alta intenzione/i);
    });
  }
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

  test("ANA-39 AC4 · a stale snapshot is disclosed on the H1/H4 resonance reading", async ({ page, social }) => {
    await openCockpit(page);
    await social.fault({ status: 502, error: "instagram-media-fetch-failed" });
    await page.getByTestId("refresh").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "STALE");
    await page.getByTestId("tab-offers").click();
    await page.getByTestId("inspect-hypothesis-H4").click();
    await expect(page.getByTestId("limits-H4").locator('[data-limit="stale-snapshot"]')).toContainText("not current");
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
    await expect(row(page, "syn002").getByText("Reach index", { exact: true })).toBeVisible();
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
    }
  });

  test("ANA-39 AC6 · offer signals: lanes and next-step choice fit the viewport", async ({ page }) => {
    await openCockpit(page);
    await page.getByTestId("tab-offers").click();
    await page.getByTestId("inspect-hypothesis-H1").click();
    await page.getByTestId("decide-H1-ABSTAIN").check();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByTestId("hypothesis-H1").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const dir = process.env.EVIDENCE_DIR;
    if (dir) {
      await page.getByTestId("hypothesis-H1").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/390x844-instagram-offer-signals.png` });
    }
  });
});
