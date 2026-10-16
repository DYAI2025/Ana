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
  /** index of the scope selector the text sits in (scoped measurements only) */
  within?: number;
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

interface Scope {
  /** measure only text inside one of these selectors (a focused check of one surface) */
  within?: string[];
  /** drop text boxes under fixed chrome (the phone-width bottom nav): that text is covered, not shown */
  skipFixedChrome?: boolean;
  /** collects the indexes of the `within` selectors that had measured text, so a sweep cannot pass empty */
  seen?: Set<number>;
}

async function collectRuns(page: Page, scope: Scope = {}): Promise<Run[]> {
  return page.evaluate(({ within, skipFixedChrome }) => {
    const dialog = document.querySelector('[role="dialog"]');
    // decorative full-viewport layers (atmosphere, grain: pointer-events none, viewport minus any scrollbar) are
    // backgrounds, not chrome
    const { clientWidth, clientHeight } = document.documentElement;
    const chrome = (skipFixedChrome ? Array.from(document.querySelectorAll("body *")) : [])
      .filter((e) => {
        const s = getComputedStyle(e);
        return s.position === "fixed" && s.pointerEvents !== "none" && s.display !== "none" && s.visibility !== "hidden";
      })
      .map((e) => ({ el: e, r: e.getBoundingClientRect() }))
      .filter((c) => c.r.width > 0 && c.r.height > 0 && !(c.r.width >= clientWidth && c.r.height >= clientHeight));
    const runs: Run[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      const el = node.parentElement;
      if (!text || !el) continue;
      const scopeIndex = within ? within.findIndex((s) => el.closest(s)) : -1;
      if (within && scopeIndex < 0) continue;
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
        .filter((r) => !chrome.some((c) => !c.el.contains(el) && r.left < c.r.right && r.right > c.r.left && r.top < c.r.bottom && r.bottom > c.r.top))
        .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
      if (rects.length === 0) continue;
      const m = style.color.match(/[\d.]+/g)!.map(Number);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      // effective opacity of ancestors (e.g. dimmed calendar days) multiplies the text alpha
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
      runs.push({ text: text.slice(0, 40), ...(within ? { within: scopeIndex } : {}), color: [m[0]!, m[1]!, m[2]!, (m[3] ?? 1) * opacity], large: size >= 24 || (size >= 18.66 && bold), rects });
    }
    return runs;
  }, { within: scope.within, skipFixedChrome: scope.skipFixedChrome ?? false }) as Promise<Run[]>;
}

async function measure(page: Page, label: string, scope: Scope = {}): Promise<string[]> {
  await page.waitForTimeout(450);
  const runs = await collectRuns(page, scope);
  for (const run of runs) if (run.within !== undefined) scope.seen?.add(run.within);
  const hide = await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; } ::placeholder { color: transparent !important; }" });
  await page.waitForTimeout(80);
  const png = PNG.sync.read(await page.screenshot());
  // text visible again, so a scroll sweep can measure its next position (and never reads the hidden colours)
  await hide.evaluate((node) => (node as Element).remove());
  await page.waitForFunction(() => getComputedStyle(document.body).color !== "rgba(0, 0, 0, 0)");
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

const STATES: { label: string; route: string; jira?: Record<string, unknown>; social?: Record<string, unknown>; prepare?: (page: Page) => Promise<unknown> }[] = [
  { label: "now", route: "/" },
  { label: "lens work", route: "/", prepare: (p) => p.getByTestId("context-work").click() },
  { label: "lens session", route: "/", prepare: (p) => p.getByTestId("context-session").click() },
  { label: "lens knowledge", route: "/", prepare: (p) => p.getByTestId("context-knowledge").click() },
  { label: "lens business", route: "/", prepare: (p) => p.getByTestId("context-business").click() },
  { label: "search", route: "/", prepare: async (p) => { await p.getByTestId("search-open").click(); await p.getByTestId("search-input").fill("workshop"); } },
  { label: "board", route: "/board" },
  { label: "backlog form", route: "/backlog", prepare: (p) => p.getByTestId("add-idea").click() },
  { label: "backlog idea created", route: "/backlog", prepare: async (p) => { await p.getByTestId("add-idea").click(); await p.getByTestId("idea-input").fill("Contrast check idea"); await p.getByTestId("idea-submit").click(); await p.getByTestId("idea-created").waitFor(); } },
  { label: "backlog idea rejected", route: "/backlog", jira: { op: "create", mode: "status", status: 400 }, prepare: async (p) => { await p.getByTestId("add-idea").click(); await p.getByTestId("idea-input").fill("Rejected"); await p.getByTestId("idea-submit").click(); await p.getByTestId("idea-failure").waitFor(); } },
  { label: "board move blocked", route: "/board", jira: { op: "transitions", mode: "drop-transition", toStatusId: "10216" }, prepare: async (p) => { await p.locator('[data-ticket-id="ANA-904"]').focus(); await p.keyboard.press("Shift+ArrowRight"); await p.getByTestId("move-failure").waitFor(); } },
  { label: "board connector unknown", route: "/board", jira: { op: "board", mode: "network" }, prepare: (p) => p.getByTestId("work-failure").waitFor() },
  { label: "sessions", route: "/sessions" },
  { label: "session watch", route: "/sessions/working-session-01" },
  { label: "session summary", route: "/sessions/working-session-01?tab=summary" },
  { label: "session transcript", route: "/sessions/working-session-01?tab=transcript" },
  { label: "session json", route: "/sessions/working-session-01?tab=json" },
  { label: "brain", route: "/brain?node=workshop-02" },
  { label: "whiteboard", route: "/whiteboard" },
  { label: "calendar form", route: "/calendar", prepare: (p) => p.getByTestId("cal-add").click() },
  { label: "pulse", route: "/pulse" },
  { label: "instagram cockpit", route: "/pulse/social/instagram", prepare: (p) => p.getByTestId("hero").waitFor() },
  { label: "instagram row detail", route: "/pulse/social/instagram", prepare: async (p) => { await p.locator('[data-media-id="syn004"]').getByTestId("row-toggle").click(); await p.getByTestId("row-detail").waitFor(); } },
  { label: "instagram offer signals", route: "/pulse/social/instagram", prepare: async (p) => { await p.getByTestId("tab-offers").click(); await p.getByTestId("inspect-hypothesis-H1").click(); await p.getByTestId("inspection-H1").waitFor(); } },
  { label: "instagram inspector", route: "/pulse/social/instagram", prepare: async (p) => { await p.getByTestId("inspect-hero").click(); await p.getByTestId("metric-inspector").waitFor(); } },
  { label: "instagram permission required", route: "/pulse/social/instagram", social: { status: 409, error: "reauth-required" }, prepare: (p) => p.getByTestId("cockpit-failure").waitFor() },
  { label: "vault", route: "/vault" },
  { label: "toolbox", route: "/toolbox?tool=jira" },
];

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  test.describe(`contrast ${viewport.width}`, () => {
    test.use({ viewport });
    for (const state of STATES) {
      test(`text contrast >= WCAG AA: ${state.label}`, async ({ page, jira, social }) => {
        if (state.jira) await jira.fault(state.jira);
        if (state.social) await social.fault(state.social);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(state.route);
        await page.waitForLoadState("networkidle");
        if (state.prepare) await state.prepare(page);
        expect(await measure(page, state.label)).toEqual([]);
      });
    }
  });
}

