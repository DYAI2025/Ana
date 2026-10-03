/** Accessibility, motion and honesty checks across every route. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

const ROUTES = ["/", "/board", "/backlog", "/sessions", "/sessions/working-session-01", "/brain", "/whiteboard", "/calendar", "/pulse", "/vault", "/toolbox"];

for (const route of ROUTES) {
  test(`axe: no serious or critical WCAG A/AA violations on ${route}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(blocking).toEqual([]);
  });
}

test("every route is reachable from the rail and marks itself current", async ({ page }) => {
  await page.goto("/");
  for (const view of ["now", "board", "sessions", "brain", "whiteboard", "calendar", "pulse", "vault", "toolbox"]) {
    await page.getByTestId(`nav-${view}`).click();
    await expect(page.getByTestId(`nav-${view}`)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("keyboard focus is visible (outline) on rail, buttons and context objects", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); // skip link
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const outline = async () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
  await page.keyboard.press("Tab"); // ANA mark
  await page.keyboard.press("Tab"); // first rail item
  await expect(page.getByTestId("nav-now")).toBeFocused();
  expect(await outline()).toMatchObject({ style: "solid" });
  expect((await outline()).width).toBeGreaterThanOrEqual(2);
  await page.getByTestId("context-work").focus();
  expect((await outline()).style).toBe("solid");
});

test("prefers-reduced-motion: no auto-rotation and near-instant transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/brain");
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "false");
  const canvas = page.getByTestId("brain-canvas");
  await expect(canvas).toHaveAttribute("data-idle", "true");
  const yaw = await canvas.getAttribute("data-yaw");
  await page.waitForTimeout(600);
  await expect(canvas).toHaveAttribute("data-yaw", yaw!);

  await page.goto("/");
  await page.getByTestId("context-work").click();
  const duration = await page.getByRole("dialog").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(duration).toBeLessThan(0.01);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("without reduced motion the Brain auto-rotates and the lens animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/brain");
  const canvas = page.getByTestId("brain-canvas");
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "true");
  const yaw = Number(await canvas.getAttribute("data-yaw"));
  await expect.poll(async () => Number(await canvas.getAttribute("data-yaw"))).toBeGreaterThan(yaw + 0.02);
  await page.goto("/");
  await page.getByTestId("context-work").click();
  const duration = await page.getByRole("dialog").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(duration).toBeGreaterThan(0.2);
});

test("status meaning is carried by text and icon, not colour alone", async ({ page }) => {
  await page.goto("/pulse");
  const chips = page.locator('[data-status="not-connected"]');
  expect(await chips.count()).toBeGreaterThanOrEqual(4);
  for (const chip of await chips.all()) {
    await expect(chip).toHaveText(/\S/);
    await expect(chip.locator("svg")).toHaveCount(1);
  }
  await page.goto("/board");
  for (const ticket of await page.getByTestId("ticket").all()) {
    await expect(ticket).toContainText(/Ana|Ben|Vince/);
  }
});

test("prototype state resets on reload (nothing is persisted except language)", async ({ page }) => {
  await page.goto("/backlog");
  const count = await page.getByTestId("backlog-item").count();
  await page.getByTestId("add-idea").click();
  await page.getByTestId("idea-input").fill("Temporary idea");
  await page.getByTestId("idea-submit").click();
  await expect(page.getByTestId("backlog-item")).toHaveCount(count + 1);
  await page.reload();
  await expect(page.getByTestId("backlog-item")).toHaveCount(count);
  const stored = await page.evaluate(() => Object.keys(window.localStorage));
  expect(stored.filter((k) => k !== "ana.locale")).toEqual([]);
});
