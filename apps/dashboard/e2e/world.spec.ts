/**
 * ANA-48 — the 3D world end to end through the production build, /api/world and the local fake worker (synthetic data
 * only, see e2e/fake-social/core.mjs). WebGL runs in headless Chromium (SwiftShader).
 */
import type { Page } from "@playwright/test";
import { PNG } from "pngjs";
import { expect, FAKE_BRAIN, FAKE_SOCIAL, test } from "./fixtures";

async function resetWorld(page: Page, world: Record<string, unknown> = {}) {
  expect((await page.request.post(`${FAKE_SOCIAL}/__fake/world`, { data: world })).ok()).toBe(true);
  expect((await page.request.get("/api/world?__reset")).status()).toBe(204);
}

async function openWorld(page: Page) {
  await page.goto("/world");
  await page.locator('[data-testid="world-canvas"][data-ready="true"]').waitFor({ timeout: 20_000 });
}

/** "What works" lives in the "What's hot" tab */
async function openHot(page: Page) {
  await openWorld(page);
  await page.getByTestId("world-tab-hot").click();
  // "What works" in full sits behind "All categories in detail"
  await page.getByTestId("world-works-more").locator("summary").click();
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
    // the last 7 days lead: four countries, Spain's share rising against the 30 days
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-arcs", "4");
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-rising", "1");
    await expect(page.getByTestId("world-kpi-followers")).toContainText("12,400");
    const countries = page.getByTestId("world-audience-country");
    await expect(countries).toContainText("Spain");
    await expect(countries).toContainText("150");
    await page.getByRole("button", { name: "Engaged · 30 days" }).click();
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-arcs", "5");
    await expect(page.getByTestId("world-canvas")).toHaveAttribute("data-rising", "0");
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

  test("who · age and gender of the whole account float on the stage, per layer, with the rising country marked", async ({ page }) => {
    await openWorld(page);
    const who = page.getByTestId("world-who");
    // 7 days: no combined answer → age bands and a gender split
    await expect(who).toHaveAttribute("data-mode", "split");
    await expect(who).toContainText("Who engaged · 7 days");
    await expect(who).toContainText("25-34");
    await expect(who).toContainText("Women 64 %");
    await expect(who).toContainText("Not stated 3 %");
    await expect(who).toContainText("not per country");
    await expect(page.locator(".world-label.country-up")).toContainText("▲ 22 pts");
    // 30 days: Meta answered age×gender together → a pyramid
    await page.getByRole("button", { name: "Engaged · 30 days" }).click();
    await expect(who).toHaveAttribute("data-mode", "pyramid");
    await expect(who).toContainText("Who engaged · 30 days");
    await page.getByRole("button", { name: "Followers", exact: true }).click();
    await expect(who).toContainText("Who follows");
    await expect(page.getByTestId("world-history")).toContainText(/daily snapshot|No daily snapshots/);
  });

  test("works · the panel shows engagement per kind of post; without a model key the categories say they are off", async ({ page }) => {
    await openHot(page);
    const works = page.getByTestId("world-works");
    await expect(works).toContainText("What works");
    await expect(works).toContainText("Post categories are off");
    // format comes from Meta, not from the model: shown even without categories
    await expect(page.getByTestId("world-works-format")).toContainText(/n=\d+/);
    await expect(page.getByTestId("world-works-theme")).toHaveCount(0);
    const body = await (await page.request.get("/api/world")).json();
    expect(body.world.post_tags).toEqual({ state: "off", tags: {} });
  });

  test("works · top posts and the posts behind a value light up in the orbit and open their numbers", async ({ page }) => {
    await openHot(page);
    const canvas = page.getByTestId("world-canvas");
    const top = page.getByTestId("world-works-top");
    await expect(top.locator("li")).toHaveCount(5);
    await expect(top).toContainText("Open on Instagram");
    await top.getByRole("button", { name: "Show them in the orbit" }).click();
    await expect(canvas).toHaveAttribute("data-highlight", "5");
    await expect(top).toContainText("(5 of 5 in the orbit)");
    await top.getByRole("button", { name: "Show them in the orbit" }).click();
    await expect(canvas).toHaveAttribute("data-highlight", "none");
    // a value of a category: its posts are listed and lit
    await page.getByTestId("world-works-format").getByRole("button", { name: "Reel" }).click();
    const list = page.getByTestId("world-works-posts");
    await expect(list).toContainText(/\d+ posts: Reel \(\d+ of \d+ in the orbit\)/);
    const n = await list.locator("li").count();
    expect(n).toBeGreaterThan(0);
    await expect(canvas).not.toHaveAttribute("data-highlight", "none");
    // a post in the list opens its numbers
    await list.locator("li").first().locator("button").first().click();
    await expect(page.getByTestId("world-post")).toBeVisible();
  });

  test("works · ranking by saves + shares (the Substack hint) relabels the top posts, the counts and the note", async ({ page }) => {
    await openHot(page);
    const top = page.getByTestId("world-works-top");
    await expect(top).toContainText("Top posts (engagement rate)");
    await page.getByTestId("world-works-rate").getByRole("button", { name: "Saves + shares" }).click();
    await expect(top).toContainText("Top posts (saves + shares)");
    await expect(page.getByTestId("world-works")).toContainText("Substack");
    await expect(page.getByTestId("world-works")).toContainText("Median save+share rate");
    await expect(page.getByTestId("world-works")).not.toContainText("Median engagement rate");
    await expect(top.locator("li").first()).toContainText(/saves\+shares \d/);
    await top.locator("li").first().locator("button").first().click();
    await expect(page.getByTestId("world-post-ssr")).toContainText("Saves + shares:");
  });

  test("hot · the tab shows where the community moves, posts of the week light up, and the day goes into the Brain", async ({ page }) => {
    await openWorld(page);
    const tab = page.getByTestId("world-tab-hot");
    await expect(tab).toHaveText("🔥 What's hot");
    // a country is rising in the synthetic week: the tab carries its live dot
    await expect(tab).toHaveAttribute("data-moving", "true");
    // keyboard: from "Now" the arrow key reaches the tab (only the selected tab is in the Tab order)
    await page.getByTestId("world-tab-now").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("world-tab-now")).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Engaged · 30 days" }).click();
    await tab.click();
    // movement is week against month: the globe switches to the week
    await expect(page.getByRole("button", { name: "Engaged · 7 days" })).toHaveAttribute("aria-pressed", "true");
    const hot = page.getByTestId("world-hot");
    // "What matters for the business": the market split is computed without a model; the brief needs the model key
    // plain words first: one sentence, a legend that says what each market is; the source behind "Why?"
    const markets = page.getByTestId("world-brief-markets");
    await expect(markets).toContainText(/\d+ % of this week's reactions come from top markets/);
    await expect(page.getByTestId("world-brief-legend")).toContainText("Top markets");
    await expect(page.getByTestId("world-brief-legend")).toContainText("Countries brands pay the most for");
    await expect(page.getByTestId("world-brief-legend")).toContainText("Low-cost markets");
    await expect(markets.getByText("ASO.dev", { exact: false })).toBeHidden();
    await markets.locator("summary").click();
    await expect(markets.getByText("ASO.dev", { exact: false })).toBeVisible();
    // what runs well / what holds back: always both headings, plain sentences
    await expect(page.getByTestId("world-signals-good")).toContainText("Working well now");
    await expect(page.getByTestId("world-signals-slow")).toContainText("Holding back now");
    await expect(page.getByTestId("world-brief-button")).toBeDisabled();
    await expect(page.getByTestId("world-brief-state")).toHaveAttribute("data-state", "off");
    const off = await page.request.post("/api/world/brief", { data: {}, headers: { "content-type": "application/json" } });
    expect(off.status()).toBe(409);
    expect((await page.request.post("/api/world/brief", { data: "x", headers: { "content-type": "text/plain" } })).status()).toBe(415);
    await expect(page.getByTestId("world-hot-rising").locator("li").first()).toContainText(/\+\d+(\.\d)? pts/);
    await expect(page.getByTestId("world-hot-who")).toContainText(/largest group \d/);
    await expect(hot).toContainText("Correlation only");
    await expect(page.getByTestId("world-works")).toBeHidden();
    await page.getByTestId("world-works-more").locator("summary").click();
    await expect(page.getByTestId("world-works")).toBeVisible();
    // the "Now" tab no longer carries "What works"
    await page.getByTestId("world-tab-now").click();
    await expect(page.getByTestId("world-works")).toHaveCount(0);
    await page.getByTestId("world-tab-hot").click();
    // a rising country opens its numbers
    await page.getByTestId("world-hot-rising").locator("li").first().getByRole("button").click();
    await expect(page.getByTestId("world-tab-selection")).toHaveAttribute("aria-selected", "true");
    // the writer ran on the first read: once a Berlin day, DERIVED, never CONFIRMED, never a caption
    await expect
      .poll(async () => ((await (await page.request.get(`${FAKE_BRAIN}/__fake/mcp-calls`)).json()) as { calls: Array<{ name: string }> }).calls.some((c) => c.name === "brain_append_observation"), { timeout: 15_000 })
      .toBe(true);
    const { calls } = (await (await page.request.get(`${FAKE_BRAIN}/__fake/mcp-calls`)).json()) as { calls: Array<{ name: string; args: Record<string, unknown> }> };
    const names = new Set(calls.map((c) => c.name));
    expect([...names].sort()).toEqual(["brain_append_observation", "brain_create_note", "brain_get", "brain_register_source"]);
    const obs = calls.filter((c) => c.name === "brain_append_observation");
    expect(obs.every((c) => c.args.status === "DERIVED" && /^kn-world-pulse-\d{4}-w\d{2}$/.test(String(c.args.id)))).toBe(true);
    expect(String(obs.at(-1)?.args.text)).toContain("Engagement 7 T nach Land");
    const all = JSON.stringify(calls);
    expect(all).not.toMatch(/CONFIRMED|supersedes|"confirm"/);
    // captions of the synthetic posts never leave the dashboard
    const posts = ((await (await page.request.get("/api/world")).json()) as { world: { instagram: { snapshot?: { posts: Array<{ caption: string | null }> } } } }).world.instagram.snapshot?.posts ?? [];
    for (const p of posts) if (p.caption && p.caption.length > 12) expect(all).not.toContain(p.caption);
    // the panel says so
    await page.reload();
    await page.locator('[data-testid="world-canvas"][data-ready="true"]').waitFor({ timeout: 20_000 });
    await page.getByTestId("world-tab-hot").click();
    await expect(page.getByTestId("world-hot-brain")).toHaveAttribute("data-state", "on");
    await expect(page.getByTestId("world-hot-brain")).toContainText(/Last written: \d{4}-\d{2}-\d{2}/);
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
    // four views with a 2.5 s settle each under software WebGL: about 20 s on CI
    test.setTimeout(60_000);
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
    // several saves, world reads and 3D rebuilds under software WebGL: about 29 s on CI, so the default 30 s is too tight
    test.setTimeout(90_000);
    // reduced motion: the camera jumps to Ana and she does not bob, so her label is a still click target
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorld(page);
    const canvas = page.getByTestId("world-canvas");
    const before = await (await page.request.get("/api/world")).json();
    // the synthetic newest post names no look and the e2e server has no vision model
    expect(before.world.ana_look).toMatchObject({ look: "everyday", look_source: "default", color_source: "default", image_reader: "off" });
    await expect(canvas).toHaveAttribute("data-ana-look", "everyday");
    await page.getByTestId("world-view-ana").click();
    const anaLabel = page.locator(".world-label.person", { hasText: /^Ana/ });
    await expect(anaLabel).not.toHaveClass(/is-hidden/);
    await anaLabel.click();
    const look = page.getByTestId("world-look");
    await expect(look).toBeVisible();
    await expect(page.getByTestId("world-look-now")).toHaveAttribute("data-source", "default");
    // by day a random activity every 20 minutes, from the clock
    await expect(page.getByTestId("world-activity-now")).toHaveAttribute("data-source", "rotation");
    await expect(canvas).toHaveAttribute("data-ana-activity", /^(scooter|eating|selfie|dancing|reading)$/);
    // the team picks an activity: it replaces the rotation
    await look.getByTestId("world-activity-pick-dancing").click();
    await expect(page.getByTestId("world-look-save")).toHaveAttribute("data-state", "saved");
    await expect(look.getByTestId("world-activity-pick-dancing")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("world-activity-now")).toHaveAttribute("data-source", "manual");
    await expect(canvas).toHaveAttribute("data-ana-activity", "dancing");
    // depending on the time in the test region she dances or sleeps
    await expect(canvas).toHaveAttribute("data-ana-pose", /^(dancing|sleeping)$/);
    // the outfit and its colour, keeping the activity just picked
    await look.getByTestId("world-look-pick-mermaid").click();
    await expect(look.getByTestId("world-look-pick-mermaid")).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-ana-look", "mermaid");
    await look.getByTestId("world-look-color-d8566f").click();
    await expect(page.getByTestId("world-look-color")).toHaveAttribute("data-source", "manual");
    await expect(look.getByTestId("world-activity-pick-dancing")).toHaveAttribute("aria-checked", "true");
    const after = await (await page.request.get("/api/world")).json();
    expect(after.world.ana_look).toMatchObject({ look: "mermaid", look_source: "manual", color_source: "manual", colors: { primary: 0xd8566f }, manual: { activity: "dancing" } });
    // back to automatic, one part after the other: each click keeps the parts already picked
    await look.getByTestId("world-activity-pick-auto").click();
    await expect(look.getByTestId("world-activity-pick-auto")).toHaveAttribute("aria-checked", "true");
    await look.getByTestId("world-look-pick-auto").click();
    await expect(look.getByTestId("world-look-pick-auto")).toHaveAttribute("aria-checked", "true");
    await look.getByTestId("world-look-color-auto").click();
    await expect(look.getByTestId("world-look-color-auto")).toHaveAttribute("aria-checked", "true");
    await expect(look.getByTestId("world-activity-pick-auto")).toHaveAttribute("aria-checked", "true");
    await expect(canvas).toHaveAttribute("data-ana-look", "everyday");
    await expect(page.getByTestId("world-activity-now")).toHaveAttribute("data-source", "rotation");
  });

  test("look · the pick endpoint refuses cross-site requests and unknown looks", async ({ page }) => {
    const cross = await page.request.post("/api/world/look", { data: { look: "mermaid", color: "auto" }, headers: { "sec-fetch-site": "cross-site" } });
    expect(cross.status()).toBe(403);
    const bad = await page.request.post("/api/world/look", { data: { look: "dragon", color: "auto" } });
    expect(bad.status()).toBe(400);
    const badColor = await page.request.post("/api/world/look", { data: { look: "mermaid", color: "javascript:alert(1)" } });
    expect(badColor.status()).toBe(400);
    const badActivity = await page.request.post("/api/world/look", { data: { look: "auto", color: "auto", activity: "skydiving" } });
    expect(badActivity.status()).toBe(400);
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

  test("berlin day · Ben and Vince follow the Berlin clock: awake by day, asleep from midnight to 7", async ({ page }) => {
    test.setTimeout(60_000);
    // 10:01 in Berlin (CET)
    await page.clock.setFixedTime(new Date("2026-11-03T09:01:00Z"));
    await openWorld(page);
    const canvas = page.getByTestId("world-canvas");
    await expect(canvas).toHaveAttribute("data-ben-activity", /^(laptop|wine|ai)$/);
    await expect(canvas).toHaveAttribute("data-vince-activity", /^(phone|computer|gym)$/);
    const ben = await canvas.getAttribute("data-ben-activity");
    await page.getByTestId("world-view-berlin").click();
    await page.locator(".world-label.person", { hasText: /^Ben/ }).dispatchEvent("click");
    await expect(page.getByTestId("world-ben-day")).toHaveAttribute("data-activity", ben ?? "");
    // 02:30 in Berlin
    await page.clock.setFixedTime(new Date("2026-11-03T01:30:00Z"));
    await page.reload();
    await page.locator('[data-testid="world-canvas"][data-ready="true"]').waitFor({ timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-ben-activity", "sleeping");
    await expect(canvas).toHaveAttribute("data-vince-activity", "sleeping");
  });

  test("selection · clicking a country in the panel opens its numbers", async ({ page }) => {
    await openWorld(page);
    await page.getByTestId("world-audience-country").getByRole("button", { name: "Spain" }).click();
    await expect(page.getByTestId("world-tab-selection")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Spain");
    await expect(page.getByRole("tabpanel")).toContainText("220");
  });
});
