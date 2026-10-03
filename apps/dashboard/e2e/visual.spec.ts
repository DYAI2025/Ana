/**
 * Viewport layout checks + human-inspectable evidence at 1440×900, 1280×800 and 1024×768.
 * Screenshots go to test-results by default; set EVIDENCE_DIR to write the evidence set.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

const SHOTS: { name: string; route: string; prepare?: (page: Page) => Promise<void> }[] = [
  { name: "now", route: "/" },
  { name: "now-lens-work", route: "/", prepare: async (page) => page.getByTestId("context-work").click() },
  { name: "board", route: "/board" },
  { name: "backlog-add-idea", route: "/backlog", prepare: async (page) => page.getByTestId("add-idea").click() },
  { name: "session-transcript", route: "/sessions/working-session-01?tab=transcript" },
  {
    name: "brain-selected",
    route: "/brain?node=workshop-02",
  },
  { name: "whiteboard", route: "/whiteboard" },
  { name: "calendar", route: "/calendar" },
  { name: "pulse", route: "/pulse" },
  { name: "toolbox", route: "/toolbox" },
];

interface Rect {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`horizontal scroll: ${document.documentElement.scrollWidth} > ${vw}`);
    const rect = (el: Element, name: string): Rect => {
      const r = el.getBoundingClientRect();
      return { name, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const overlap = (a: Rect, b: Rect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const rail = document.querySelector('nav[aria-label]');
    if (rail) {
      const r = rail.getBoundingClientRect();
      if (r.top < 0 || r.bottom > vh || r.left < 0) problems.push(`rail outside viewport: ${JSON.stringify(r)}`);
      const main = document.querySelector("main")!.getBoundingClientRect();
      if (r.right > main.left) problems.push(`rail overlaps main content (${r.right} > ${main.left})`);
    }
    const groups: Element[][] = [
      Array.from(document.querySelectorAll('[data-testid^="context-"]:not([data-testid="context-lens"])')),
      Array.from(document.querySelectorAll('[data-testid="topbar-actions"] > *')),
      Array.from(document.querySelectorAll('[data-testid^="column-"]')),
      Array.from(document.querySelectorAll('[data-testid^="tool-"]')),
    ];
    for (const els of groups) {
      const rects = els.map((el, i) => rect(el, el.getAttribute("data-testid") ?? `${el.tagName}#${i}`)).filter((r) => r.right > r.left);
      for (let i = 0; i < rects.length; i += 1)
        for (let j = i + 1; j < rects.length; j += 1) if (overlap(rects[i]!, rects[j]!)) problems.push(`overlap: ${rects[i]!.name} × ${rects[j]!.name}`);
    }
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const d = dialog.getBoundingClientRect();
      if (d.left < 0 || d.top < 0 || d.right > vw || d.bottom > vh) problems.push(`dialog clipped by viewport: ${JSON.stringify(d)}`);
    }
    return problems;
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    for (const shot of SHOTS) {
      test(`${shot.name}: no overlap, no horizontal scroll, rail visible`, async ({ page }, info) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(shot.route);
        await page.waitForLoadState("networkidle");
        if (shot.prepare) await shot.prepare(page);
        await page.waitForTimeout(400);
        expect(await layoutProblems(page)).toEqual([]);
        const dir = process.env.EVIDENCE_DIR;
        const file = `${viewport.width}x${viewport.height}-${shot.name}.png`;
        await page.screenshot({ path: dir ? path.join(dir, file) : info.outputPath(file) });
      });
    }
  });
}
