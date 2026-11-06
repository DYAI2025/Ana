/**
 * ANA-53 — the media kit through the production build, the world service and the local fake worker (synthetic data
 * only, e2e/fake-social/core.mjs). media-kit.json is written to the e2e state directory (WORLD_STATE_DIR) and removed.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, FAKE_SOCIAL, test } from "./fixtures";

const STATE_DIR = path.join(process.cwd(), "test-results/.world-state");
const KIT_FILE = path.join(STATE_DIR, "media-kit.json");

async function resetWorld(page: Page) {
  expect((await page.request.post(`${FAKE_SOCIAL}/__fake/world`, { data: {} })).ok()).toBe(true);
  expect((await page.request.get("/api/world?__reset")).status()).toBe(204);
}

test.describe("ANA-53 · media kit", () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "writes media-kit.json into the e2e server's state directory");
  test.beforeEach(async ({ page }) => {
    await rm(KIT_FILE, { force: true });
    await resetWorld(page);
  });
  test.afterAll(async () => {
    await rm(KIT_FILE, { force: true });
  });

  test("AC1 · a request the access check refuses gets no kit and no numbers", async ({ page }) => {
    const refused = await page.request.get("/kit", { headers: { host: "kit.attacker.example" } });
    // the proxy (src/proxy.ts) refuses first with 403; the page itself checks again and answers 404
    expect([403, 404]).toContain(refused.status());
    const body = await refused.text();
    expect(body).not.toContain("48.2K");
    expect(body).not.toContain('data-testid="kit"');
  });

  test("AC2/AC4 · live numbers, audience and Reels; nothing of Ana's content without media-kit.json; no dashboard shell", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kit");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ana Savu");
    // the fake reports 48,200 accounts reached; accounts engaged is unavailable and must not appear at all
    await expect(page.getByTestId("kit-tile-reach")).toContainText("48.2K");
    // the typical Reel comes before the best ones, with how many Reels it counts
    await expect(page.getByTestId("kit-typical")).toContainText(/median per Reel over \d+ Reels/);
    for (const id of ["kit-partners", "kit-hero-cta", "kit-reel-label"]) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId("kit-tile-engaged")).toHaveCount(0);
    await expect(page.getByTestId("kit-audience")).toBeVisible();
    await expect(page.getByTestId("kit-countries")).toContainText("Germany");
    expect(await page.getByTestId("kit-reel").count()).toBeGreaterThan(0);
    for (const id of ["kit-proof", "kit-packages", "kit-cta", "kit-tagline"]) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId("kit")).not.toContainText("—");
    // captions never reach the page, not even in the serialized data of the HTML
    const html = await (await page.request.get("/kit")).text();
    expect(html).not.toContain("airport tips");
    expect(html).not.toContain("Island trip vlog");
    await expect(page.getByTestId("nav-world")).toHaveCount(0);
    // a page for brands loads nothing of the dashboard: no Jira, no Brain, no world API (ANA-59)
    const calls: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/(work|brain|world|social)/.test(new URL(r.url()).pathname)) calls.push(r.url());
    });
    await page.reload();
    await page.locator('html[data-ready="true"]').waitFor();
    await page.waitForTimeout(1500);
    expect(calls).toEqual([]);
    // only the dashboard itself may frame its pages
    expect((await page.request.get("/kit")).headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
    await page.getByTestId("kit-hidden").locator("..").locator("summary").click();
    await expect(page.getByTestId("kit-hidden")).toContainText("Case studies");
  });

  test("AC2 · content from media-kit.json shows on the next view", async ({ page }) => {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(
      KIT_FILE,
      JSON.stringify({
        tagline: "A test line",
        contact: { email: "e2e@example.invalid", label: "Work with Ana" },
        partners: [{ name: "Test Partner", kind: "paid" }, { name: "Test Affiliate", kind: "affiliate", current: true }],
        cases: [{ brand: "Test Brand", results: [{ label: "Bookings", value: "+40%" }] }, { brand: "Test Unproven", role: "Filming" }],
        packages: [{ name: "One Reel", price: "from €1" }],
        addons: [{ name: "Usage rights", price: "+20–50 %" }],
      }),
    );
    await page.goto("/kit");
    await expect(page.getByTestId("kit-tagline")).toHaveText("A test line");
    await expect(page.getByTestId("kit-proof")).toContainText("Test Brand");
    await expect(page.getByTestId("kit-packages")).toContainText("from €1");
    await expect(page.getByTestId("kit-addons")).toContainText("Usage rights");
    const mailto = await page.getByTestId("kit-cta").getByRole("link").getAttribute("href");
    expect(mailto).toMatch(/^mailto:e2e@example\.invalid\?body=Brand%3A/);
    // one way to write, one button: the hero link leads down to it
    await expect(page.getByTestId("kit-hero-cta")).toHaveAttribute("href", "#kit-cta");
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(page.getByTestId("kit-partners")).toContainText("Test Partner");
    await expect(page.getByTestId("kit-partners")).toContainText("Paid partnership");
    await expect(page.getByTestId("kit-partners")).toContainText("Affiliate");
    await expect(page.getByTestId("kit-partners-current")).toContainText("Test Affiliate");
    await expect(page.getByTestId("kit-partners-past")).toContainText("Test Partner");
    // the case with results shows them; the one without says so
    await expect(page.getByTestId("kit-proof")).toContainText("+40%");
    await expect(page.getByTestId("kit-case-no-results")).toHaveText(["Collaboration · no published results"]);
  });

  test("AC3 · presets: asia highlights its markets, west leads with followers, unknown falls back", async ({ page }) => {
    await page.goto("/kit?for=west");
    await expect(page.getByTestId("kit")).toHaveAttribute("data-preset", "west");
    await expect(page.getByTestId("kit-audience")).toContainText("Followers");
    await expect(page.getByTestId("kit-focus")).toContainText("US, UK & Europe");
    // the fake's followers: Germany, the US and Spain, all in the preset's markets, by share and highlighted
    const focusRows = page.getByTestId("kit-countries-focus").locator("li");
    await expect(focusRows).toHaveText([/Germany/, /United States/, /Spain/]);
    await expect(page.getByTestId("kit-countries-focus").locator('li[data-focus="true"]')).toHaveCount(3);
    expect(await page.locator('[data-testid="kit-map"] g[data-focus="true"]').count()).toBeGreaterThan(0);
    await expect(page.getByTestId("kit-preset-west")).toHaveAttribute("aria-current", "page");
    // the audience comes before the numbers for a brand preset
    const order = await page.locator("main > section").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order.indexOf("kit-audience")).toBeLessThan(order.indexOf("kit-numbers"));

    await page.goto("/kit?for=asia");
    await expect(page.getByTestId("kit")).toHaveAttribute("data-preset", "asia");
    await expect(page.getByTestId("kit-audience")).toContainText("Engaged accounts");

    await page.goto("/kit?for=does-not-exist");
    await expect(page.getByTestId("kit")).toHaveAttribute("data-preset", "default");
  });

  test("AC5 · 350 px (phone, and the office frame on a phone): no horizontal overflow, even with long free text; reduced motion shows the final numbers", async ({ page }) => {
    const long = "Supercalifragilisticexpialidocious".repeat(4);
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(
      KIT_FILE,
      JSON.stringify({
        name: `Ana ${long}`,
        tagline: `A line ${long}`,
        contact: { email: "e2e@example.invalid", label: `Write ${long}` },
        cases: [{ brand: long, title: long, summary: long, results: [{ label: long, value: long.slice(0, 30) }] }],
        packages: [{ name: long, price: long.slice(0, 40), includes: [long], note: long }],
        addons: [{ name: long, price: long, note: long }],
      }),
    );
    // 350 px: the kit inside the office computer's frame on a phone is narrower than the phone
    await page.setViewportSize({ width: 350, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kit?for=asia");
    await page.locator('html[data-ready="true"]').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // the page clips sideways overflow, so check that nothing is cut off at the edge either
    const cut = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="kit"] *'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          // a box past the edge, or text running out of its own box
          const clipped = getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow === "ellipsis";
          return r.width > 0 && !el.closest("[class*=srOnly]") && (r.right > window.innerWidth + 0.5 || r.left < -0.5 || (!clipped && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0));
        })
        .map((el) => `${el.tagName}.${el.className}`.slice(0, 60)),
    );
    expect(cut).toEqual([]);
    await page.getByTestId("kit-reels").scrollIntoViewIfNeeded();
    const shown = await page.locator("[data-final]").evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("data-final")]));
    expect(shown.length).toBeGreaterThan(3);
    for (const [text, final] of shown) expect(text).toBe(final);
  });

  test("motion: a number below the fold counts up to its final value once seen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/kit");
    await page.locator('html[data-ready="true"]').waitFor();
    // never scrolled: a full-page screenshot or PDF shows every final number and no hidden section
    await page.waitForTimeout(300);
    const unscrolled = await page.locator("[data-final]").evaluateAll((els) => els.filter((e) => e.textContent !== e.getAttribute("data-final")).length);
    expect(unscrolled).toBe(0);
    await expect(page.locator('[data-reveal="wait"]')).toHaveCount(0);
    const tile = page.getByTestId("kit-tile-reach").locator("[data-final]");
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toHaveText("48.2K", { timeout: 5_000 });
    await expect(page.getByTestId("kit-numbers")).not.toHaveAttribute("data-reveal", "wait");
  });
});

/**
 * Public brand links: /kit/b/<token> answers without the dashboard login, everything else still needs it. In the e2e
 * build the gate is loopback mode, so a request with a foreign Host stands in for a visitor without a login (the
 * same refusal a request without a Cloudflare Access assertion gets in production).
 */
