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
        cases: [{ brand: "Test Brand", results: [{ label: "Bookings", value: "+40%" }] }],
        packages: [{ name: "One Reel", price: "from €1" }],
        addons: [{ name: "Usage rights", price: "+20–50 %" }],
      }),
    );
    await page.goto("/kit");
    await expect(page.getByTestId("kit-tagline")).toHaveText("A test line");
    await expect(page.getByTestId("kit-proof")).toContainText("Test Brand");
    await expect(page.getByTestId("kit-packages")).toContainText("from €1");
    await expect(page.getByTestId("kit-addons")).toContainText("Usage rights");
    await expect(page.getByTestId("kit-cta").getByRole("link")).toHaveAttribute("href", "mailto:e2e@example.invalid");
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

  test("AC5 · 390 px: no horizontal overflow; reduced motion shows the final numbers", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kit?for=asia");
    await page.locator('html[data-ready="true"]').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // the page clips sideways overflow, so check that nothing is cut off at the edge either
    const cut = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="kit"] *'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5) && !el.closest("[class*=srOnly]");
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
    const tile = page.getByTestId("kit-tile-reach").locator("[data-final]");
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toHaveText("48.2K", { timeout: 5_000 });
    await expect(page.getByTestId("kit-numbers")).not.toHaveAttribute("data-reveal", "wait");
  });
});
