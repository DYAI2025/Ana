/**
 * LIVE acceptance of the ASADA Bright Silver release (ANA-42) against production, https://ana.dyai.cloud, behind
 * Cloudflare Access. Runs only by hand, read-only, never in CI.
 *
 * It needs a legitimate Access session: log in once in a headed Chromium (`npx playwright open https://ana.dyai.cloud`,
 * complete the Access one-time code, then save the storage state), and point LIVE_STORAGE_STATE at that file. The
 * file holds the session cookie, so it lives OUTSIDE the repository (next to LIVE_EVIDENCE_DIR) and is never committed.
 * Authentication is never bypassed: every page request below carries the real Access session, and the first check
 * proves that a request WITHOUT it is turned away.
 *
 * FAIL-CLOSED PRECONDITIONS (checked before any test; a missing one fails the whole run — it never skips to green):
 *   LIVE_BASE_URL      must be exactly https://ana.dyai.cloud (the production host under acceptance, no other target)
 *   LIVE_STORAGE_STATE must name a readable Playwright storage-state file outside the repository that holds an
 *                      unexpired Cloudflare Access cookie (CF_Authorization) for ana.dyai.cloud
 *   LIVE_EVIDENCE_DIR  must name a directory outside the repository (states and measurements only, no Instagram content)
 *   LIVE_ORIGIN_HOST   must be the public IP literal of the origin VPS (its ports are probed from the outside in P02)
 *
 *   LIVE_BASE_URL=https://ana.dyai.cloud LIVE_STORAGE_STATE=<file outside the repo> LIVE_EVIDENCE_DIR=<dir outside the repo> \
 *     LIVE_ORIGIN_HOST=<vps public ip> npx playwright test -c playwright.live.config.ts asada.live
 *
 * Results go to LIVE_EVIDENCE_DIR/asada-live-result.json (states and measurements only — no Instagram content).
 * When a precondition is missing the result file records `verdict: "BLOCKED"` with the failed precondition names.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

const REPO = path.resolve(__dirname, "../../..");
/** The one production host this acceptance is about; any other LIVE_BASE_URL is a wrong target, not a variant. */
const PRODUCTION = "https://ana.dyai.cloud";
const DIR = process.env.LIVE_EVIDENCE_DIR ? path.resolve(process.env.LIVE_EVIDENCE_DIR) : "";
const BASE = process.env.LIVE_BASE_URL ?? "";
const ORIGIN_HOST = process.env.LIVE_ORIGIN_HOST ?? "";
const TILE_ORDER = ["social", "initiatives", "sessions", "knowledge", "community"] as const;
const CHANNEL_ORDER = ["instagram", "substack", "tiktok", "youtube", "facebook"] as const;
const STATES = ["CONNECTED", "LOADING", "EMPTY", "STALE", "ERROR", "PERMISSION_REQUIRED"];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
const result: Record<string, unknown> = { base: BASE, startedAt: new Date().toISOString(), verdict: "BLOCKED", preconditionsFailed: ["not checked"] };

const settled = (page: Page) => page.locator('[data-testid="context-social"]:not([data-instagram="LOADING"])').waitFor({ timeout: 60_000 });
const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(DIR, `${name}.png`) });

/**
 * TCP probe of an origin port from the outside: the dashboard and tunnel ports must not accept connections.
 * Only an active refusal or a silent drop counts as closed; "no route" or any other error means the probe did not
 * reach the host under test and is reported as such (never as closed).
 */
function probe(host: string, port: number): Promise<"refused" | "timeout" | "open" | `unreachable:${string}`> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 4000 });
    socket.once("connect", () => (socket.destroy(), resolve("open")));
    socket.once("timeout", () => (socket.destroy(), resolve("timeout")));
    socket.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "ECONNREFUSED" ? "refused" : error.code === "ETIMEDOUT" ? "timeout" : `unreachable:${error.code ?? "unknown"}`));
  });
}

