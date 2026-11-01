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

  test("polish · no two visible labels overlap in any camera view", async ({ page }) => {
    await openWorld(page);
    for (const view of ["world", "berlin", "ana", "orbit"] as const) {
      await page.getByTestId(`world-view-${view}`).click();
      await page.waitForTimeout(2500);
      const overlaps = await page.evaluate(() => {
        const rs = [...document.querySelectorAll<HTMLElement>(".world-label:not(.is-hidden)")].map((el) => ({ text: el.textContent ?? "", r: el.getBoundingClientRect() }));
        const out: string[] = [];
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i];
            const b = rs[j];
            if (!a || !b) continue;
            if (a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1) out.push(`${a.text} × ${b.text}`);
          }
        return { out, shown: rs.length };
      });
      expect(overlaps.out, `overlapping labels in view ${view}`).toEqual([]);
      expect(overlaps.shown, `view ${view} still shows labels`).toBeGreaterThan(0);
    }
  });

  test("polish · the orbit label counts the posts that are actually in the orbit", async ({ page }) => {
    await openWorld(page);
    const posts = await page.getByTestId("world-canvas").getAttribute("data-posts");
    await page.getByTestId("world-view-orbit").click();
    await expect(page.locator(".world-label", { hasText: "Instagram orbit" })).toContainText(`${posts} posts`);
  });

  test("polish · pointing at the stage marks the orbit paused, leaving marks it running again", async ({ page }) => {
    await openWorld(page);
    const canvas = page.getByTestId("world-canvas");
    await expect(canvas).toHaveAttribute("data-orbit", "running");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(canvas).toHaveAttribute("data-orbit", "paused");
    await page.mouse.move(box.x + box.width + 40, box.y - 40);
    await expect(canvas).toHaveAttribute("data-orbit", "running");
  });

  test("look · Ana follows her newest post and the team can pick a look and a colour", async ({ page }) => {
    await openWorld(page);
    const canvas = page.getByTestId("world-canvas");
    const before = await (await page.request.get("/api/world")).json();
    // the synthetic newest post names no look and the e2e server has no vision model
    expect(before.world.ana_look).toMatchObject({ look: "everyday", look_source: "default", color_source: "default", image_reader: "off" });
    await expect(canvas).toHaveAttribute("data-ana-look", "everyday");
    await page.getByTestId("world-view-ana").click();
    await page.locator(".world-label.person", { hasText: /^Ana/ }).click();
    const look = page.getByTestId("world-look");
    await expect(look).toBeVisible();
    await expect(page.getByTestId("world-look-now")).toHaveAttribute("data-source", "default");
    await look.getByTestId("world-look-pick-scooter").click();
    await expect(page.getByTestId("world-look-save")).toHaveAttribute("data-state", "saved");
    await expect(canvas).toHaveAttribute("data-ana-look", "scooter");
    await expect(page.getByTestId("world-look-now")).toHaveAttribute("data-source", "manual");
    await expect(page.getByTestId("world-look-pick-scooter")).toHaveAttribute("aria-checked", "true");
    await look.getByTestId("world-look-color-d8566f").click();
    await expect(page.getByTestId("world-look-color")).toHaveAttribute("data-source", "manual");
    const after = await (await page.request.get("/api/world")).json();
    expect(after.world.ana_look).toMatchObject({ look: "scooter", look_source: "manual", color_source: "manual", colors: { primary: 0xd8566f } });
    // depending on the time in the test region she rides or sleeps; both are the scooter look
    await expect(canvas).toHaveAttribute("data-ana-pose", /^(riding|sleeping)$/);
    await look.getByTestId("world-look-pick-auto").click();
    await look.getByTestId("world-look-color-auto").click();
    await expect(canvas).toHaveAttribute("data-ana-look", "everyday");
  });

  test("look · the pick endpoint refuses cross-site requests and unknown looks", async ({ page }) => {
    const cross = await page.request.post("/api/world/look", { data: { look: "mermaid", color: "auto" }, headers: { "sec-fetch-site": "cross-site" } });
    expect(cross.status()).toBe(403);
    const bad = await page.request.post("/api/world/look", { data: { look: "dragon", color: "auto" } });
    expect(bad.status()).toBe(400);
    const badColor = await page.request.post("/api/world/look", { data: { look: "mermaid", color: "javascript:alert(1)" } });
    expect(badColor.status()).toBe(400);
  });

  test("clocks · Berlin and Ana's place show their local time", async ({ page }) => {
    await openWorld(page);
    const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const now = (tz: string) => minutes(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()));
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b)) <= 1;
    for (const [name, tz] of [["Berlin office", "Europe/Berlin"], ["Testregion", "Africa/Nairobi"]] as const) {
      const sub = page.locator(".world-label:not(.person)", { hasText: name }).locator("small");
      await expect(sub).toHaveText(/^\d\d:\d\d$/);
      expect(near(minutes((await sub.textContent()) ?? ""), now(tz)), `${name} shows the time in ${tz}`).toBe(true);
    }
  });

  test("selection · clicking a country in the panel opens its numbers", async ({ page }) => {
    await openWorld(page);
    await page.getByTestId("world-audience-country").getByRole("button", { name: "Spain" }).click();
    await expect(page.getByTestId("world-tab-selection")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Spain");
    await expect(page.getByRole("tabpanel")).toContainText("220");
  });
});
