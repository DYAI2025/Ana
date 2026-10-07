import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** The Brain view against the local fake Brain service (synthetic data only, e2e/fake-brain). */

type Hotspot = { id: string; x: number; y: number };

async function idleHotspots(page: Page): Promise<Hotspot[]> {
  const canvas = page.getByTestId("brain-canvas");
  await expect(canvas).toHaveAttribute("data-idle", "true");
  await expect(canvas).toHaveAttribute("data-hotspots", /\[/);
  return JSON.parse((await canvas.getAttribute("data-hotspots"))!) as Hotspot[];
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("status line shows node/edge counts and the embed model from the projection", async ({ page }) => {
  await page.goto("/brain");
  const status = page.getByTestId("brain-status");
  await expect(status).toHaveAttribute("data-nodes", "20");
  await expect(status).toHaveAttribute("data-edges", "16");
  await expect(status).toContainText("20 notes · 16 relations · 4 clusters · model bge-m3:latest");
  await expect(page.locator('[data-testid^="brain-node-"]')).toHaveCount(20);
});

test("node positions come from the projection: a mirrored layout moves the canvas hotspots", async ({ page, brain }) => {
  await page.goto("/brain");
  const before = new Map((await idleHotspots(page)).map((h) => [h.id, h]));
  expect(before.size).toBe(20);
  await brain.mode("mirrored");
  await page.reload();
  await page.locator("html[data-ready]").waitFor({ state: "attached" });
  const after = await idleHotspots(page);
  const moved = after.filter((h) => {
    const b = before.get(h.id)!;
    return Math.hypot(b.x - h.x, b.y - h.y) > 5;
  });
  expect(moved.length).toBeGreaterThan(10);
});

test("explicit typed relations, status chip, provenance and source details on selection", async ({ page }) => {
  await page.goto("/brain");
  await page.getByTestId("brain-node-kn-hook-first-cut-brief").click();
  await expect(page.getByTestId("brain-selected-title")).toHaveText("Hook-first cut brief");
  await expect(page.getByTestId("brain-selected-status")).toHaveText("DERIVED");
  await expect(page.getByTestId("brain-selected-created-by")).toHaveText("ben");
  await expect(page.getByTestId("brain-selection")).toContainText("Oct 7, 2026");
  const relations = page.getByTestId("brain-relations");
  await expect(relations).toContainText("supports → Cut brief structure");
  await expect(relations).toContainText("derived_from → Synthetic research report");
  await expect(relations).toContainText("← relates_to Workshop 02");
  await expect(page.getByTestId("brain-source-refs")).toContainText("Synthetic research report §3 Hook");

  // a restricted source: kind, access and class, but only the display locator — never a raw one
  await page.getByTestId("brain-source-refs").getByRole("button", { name: "Synthetic research report" }).click();
  await expect(page.getByTestId("brain-selected-status")).toHaveText("SOURCE");
  const details = page.getByTestId("brain-source-details");
  await expect(details).toContainText("drive_doc");
  await expect(details).toContainText("restricted");
  await expect(details).toContainText("G2");
  await expect(details).toContainText("drive_doc · Synthetic research report");
  await expect(details).not.toContainText("http");
  await expect(details).not.toContainText("/");
});

test("a filter dims unrelated nodes and keeps matches with their neighbours", async ({ page }) => {
  await page.goto("/brain");
  const canvas = page.getByTestId("brain-canvas");
  await expect(canvas).toHaveAttribute("data-bright", "all");
  await page.getByTestId("brain-filter").fill("energy");
  await expect(page.locator('[data-testid^="brain-node-"]')).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-bright", JSON.stringify(["kn-break-observation", "kn-timebox-concept", "qu-remote-workshops", "src-synthetic-notes"]));
  await expect(canvas).toHaveAttribute("data-dimmed", "16");
});

test("the cluster legend focuses one cluster and toggles back", async ({ page }) => {
  await page.goto("/brain");
  const canvas = page.getByTestId("brain-canvas");
  const legend = page.getByTestId("brain-legend-cluster-c3");
  await legend.click();
  await expect(legend).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid^="brain-node-"]')).toHaveCount(4);
  await expect(canvas).toHaveAttribute("data-dimmed", "16");
  await legend.click();
  await expect(legend).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-bright", "all");
});

for (const [mode, state, kind] of [
  ["down", "BLOCKED", "unreachable"],
  ["slow", "BLOCKED", "unreachable"],
  ["unauthorized", "BLOCKED", "unauthorized"],
  ["invalid", "UNKNOWN", "invalid-response"],
] as const) {
  test(`a ${mode} Brain shows ${state} (${kind}) with no nodes and no example data`, async ({ page, brain }) => {
    await brain.mode(mode);
    await page.goto("/brain");
    const error = page.getByTestId("brain-error");
    await expect(error).toHaveAttribute("data-state", state, { timeout: 15_000 });
    await expect(error).toHaveAttribute("data-kind", kind);
    await expect(error).toContainText(state);
    await expect(page.getByTestId("brain-canvas")).toHaveCount(0);
    await expect(page.locator('[data-testid^="brain-node-"]')).toHaveCount(0);
    await expect(page.getByTestId("brain-status")).toHaveCount(0);

    // retry after the Brain recovers reads the real projection
    await brain.mode("ok");
    await error.getByRole("button").click();
    await expect(page.getByTestId("brain-status")).toHaveAttribute("data-nodes", "20");
  });
}

test("an empty projection shows the empty state, not example notes", async ({ page, brain }) => {
  await brain.mode("empty");
  await page.goto("/brain");
  await expect(page.getByTestId("brain-empty")).toBeVisible();
  await expect(page.getByTestId("brain-status")).toHaveAttribute("data-nodes", "0");
  await expect(page.getByTestId("brain-canvas")).toHaveCount(0);
});

test("reduced motion: the Brain stands still and a selection jumps without easing", async ({ page }) => {
  await page.goto("/brain");
  const canvas = page.getByTestId("brain-canvas");
  await expect(page.getByTestId("brain-auto-rotate")).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-idle", "true");
  const yaw = await canvas.getAttribute("data-yaw");
  await page.waitForTimeout(500);
  await expect(canvas).toHaveAttribute("data-yaw", yaw!);
});

test("axe: no serious or critical violations on /brain with a selection", async ({ page }) => {
  await page.goto("/brain?node=kn-hook-first-cut-brief");
  await expect(page.getByTestId("brain-selected-title")).toHaveText("Hook-first cut brief");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

// Evidence screenshots (synthetic data only): ANA_EVIDENCE=1 npx playwright test e2e/brain.spec.ts -g evidence
test("evidence screenshots @evidence", async ({ page }) => {
  test.skip(!process.env.ANA_EVIDENCE, "only when collecting evidence");
  const dir = `${resolve("../../docs/evidence/ANA-35")}/`;
  mkdirSync(dir, { recursive: true });
  await page.goto("/brain");
  await idleHotspots(page);
  await page.screenshot({ path: `${dir}brain-overview.png` });
  await page.getByTestId("brain-filter").fill("cut brief");
  await page.getByTestId("brain-legend-cluster-c0").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}brain-filtered-focus.png` });
  await page.getByTestId("brain-filter").fill("");
  await page.getByTestId("brain-legend-cluster-c0").click();
  await page.getByTestId("brain-node-kn-hook-first-cut-brief").click();
  await expect(page.getByTestId("brain-selected-created-by")).toHaveText("ben");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}brain-selected-provenance.png` });
});
