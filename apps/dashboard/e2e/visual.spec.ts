/**
 * Viewport layout checks + human-inspectable evidence at 1440×900, 1280×800 and 1024×768.
 * Screenshots go to test-results by default; set EVIDENCE_DIR to write the evidence set.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, type FakeJiraControl } from "./fixtures";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

const SHOTS: {
  name: string;
  route: string;
  locale?: "de" | "it";
  jira?: (jira: FakeJiraControl) => Promise<void>;
  prepare?: (page: Page) => Promise<void>;
  /** checks against the fake Jira that the shot shows the state it claims */
  verify?: (jira: FakeJiraControl) => Promise<void>;
}[] = [
  { name: "now", route: "/" },
  { name: "now-lens-work", route: "/", prepare: async (page) => page.getByTestId("context-work").click() },
  { name: "board", route: "/board" },
  {
    name: "board-move-pending",
    route: "/board",
    jira: (jira) => jira.fault({ op: "transition", mode: "commit-then-delay", ms: 1_200 }),
    prepare: async (page) => {
      await page.locator('[data-ticket-id="ANA-904"]').focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.locator('[data-ticket-id="ANA-904"][data-pending]')).toBeVisible();
    },
  },
  {
    name: "board-move-confirmed",
    route: "/board",
    prepare: async (page) => {
      await page.locator('[data-ticket-id="ANA-904"]').focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.getByTestId("toast")).toContainText("confirmed by Jira");
    },
  },
  {
    name: "board-move-blocked",
    route: "/board",
    jira: (jira) => jira.fault({ op: "transitions", mode: "drop-transition", toStatusId: "10216" }),
    prepare: async (page) => {
      await page.locator('[data-ticket-id="ANA-904"]').focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.getByTestId("move-failure")).toBeVisible();
    },
  },
  { name: "board-review-unmapped", route: "/board", jira: (jira) => jira.board({ withReview: false }) },
  { name: "board-connector-blocked", route: "/board", jira: (jira) => jira.fault({ op: "board", mode: "status", status: 401 }) },
  { name: "backlog", route: "/backlog" },
  { name: "backlog-add-idea", route: "/backlog", prepare: async (page) => page.getByTestId("add-idea").click() },
  {
    name: "backlog-idea-created",
    route: "/backlog",
    prepare: async (page) => {
      await page.getByTestId("add-idea").click();
      await page.getByTestId("idea-input").fill(`Try a shared weekly review (${page.viewportSize()!.width})`);
      await page.getByTestId("idea-submit").click();
      await expect(page.getByTestId("idea-created")).toBeVisible();
    },
  },
  {
    name: "backlog-idea-unknown",
    route: "/backlog",
    jira: async (jira) => {
      await jira.searchLag(600_000);
      await jira.fault({ op: "create", mode: "commit-then-delay", ms: 2_500 });
    },
    prepare: async (page) => {
      await page.getByTestId("add-idea").click();
      // each viewport has its own idea: the server's ledger outlives the per-test fake reset
      await page.getByTestId("idea-input").fill(`Outcome not confirmed by Jira (${page.viewportSize()!.width})`);
      await page.getByTestId("idea-submit").click();
      await expect(page.getByTestId("idea-failure")).toHaveAttribute("data-state", "UNKNOWN", { timeout: 15_000 });
    },
    // the UNKNOWN on screen comes from one unanswered create, not from joining an earlier request
    verify: async (jira) => expect((await jira.state()).creates).toBe(1),
  },
  { name: "session-transcript", route: "/sessions/working-session-01?tab=transcript" },
  {
    name: "brain-selected",
    route: "/brain?node=workshop-02",
  },
  { name: "whiteboard", route: "/whiteboard" },
  { name: "calendar", route: "/calendar" },
  { name: "pulse", route: "/pulse" },
  { name: "vault", route: "/vault" },
  { name: "sessions", route: "/sessions" },
  { name: "toolbox", route: "/toolbox" },
  { name: "de-now", route: "/", locale: "de" },
  { name: "it-board", route: "/board", locale: "it" },
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
      test(`${shot.name}: no overlap, no horizontal scroll, rail visible`, async ({ page, jira }, info) => {
        if (shot.jira) await shot.jira(jira);
        await page.emulateMedia({ reducedMotion: "reduce" });
        if (shot.locale) await page.addInitScript((locale) => window.localStorage.setItem("ana.locale", locale), shot.locale);
        await page.goto(shot.route);
        await page.waitForLoadState("networkidle");
        if (shot.prepare) await shot.prepare(page);
        await page.waitForTimeout(400);
        expect(await layoutProblems(page)).toEqual([]);
        if (shot.verify) await shot.verify(jira);
        const dir = process.env.EVIDENCE_DIR;
        const file = `${viewport.width}x${viewport.height}-${shot.name}.png`;
        await page.screenshot({ path: dir ? path.join(dir, file) : info.outputPath(file) });
      });
    }
  });
}