/** Every precondition that is not met, by name. Empty means the run may start. */
function failedPreconditions(): string[] {
  const failed: string[] = [];
  const outside = (p: string) => !(path.resolve(p).startsWith(REPO + path.sep) || path.resolve(p) === REPO);
  if (BASE !== PRODUCTION) failed.push(`LIVE_BASE_URL must be ${PRODUCTION} (got ${JSON.stringify(BASE)})`);
  if (!DIR) failed.push("LIVE_EVIDENCE_DIR is required");
  else if (!outside(DIR)) failed.push("LIVE_EVIDENCE_DIR must be outside the repository");
  const session = process.env.LIVE_STORAGE_STATE ?? "";
  if (!session) failed.push("LIVE_STORAGE_STATE (Access session, outside the repo) is required");
  else if (!outside(session)) failed.push("LIVE_STORAGE_STATE must be outside the repository");
  else if (!existsSync(session)) failed.push("LIVE_STORAGE_STATE file does not exist");
  else {
    // a legitimate Access session = an unexpired CF_Authorization cookie for the production host; nothing else is accepted
    let cookies: { name?: string; domain?: string; expires?: number }[] = [];
    try {
      cookies = (JSON.parse(readFileSync(session, "utf8")) as { cookies?: typeof cookies }).cookies ?? [];
    } catch {
      failed.push("LIVE_STORAGE_STATE is not a readable Playwright storage state");
    }
    const host = new URL(PRODUCTION).hostname;
    const access = cookies.filter((c) => c.name === "CF_Authorization" && (c.domain ?? "").replace(/^\./, "") === host);
    if (access.length === 0) failed.push(`LIVE_STORAGE_STATE holds no CF_Authorization cookie for ${host}`);
    else if (!access.some((c) => c.expires === undefined || c.expires === -1 || c.expires * 1000 > Date.now())) failed.push("the CF_Authorization cookie in LIVE_STORAGE_STATE has expired");
  }
  if (!ORIGIN_HOST) failed.push("LIVE_ORIGIN_HOST (public IP of the origin VPS) is required");
  else if (net.isIP(ORIGIN_HOST) === 0) failed.push("LIVE_ORIGIN_HOST must be an IP literal, not a name");
  return failed;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  const failed = failedPreconditions();
  result.preconditionsFailed = failed;
  result.originHost = ORIGIN_HOST;
  expect(failed, "live acceptance preconditions (BLOCKED, not a release verdict)").toEqual([]);
  result.verdict = "RUNNING";
});

const failedTests: string[] = [];
test.afterEach(({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) failedTests.push(`${testInfo.title}: ${testInfo.status}`);
});

test.afterAll(() => {
  result.finishedAt = new Date().toISOString();
  result.failedTests = failedTests;
  // the file carries a verdict only for a run whose preconditions held; a blocked run stays BLOCKED, never PASS
  if (result.verdict === "RUNNING") result.verdict = failedTests.length === 0 ? "PASS" : "FAIL";
  if (DIR) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path.join(DIR, "asada-live-result.json"), JSON.stringify(result, null, 2));
  }
});

test("P01 · without an Access session the origin is not served; with it the dashboard answers", async ({ page }) => {
  const anonymous = await playwrightRequest.newContext({ baseURL: BASE });
  const anon = await anonymous.get("/", { maxRedirects: 0 });
  const location = anon.headers()["location"] ?? "";
  result.anonymous = { status: anon.status(), location: location.replace(/\?.*$/, "") };
  expect([301, 302, 303, 307, 308, 401, 403]).toContain(anon.status());
  if (anon.status() < 400) expect(location).toMatch(/cloudflareaccess\.com/);
  await anonymous.dispose();

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await settled(page);
  await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
});