test.describe("media kit · public brand links", () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "writes kit-links.json into the e2e server's state directory");
  const LINKS = path.join(STATE_DIR, "kit-links.json");
  const OPENS = path.join(STATE_DIR, "kit-link-opens.json");
  const WEST = "W".repeat(19) + "e2eWestToken_-0123456789";
  const ASIA = "A".repeat(19) + "e2eAsiaToken_-0123456789";
  const OLD = "R".repeat(19) + "e2eRevokedTok_-012345678";
  const outside = { host: "kit.brand.example", "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15" };

  test.beforeEach(async ({ page }) => {
    for (const t of [WEST, ASIA, OLD]) expect(t).toHaveLength(43);
    await mkdir(STATE_DIR, { recursive: true });
    await rm(OPENS, { force: true });
    await writeFile(KIT_FILE, JSON.stringify({ contact: { email: "e2e@example.invalid", label: "Work with Ana" }, cases: [{ brand: "Case Brand", results: [{ label: "Bookings", value: "+1" }] }] }));
    await writeFile(
      LINKS,
      JSON.stringify({
        links: [
          { id: "west-1", token: WEST, preset: "west", label: "English-speaking markets" },
          { id: "asia-1", token: ASIA, preset: "asia", label: "Asia" },
          { id: "old-1", token: OLD, preset: "west", label: "Old", revoked: true },
        ],
      }),
    );
    await resetWorld(page);
  });
  test.afterAll(async () => {
    await Promise.all([rm(LINKS, { force: true }), rm(OPENS, { force: true }), rm(KIT_FILE, { force: true })]);
  });

  test("a valid link opens without the login; unknown and revoked ones are 404; the rest of the dashboard stays closed", async ({ page }) => {
    const west = await page.request.get(`/kit/b/${WEST}`, { headers: outside });
    expect(west.status()).toBe(200);
    const html = await west.text();
    expect(html).toContain('data-preset="west"');
    expect(html).toContain("Work with Ana");
    // a brand sees its kit only: no preview bar, no other presets, no case ids, no link list
    for (const absent of ['data-testid="kit-preview"', "Asia-Pacific", "Case ids", 'data-testid="kit-links"', ASIA, OLD]) expect(html).not.toContain(absent);
    // the token never leaves in a Referer; no index, no shared cache
    expect(west.headers()["referrer-policy"]).toBe("no-referrer");
    expect(west.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(west.headers()["cache-control"]).toContain("no-store");
    expect(html).toContain('data-preset="west"');
    // the page's own CSS and JS load without the login
    const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]!);
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets.slice(0, 5)) expect((await page.request.get(a, { headers: outside })).status(), a).toBe(200);

    expect((await page.request.get(`/kit/b/${ASIA}`, { headers: outside })).status()).toBe(200);
    for (const p of [`/kit/b/${OLD}`, `/kit/b/${"x".repeat(43)}`]) expect((await page.request.get(p, { headers: outside })).status(), p).toBe(404);
    // everything else still needs the login: the internal kit, the dashboard, every API, a path that only looks like a link
    for (const p of ["/kit", "/kit?for=west", "/", "/world", "/api/world", "/api/social/instagram", "/api/work", `/kit/b/${WEST}/x`, `/kit/b/${WEST.slice(0, 42)}`]) {
      expect([401, 403], p).toContain((await page.request.get(p, { headers: outside })).status());
    }
  });

  test("opens are counted: views apart from link previews; the team itself is not counted; the preview lists the links", async ({ page }) => {
    await page.request.get(`/kit/b/${WEST}`, { headers: outside });
    await page.request.get(`/kit/b/${WEST}`, { headers: { ...outside, "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" } });
    // the team opens the link through the dashboard (logged in): no count
    expect((await page.request.get(`/kit/b/${WEST}`)).status()).toBe(200);
    const opens = JSON.parse(await (await import("node:fs/promises")).readFile(OPENS, "utf8"));
    expect(opens["west-1"]).toMatchObject({ views: 1, previews: 1 });
    expect(opens["asia-1"]).toBeUndefined();

    await page.goto("/kit");
    await page.getByTestId("kit-links").locator("summary").click();
    await expect(page.getByTestId("kit-links").locator("summary")).toHaveText("Brand links (2)");
    await expect(page.getByTestId("kit-link-west-1")).toContainText(`/kit/b/${WEST}`);
    await expect(page.getByTestId("kit-link-west-1")).toContainText("1 view");
    await expect(page.getByTestId("kit-link-west-1")).toContainText("1 link preview");
    await expect(page.getByTestId("kit-link-old-1")).toContainText("revoked");
  });

  test("the brand page in a browser: styled, no dashboard calls, no preview bar", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (/\/api\//.test(new URL(r.url()).pathname)) calls.push(r.url());
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/kit/b/${ASIA}`);
    await page.locator('html[data-ready="true"]').waitFor();
    await expect(page.getByTestId("kit")).toHaveAttribute("data-preset", "asia");
    await expect(page.getByTestId("kit-preview")).toHaveCount(0);
    await expect(page.getByTestId("kit-banner")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(calls).toEqual([]);
  });
});