/**
 * ANA-39 AC6 at phone width. Below 391px the nav becomes a fixed bottom bar and the dusk atmosphere stays fixed
 * behind translucent glass, so the background behind a note changes as the page scrolls: each surface ANA-39 added
 * is swept through the viewport and measured at every step (text under the fixed nav is covered, not shown).
 * Scoped on purpose to the evidence blocks ANA-39 introduced: older cockpit text has its own pre-existing
 * phone-width findings, which must neither hide nor excuse a regression here.
 */
const MOBILE_ANA39: { label: string; within: string[]; prepare: (page: Page) => Promise<unknown> }[] = [
  {
    label: "instagram row detail topical fit",
    within: ['[data-testid="topical-fit"]'],
    prepare: async (p) => {
      await p.locator('[data-media-id="syn004"]').getByTestId("row-toggle").click();
      await p.getByTestId("topical-fit").waitFor();
    },
  },
  {
    label: "instagram offer signals H1 evidence",
    within: ['[data-testid^="lane-H1-"]', '[data-testid="decision-H1"]', '[data-testid="inspection-H1"]', '[data-testid="engagement-comparison"]'],
    prepare: async (p) => {
      await p.getByTestId("tab-offers").click();
      await p.getByTestId("inspect-hypothesis-H1").click();
      await p.getByTestId("inspection-H1").waitFor();
    },
  },
  {
    label: "instagram offer signals H4 evidence",
    within: ['[data-testid^="lane-H4-"]', '[data-testid="decision-H4"]', '[data-testid="inspection-H4"]'],
    prepare: async (p) => {
      await p.getByTestId("tab-offers").click();
      await p.getByTestId("inspect-hypothesis-H4").click();
      await p.getByTestId("inspection-H4").waitFor();
    },
  },
];

test.describe("contrast 390 · ANA-39 evidence blocks", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const state of MOBILE_ANA39) {
    test(`text contrast >= WCAG AA while scrolling: ${state.label}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/pulse/social/instagram");
      await page.waitForLoadState("networkidle");
      await state.prepare(page);
      const span = await page.evaluate((within) => {
        const boxes = within.flatMap((s) => Array.from(document.querySelectorAll(s))).map((e) => e.getBoundingClientRect());
        return { top: Math.min(...boxes.map((b) => b.top)) + scrollY, bottom: Math.max(...boxes.map((b) => b.bottom)) + scrollY, max: document.documentElement.scrollHeight - innerHeight };
      }, state.within);
      expect(span.bottom, "surface rendered").toBeGreaterThan(span.top);
      // worst failing position per text, so a red run names each failing note once
      const worst = new Map<string, { ratio: number; failure: string }>();
      const seen = new Set<number>();
      // from the surface's top entering at the bottom edge until its bottom leaves at the top edge
      for (let y = Math.max(0, span.top - 844); y <= Math.min(span.max, span.bottom); y += 40) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        for (const failure of await measure(page, `${state.label} @${y}`, { within: state.within, skipFixedChrome: true, seen })) {
          const text = failure.slice(failure.indexOf('"'), failure.lastIndexOf('"') + 1);
          const ratio = parseFloat(failure.slice(failure.lastIndexOf('"') + 1));
          const seen = worst.get(text);
          if (!seen || ratio < seen.ratio) worst.set(text, { ratio, failure });
        }
      }
      expect(state.within.filter((_, i) => !seen.has(i)), "every surface had measured text").toEqual([]);
      expect([...worst.values()].map((w) => w.failure)).toEqual([]);
    });
  }
});