test("P02 · origin ports are closed from the outside (never skipped: LIVE_ORIGIN_HOST is a precondition)", async () => {
  const ports: Record<number, string> = {};
  for (const port of [3410, 3300, 3100, 20242]) ports[port] = await probe(ORIGIN_HOST, port);
  result.originPorts = ports;
  // "refused" (RST) or "timeout" (dropped) prove a closed port on a reachable host; anything else is not evidence
  for (const [port, state] of Object.entries(ports)) expect(["refused", "timeout"], `origin port ${port}`).toContain(state);
});

test("P03 · home: ASADA heading, decided tile order, Under Construction tiles without actions", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
  await expect(page).toHaveTitle(/ASADA/);
  for (const gone of ["See what already works", "Current focus", "ANA SAVU DASHBOARD"]) await expect(page.getByText(gone, { exact: false })).toHaveCount(0);
  await expect(page.getByTestId("prototype-flag")).toHaveCount(0);
  const titles = await Promise.all(TILE_ORDER.map((id) => page.getByTestId(`context-${id}`).locator("span").nth(1).innerText()));
  expect(titles).toEqual(["Social Media Business", "Initiatives & Progress", "Sessions & Workshops", "Knowledge & Resources", "Community & Relationships"]);
  for (const id of TILE_ORDER.slice(1)) {
    const tile = page.getByTestId(`context-${id}`);
    await expect(tile).toHaveAttribute("data-state", "under-construction");
    await expect(tile).toContainText("Under Construction");
    await expect(tile.locator("a, button, input, [tabindex], [role='button'], [role='link']")).toHaveCount(0);
    expect(await tile.innerText()).not.toMatch(/\d/);
  }
  await shot(page, "1440x900-live-asada-home");
});

test("P04 · the Social Media Business tile carries the real Instagram state and never says Live without CONNECTED", async ({ page, request }) => {
  await page.goto("/");
  await settled(page);
  const tile = page.getByTestId("context-social");
  const state = await tile.getAttribute("data-instagram");
  expect(STATES).toContain(state);
  const api = await request.get("/api/social/instagram");
  const body = await api.text();
  expect(body).not.toContain("access_token");
  const answer = JSON.parse(body) as { ok: boolean; stale?: boolean; failure?: { state?: string }; snapshot?: { posts: unknown[]; observed_at?: string } };
  const derived = !answer.ok ? (answer.failure?.state === "PERMISSION_REQUIRED" ? "PERMISSION_REQUIRED" : "ERROR") : answer.stale ? "STALE" : (answer.snapshot?.posts.length ?? 0) === 0 ? "EMPTY" : "CONNECTED";
  result.instagram = { tileState: state, apiState: derived, apiOk: answer.ok, observedAt: answer.snapshot?.observed_at ?? null, posts: answer.snapshot?.posts.length ?? 0 };
  expect(state).toBe(derived);
  if (state !== "CONNECTED") await expect(tile).not.toContainText(/\bConnected\b|\bLive\b/);
});

test("P05 · channel picker: order, only Instagram actionable, focus trap, Escape / X / backdrop, two interactions to the cockpit", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  const trigger = page.getByTestId("context-social");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Social Media Business");
  const names = await Promise.all(CHANNEL_ORDER.map((id) => page.getByTestId(`channel-${id}`).locator("span").nth(2).innerText()));
  expect(names).toEqual(["Instagram", "Substack", "TikTok", "YouTube", "Facebook"]);
  await expect(page.getByTestId("channel-instagram")).toHaveAttribute("href", "/pulse/social/instagram");
  await expect(dialog.locator("a")).toHaveCount(1);
  for (const id of CHANNEL_ORDER.slice(1)) await expect(page.getByTestId(`channel-${id}`)).toContainText("Under Construction");
  await expect(page.getByTestId("channel-instagram")).toBeFocused();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.getByTestId("channel-lens").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await shot(page, "1440x900-live-asada-channels");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByTestId("lens-close").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await trigger.click();
  await page.mouse.click(40, 860);
  await expect(page.getByRole("dialog")).toBeHidden();

  await trigger.click(); // 1
  await page.getByTestId("channel-instagram").click(); // 2
  await expect(page).toHaveURL(/\/pulse\/social\/instagram$/);
  await page.locator('[data-testid="instagram-cockpit"]:not([data-state="LOADING"])').waitFor({ timeout: 90_000 });
  result.cockpitState = await page.getByTestId("instagram-cockpit").getAttribute("data-state");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
});

