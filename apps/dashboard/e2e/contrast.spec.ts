/**
 * Pixel-measured text contrast on the real rendered glass (axe cannot judge text over gradients/blur).
 * Method: record every visible text run with its colour, hide all text, screenshot, then compare the text
 * colour against the worst-case background pixel inside the run's own boxes (brightest pixel for light text,
 * darkest for dark text). WCAG 1.4.3: 4.5:1, or 3:1 for large text (>= 24px, or >= 18.66px bold).
 */
import type { Page } from "@playwright/test";
import { PNG } from "pngjs";
import { expect, test } from "./fixtures";

interface Run {
  text: string;
  color: [number, number, number, number];
  large: boolean;
  rects: { x: number; y: number; w: number; h: number }[];
}

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function collectRuns(page: Page): Promise<Run[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const runs: Run[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      const el = node.parentElement;
      if (!text || !el) continue;
      if (!/[\p{L}\p{N}]/u.test(text)) continue; // punctuation-only decoration is exempt (WCAG 1.4.3)
      if (el.closest(".visually-hidden, script, style, noscript, option, canvas, [hidden]")) continue;
      if (dialog && !dialog.contains(el)) continue; // background content is inert while a modal is open
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      // clip to every ancestor that hides overflow (ellipsis chips, scroll lists) so we only sample what is visible
      const clips: DOMRect[] = [];
      for (let a: Element | null = el; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") clips.push(a.getBoundingClientRect());
      }
      const clip = (r: DOMRect) => {
        let { left, top, right, bottom } = r;
        for (const c of clips) {
          left = Math.max(left, c.left);
          top = Math.max(top, c.top);
          right = Math.min(right, c.right);
          bottom = Math.min(bottom, c.bottom);
        }
        return new DOMRect(left, top, right - left, bottom - top);
      };
      const rects = Array.from(range.getClientRects())
        .map(clip)
        .filter((r) => r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth)
        .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
      if (rects.length === 0) continue;
      const m = style.color.match(/[\d.]+/g)!.map(Number);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      // effective opacity of ancestors (e.g. dimmed calendar days) multiplies the text alpha
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
      runs.push({ text: text.slice(0, 40), color: [m[0]!, m[1]!, m[2]!, (m[3] ?? 1) * opacity], large: size >= 24 || (size >= 18.66 && bold), rects });
    }
    return runs;
  }) as Promise<Run[]>;
}

async function measure(page: Page, label: string): Promise<string[]> {
  await page.waitForTimeout(450);
  const runs = await collectRuns(page);
  await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; } ::placeholder { color: transparent !important; }" });
  await page.waitForTimeout(80);
  const png = PNG.sync.read(await page.screenshot());
  const scale = png.width / page.viewportSize()!.width;
  const failures: string[] = [];
  for (const run of runs) {
    let worst = Infinity;
    for (const rect of run.rects) {
      let maxL = -1;
      let minL = 2;
      let maxPx: number[] = [];
      let minPx: number[] = [];
      for (let y = Math.max(0, Math.floor(rect.y * scale)); y < Math.min(png.height, Math.ceil((rect.y + rect.h) * scale)); y += 1) {
        for (let x = Math.max(0, Math.floor(rect.x * scale)); x < Math.min(png.width, Math.ceil((rect.x + rect.w) * scale)); x += 1) {
          const i = (y * png.width + x) * 4;
          const px = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
          const lum = luminance(px[0]!, px[1]!, px[2]!);
          if (lum > maxL) [maxL, maxPx] = [lum, px];
          if (lum < minL) [minL, minPx] = [lum, px];
        }
      }
      if (maxL < 0) continue;
      const [r, g, b, a] = run.color;
      const textLum = luminance(r, g, b);
      // light text is threatened by the brightest background pixel, dark text by the darkest
      const bg = textLum >= (maxL + minL) / 2 ? maxPx : minPx;
      const blended = [r, g, b].map((c, k) => c * a + bg[k]! * (1 - a)) as [number, number, number];
      worst = Math.min(worst, ratio(luminance(...blended), luminance(bg[0]!, bg[1]!, bg[2]!)));
    }
    const need = run.large ? 3 : 4.5;
    if (worst < need) failures.push(`${label} · "${run.text}" ${worst.toFixed(2)}:1 < ${need}`);
  }
  return failures;
}

const STATES: { label: string; route: string; prepare?: (page: Page) => Promise<unknown> }[] = [
  { label: "now", route: "/" },
  { label: "lens work", route: "/", prepare: (p) => p.getByTestId("context-work").click() },
  { label: "lens session", route: "/", prepare: (p) => p.getByTestId("context-session").click() },
  { label: "lens knowledge", route: "/", prepare: (p) => p.getByTestId("context-knowledge").click() },
  { label: "lens business", route: "/", prepare: (p) => p.getByTestId("context-business").click() },
  { label: "search", route: "/", prepare: async (p) => { await p.getByTestId("search-open").click(); await p.getByTestId("search-input").fill("workshop"); } },
  { label: "board", route: "/board" },
  { label: "backlog form", route: "/backlog", prepare: (p) => p.getByTestId("add-idea").click() },
  { label: "sessions", route: "/sessions" },
  { label: "session watch", route: "/sessions/working-session-01" },
  { label: "session summary", route: "/sessions/working-session-01?tab=summary" },
  { label: "session transcript", route: "/sessions/working-session-01?tab=transcript" },
  { label: "session json", route: "/sessions/working-session-01?tab=json" },
  { label: "brain", route: "/brain?node=workshop-02" },
  { label: "whiteboard", route: "/whiteboard" },
  { label: "calendar form", route: "/calendar", prepare: (p) => p.getByTestId("cal-add").click() },
  { label: "pulse", route: "/pulse" },
  { label: "vault", route: "/vault" },
  { label: "toolbox", route: "/toolbox?tool=jira" },
];

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test.describe(`contrast ${viewport.width}`, () => {
    test.use({ viewport });
    for (const state of STATES) {
      test(`text contrast >= WCAG AA: ${state.label}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(state.route);
        await page.waitForLoadState("networkidle");
        if (state.prepare) await state.prepare(page);
        expect(await measure(page, state.label)).toEqual([]);
      });
    }
  });
}
