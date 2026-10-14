/**
 * ANA-38 — Instagram cockpit end to end through the production build, the server-side Social BFF and a local fake
 * Instagram worker (synthetic data only). Expected values come from e2e/fake-social/core.mjs.
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
  });

  test("pattern observations carry sample, formula, comparator, sources, counterexamples and limits", async ({ page }) => {
    await openCockpit(page);
    const winner = page.getByTestId("observation-hidden-winner");
    await expect(winner).toHaveAttribute("data-state", "OBSERVED");
    await expect(winner).toContainText("median of 18 mature reel posts");
    await expect(winner).toContainText("(saves + shares) ÷ reach ÷ median");
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
    await expect(inspection).toContainText("Supporting posts");
    await expect(inspection).toContainText("Contradicting posts");
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

  test("German locale translates the cockpit", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("ana.locale", "de"));
    await openCockpit(page);
    await expect(page.getByRole("heading", { name: "Neueste Inhalte" })).toBeVisible();
    await expect(page.getByTestId("coverage-retrieved")).toHaveText("28 von 212 Beiträgen abgerufen");
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

test.describe("Instagram cockpit — mobile 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("single column, ranked list instead of the scatter, no horizontal scroll, inspector inside the viewport", async ({ page }) => {
    await openCockpit(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId("content-map").locator("svg")).toBeHidden();
    await expect(page.getByRole("list", { name: "Ranked by reach index" })).toBeVisible();
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
});
