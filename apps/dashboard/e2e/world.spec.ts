/**
 * ANA-48 — the 3D world end to end through the production build, /api/world and the local fake worker (synthetic data
 * only, see e2e/fake-social/core.mjs). WebGL runs in headless Chromium (SwiftShader).
 */
import type { Page } from "@playwright/test";
import { PNG } from "pngjs";
import { expect, FAKE_SOCIAL, test } from "./fixtures";

async function resetWorld(page: Page, world: Record<string, unknown> = {}) {
  expect((await page.request.post(`${FAKE_SOCIAL}/__fake/world`, { data: world })).ok()).toBe(true);
  expect((await page.request.get("/api/world?__reset")).status()).toBe(204);
}

async function openWorld(page: Page) {
  await page.goto("/world");
  await page.locator('[data-testid="world-canvas"][data-ready="true"]').waitFor({ timeout: 20_000 });
}

test.describe("ANA World — 3D view over real dashboard data", () => {
  test.beforeEach(async ({ page }) => {
    await resetWorld(page);
  });

  test("AC1 · the rail opens /world and the globe renders (non-blank canvas)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-world").click();
    await expect(page).toHaveURL(/\/world$/);
    await expect(page.getByTestId("nav-world")).toHaveAttribute("aria-current", "page");
    await page.locator('[data-testid="world-canvas"][data-ready="true"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const png = PNG.sync.read(await page.getByTestId("world-canvas").screenshot());
    const colours = new Set<number>();
    for (let i = 0; i < png.data.length; i += 4 * 97) colours.add(((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0));
    expect(colours.size, "the canvas shows a drawn scene, not one flat colour").toBeGreaterThan(40);
  });

  test("AC1 · the rail label is translated", async ({ page }) => {
    await page.goto("/world");
    await page.getByTestId("lang-de").click();
    await expect(page.getByTestId("nav-world")).toHaveAttribute("aria-label", "Welt");
    await page.getByTestId("lang-it").click();
    await expect(page.getByTestId("nav-world")).toHaveAttribute("aria-label", "Mondo");
  });

  test("AC3/AC4 · orbit and arcs come from /api/world; panel lists countries, cities and the aggregation note", async ({ page }) => {
    await openWorld(page);
    const body = await (await page.request.get("/api/world")).json();
    expect(body.ok).toBe(true);
    const posts = Math.min(30, body.world.instagram.snapshot.posts.length);
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-posts", String(posts));
    await expect(page.getByTestId("world-kpi-posts")).toContainText(String(posts));
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-arcs", "5");
    await expect(page.getByTestId("world-kpi-followers")).toContainText("12,400");
    const countries = page.getByTestId("world-audience-country");
    await expect(countries).toContainText("Germany");
    await expect(countries).toContainText("410");
    await expect(page.getByTestId("world-audience-city")).toContainText("Synthetic City A");
    await expect(page.getByText(/Meta does not say where a single like or comment came from/)).toBeVisible();
  });

  test("AC4 · unavailable audience is stated, never drawn", async ({ page }) => {
    await resetWorld(page, { audienceUnavailable: true });
    await openWorld(page);
    await expect(page.getByTestId("world-audience-country")).toContainText("Not available: meta-100");
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-arcs", "0");
  });

  test("AC5 · a real like increase between two pulse reads shows up in the feed", async ({ page }) => {
    await openWorld(page);
    await expect(page.getByTestId("world-pulse")).toHaveAttribute("data-state", "ok");
    expect((await page.request.post(`${FAKE_SOCIAL}/__fake/world`, { data: { likeBump: 3 } })).ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const feed = page.getByTestId("world-feed");
    await expect(feed).toContainText("+3 likes on", { timeout: 15_000 });
    await expect(feed).toContainText("+3 followers");
  });

  test("AC6 · not connected channels and missing sources are named", async ({ page }) => {
    await openWorld(page);
    for (const ch of ["Substack", "TikTok", "YouTube", "Facebook"]) await expect(page.locator("li", { hasText: ch }).first()).toContainText("not connected");
    await page.getByTestId("world-tab-sources").click();
    await expect(page.getByRole("tabpanel")).toContainText("Confluence");
    await expect(page.getByRole("tabpanel")).toContainText("No source exists yet.");
  });

  test("AC6 · a failing pulse is reported as such", async ({ page }) => {
    await resetWorld(page, { pulseStatus: 502 });
    await openWorld(page);
    await expect(page.getByTestId("world-pulse")).not.toHaveAttribute("data-state", "ok");
    await expect(page.getByTestId("world-pulse")).toContainText(/Pulse/);
  });

  test("AC7 · /api/world refuses cross-site reads", async ({ page }) => {
    const r = await page.request.get("/api/world", { headers: { "sec-fetch-site": "cross-site" } });
    expect(r.status()).toBe(403);
  });

  test("AC8 · without WebGL the data panel still works", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (this: HTMLCanvasElement, ...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("/world");
    await expect(page.getByTestId("world-no-webgl")).toBeVisible();
    await expect(page.getByTestId("world-kpi-followers")).toContainText("12,400");
  });

  test("AC8 · reduced motion still renders the world", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorld(page);
    await page.getByTestId("world-view-berlin").click();
    await expect(page.getByTestId("world-view-berlin")).toHaveAttribute("aria-pressed", "true");
  });

  test("AC9 · 390×844 without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorld(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("selection · clicking a country in the panel opens its numbers", async ({ page }) => {
    await openWorld(page);
    await page.getByTestId("world-audience-country").getByRole("button", { name: "Thailand" }).click();
    await expect(page.getByTestId("world-tab-selection")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Thailand");
    await expect(page.getByRole("tabpanel")).toContainText("220");
  });
});