for (const viewport of VIEWPORTS) {
  test(`P06 · ${viewport.width}×${viewport.height}: no overflow, tiles inside the viewport, picker inside the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settled(page);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    for (const id of TILE_ORDER) {
      const rect = (await page.getByTestId(`context-${id}`).boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    if (viewport.width >= 1024) {
      const social = (await page.getByTestId("context-social").boundingBox())!;
      expect(social.y + social.height).toBeLessThanOrEqual(viewport.height);
    }
    await shot(page, `${viewport.width}x${viewport.height}-live-asada-home`);
    await page.getByTestId("context-social").click();
    await page.getByTestId("channel-lens").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const lens = (await page.getByTestId("channel-lens").boundingBox())!;
    expect(lens.x).toBeGreaterThanOrEqual(0);
    expect(lens.x + lens.width).toBeLessThanOrEqual(viewport.width);
    expect(lens.y + lens.height).toBeLessThanOrEqual(viewport.height);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    await shot(page, `${viewport.width}x${viewport.height}-live-asada-channels`);
    await page.keyboard.press("Escape");
  });
}

test("P07 · 200 % zoom clips nothing on the home", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await page.evaluate(() => ((document.documentElement.style as unknown as { zoom: string }).zoom = "2"));
  await page.waitForTimeout(300);
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="context-"]')).flatMap((tile) =>
      Array.from(tile.querySelectorAll("span")).filter((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow === "hidden" && getComputedStyle(el).whiteSpace === "normal").map((el) => el.textContent),
    ),
  );
  expect(clipped).toEqual([]);
  await expect(page.getByTestId("asada-title")).toBeVisible();
  await shot(page, "1440x900-live-asada-home-zoom200");
});

test("P08 · reduced motion: picker opens and closes without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settled(page);
  await page.getByTestId("context-social").click();
  const duration = await page.getByRole("dialog").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(duration).toBeLessThan(0.01);
  await page.keyboard.press("Escape");
  expect(await page.locator('[role="dialog"]').count()).toBe(0);
});

test("P09 · DE / EN / IT on the home and in the picker", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await page.getByTestId("lang-de").click();
  await expect(page.getByTestId("context-initiatives")).toContainText("Initiativen & Fortschritt");
  await page.getByTestId("context-social").click();
  await expect(page.getByRole("dialog")).toContainText("Wähle einen Kanal");
  await shot(page, "1440x900-live-asada-channels-de");
  await page.keyboard.press("Escape");
  await page.getByTestId("lang-it").click();
  await expect(page.getByTestId("context-initiatives")).toContainText("Iniziative e progressi");
  await page.getByTestId("context-social").click();
  await expect(page.getByRole("dialog")).toContainText("Scegli un canale");
  await page.keyboard.press("Escape");
  await page.getByTestId("lang-en").click();
  await expect(page.getByTestId("context-initiatives")).toContainText("Initiatives & Progress");
});

test("P10 · keyboard only: Tab reaches the tile, Enter opens the picker with the Instagram row focused", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await page.getByTestId("context-social").focus();
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("channel-instagram")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("context-social")).toBeFocused();
});

test("P11 · the browser never talks to the worker and the health endpoint answers", async ({ page, request }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await settled(page);
  expect(requests.some((u) => u.includes("/internal/social-snapshot"))).toBe(false);
  expect(requests.every((u) => u.startsWith(BASE) || u.startsWith("data:") || u.startsWith("blob:"))).toBe(true);
  const health = await request.get("/api/healthz");
  result.healthz = health.status();
  expect(health.status()).toBe(200);
});
