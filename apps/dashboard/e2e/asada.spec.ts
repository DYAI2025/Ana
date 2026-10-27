/**
 * ANA-42 · ASADA Bright Silver — UI-01 (home) and UI-02 (Social Media Business channel picker).
 * One test per acceptance criterion of the refinement package (UI01-AC01…AC10, UI02-AC01…AC08), against the
 * production build with the fake Instagram worker. The live counterpart runs in e2e-live/asada.live.spec.ts.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const TILE_ORDER = ["social", "initiatives", "sessions", "knowledge", "community"] as const;
const CHANNEL_ORDER = ["instagram", "substack", "tiktok", "youtube", "facebook"] as const;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

const box = async (page: Page, testId: string) => {
  const rect = await page.getByTestId(testId).boundingBox();
  if (!rect) throw new Error(`${testId} has no box`);
  return rect;
};

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("UI-01 · ASADA home", () => {
  test("AC01 · the main heading is exactly ASADA; the focus sentence, Current Focus and the four stages are gone", async ({ page }) => {
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("ASADA");
    await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
    await expect(page).toHaveTitle(/ASADA/);
    await expect(page.getByTestId("topbar-actions").locator("..")).toContainText("ASADA");
    for (const gone of ["See what already works", "Current focus", "Reality", "Choose", "Act", "Close one meaningful loop", "ANA SAVU DASHBOARD"]) {
      await expect(page.getByText(gone, { exact: false })).toHaveCount(0);
    }
    // the home carries no prototype flag (it shows no prototype data)
    await expect(page.getByTestId("prototype-flag")).toHaveCount(0);
  });

  test("AC02 · tiles in the decided order, as one uniform column", async ({ page }) => {
    await page.goto("/");
    const titles = await Promise.all(TILE_ORDER.map((id) => page.getByTestId(`context-${id}`).locator("span").nth(1).innerText()));
    expect(titles).toEqual(["Social Media Business", "Initiatives & Progress", "Sessions & Workshops", "Knowledge & Resources", "Community & Relationships"]);
    const boxes = await Promise.all(TILE_ORDER.map((id) => box(page, `context-${id}`)));
    const [first] = boxes;
    boxes.forEach((rect, i) => {
      expect(Math.abs(rect.x - first!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(rect.width - first!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(rect.height - first!.height)).toBeLessThanOrEqual(1);
      if (i > 0) expect(rect.y).toBeGreaterThan(boxes[i - 1]!.y + boxes[i - 1]!.height);
    });
  });

  for (const viewport of VIEWPORTS.filter((v) => v.width >= 1024)) {
    test(`AC03 · ${viewport.width}×${viewport.height}: Social Media Business is visible without scrolling, carries the strongest title, keeps the card geometry`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const social = await box(page, "context-social");
      expect(social.y).toBeGreaterThanOrEqual(0);
      expect(social.y + social.height).toBeLessThanOrEqual(viewport.height);
      expect(social.width).toBeGreaterThanOrEqual(560);
      expect(social.width).toBeLessThanOrEqual(620);
      expect(social.height).toBeGreaterThanOrEqual(116);
      const weights = await Promise.all(
        TILE_ORDER.map((id) => page.getByTestId(`context-${id}`).locator("span").nth(1).evaluate((el) => [parseFloat(getComputedStyle(el).fontSize), parseFloat(getComputedStyle(el).fontWeight)])),
      );
      const [socialSize, socialWeight] = weights[0]!;
      for (const [size, weight] of weights.slice(1)) {
        expect(socialSize!).toBeGreaterThan(size!);
        expect(socialWeight!).toBeGreaterThan(weight!);
      }
      const family = await page.getByTestId("asada-title").evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family).toMatch(/Inter/);
    });
  }

  test("AC04 · the other tiles say Under Construction, are dimmed and offer no action or invented value", async ({ page }) => {
    await page.goto("/");
    for (const id of TILE_ORDER.slice(1)) {
      const tile = page.getByTestId(`context-${id}`);
      await expect(tile).toHaveAttribute("data-state", "under-construction");
      await expect(tile).toContainText("Under Construction");
      await expect(tile.locator("a, button, input, [tabindex]")).toHaveCount(0);
      await expect(tile.locator("[role='button'], [role='link']")).toHaveCount(0);
      expect(await tile.innerText()).not.toMatch(/\d/); // no numbers: nothing invented
    }
    const dimmedOpacity = await page.getByTestId("context-initiatives").evaluate((el) => getComputedStyle(el).opacity);
    expect(dimmedOpacity).toBe("1"); // dimming never comes from opacity, so the text keeps its contrast
    // the material is dimmed through the registered --tint-strength property that scales every tinted layer
    const tint = (id: string) => page.getByTestId(id).evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--tint-strength")));
    const active = await tint("context-social");
    expect(active).toBeGreaterThanOrEqual(1);
    for (const id of TILE_ORDER.slice(1)) expect(await tint(`context-${id}`), `${id} is dimmed`).toBeLessThanOrEqual(active * 0.6);
  });

  test("AC05 · the Instagram state on the tile comes from the real adapter answer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("context-social")).toHaveAttribute("data-instagram", "CONNECTED");
    await expect(page.getByTestId("context-social")).toContainText("Instagram · Connected");
  });

  for (const c of [
    { fault: { status: 502, error: "instagram-media-fetch-failed" }, state: "ERROR", text: "Instagram · Error" },
    { fault: { status: 409, error: "reauth-required" }, state: "PERMISSION_REQUIRED", text: "Instagram · Permission required" },
    { fault: { hang: true }, state: "ERROR", text: "Instagram · Error" },
    // a verified read of nothing is EMPTY: honest, but never "Connected" or "Live" (Owner rule: Live only while CONNECTED)
    { fault: { empty: true }, state: "EMPTY", text: "Instagram · No posts" },
  ]) {
    test(`AC05/AC10 · ${JSON.stringify(c.fault)} → ${c.state}: never shown as connected, the home stays understandable`, async ({ page, social }) => {
      await social.fault(c.fault);
      await page.goto("/");
      const tile = page.getByTestId("context-social");
      await expect(tile).toHaveAttribute("data-instagram", c.state, { timeout: 20_000 });
      await expect(tile).toContainText(c.text);
      await expect(tile).not.toContainText(/connected|live/i);
      await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
      await expect(page.getByTestId("context-community")).toContainText("Under Construction");
      // the tile still opens the picker, which shows the same honest state on the Instagram row
      await tile.click();
      await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", c.state);
      await expect(page.getByTestId("channel-note")).toContainText(c.text.replace("Instagram · ", ""));
      await expect(page.getByTestId("channel-note")).not.toContainText(/live/i);
    });
  }

  test("AC05 · a failed refresh over an older snapshot is STALE on the home and in the picker, not connected", async ({ page, social }) => {
    await page.goto("/pulse/social/instagram");
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    await social.fault({ status: 502, error: "instagram-media-fetch-failed" });
    await page.getByTestId("refresh").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "STALE");
    // the server still serves the older snapshot as ok; the home must not turn that into "connected" when the cockpit just saw the worker fail
    const answer = await (await page.request.get("/api/social/instagram")).json();
    expect(answer.ok).toBe(true);
    await page.getByTestId("nav-now").click();
    await expect(page.getByTestId("context-social")).toHaveAttribute("data-instagram", "STALE");
    await expect(page.getByTestId("context-social")).toContainText("Instagram · Stale");
    await expect(page.getByTestId("context-social")).not.toContainText(/connected|live/i);
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", "STALE");
    await expect(page.getByTestId("channel-note")).toContainText("Stale");
    await expect(page.getByTestId("channel-note")).not.toContainText(/live/i);
  });

  test("AC05/AC10 · ERROR → the worker recovers → the home reads CONNECTED again (an old failure never outlives a newer successful read)", async ({ page, social }) => {
    await social.fault({ status: 502, error: "instagram-media-fetch-failed" });
    await page.goto("/pulse/social/instagram");
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "ERROR", { timeout: 20_000 });
    await expect(page.getByTestId("prototype-flag")).toHaveText(/Instagram not connected/);
    // the worker is healthy again; the dashboard holds no snapshot after the failure, so the home's own read reaches the worker
    await social.fault(null);
    await page.getByTestId("nav-now").click();
    const tile = page.getByTestId("context-social");
    await expect(tile).toHaveAttribute("data-instagram", "CONNECTED", { timeout: 20_000 });
    await expect(tile).toContainText("Instagram · Connected");
    await tile.click();
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", "CONNECTED");
    await expect(page.getByTestId("channel-note")).toContainText("live cockpit");
    await page.keyboard.press("Escape");
    // and the cockpit itself confirms the recovery on the next visit
    await page.getByTestId("context-social").click();
    await page.getByTestId("channel-instagram").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
  });

  test("AC05 · STALE → the server reads a newer snapshot → the home is CONNECTED; the cached copy of the old one stayed STALE", async ({ page, social }) => {
    await page.goto("/pulse/social/instagram");
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    await social.fault({ status: 502, error: "instagram-media-fetch-failed" });
    await page.getByTestId("refresh").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "STALE");
    await page.getByTestId("nav-now").click();
    await expect(page.getByTestId("context-social")).toHaveAttribute("data-instagram", "STALE"); // the cache hit proves nothing
    // the worker answers again with a snapshot observed AFTER the one the cockpit saw, and the dashboard cache has expired
    // (the e2e reset control stands in for the 10 min TTL): the home's read now carries real news
    await social.fault({ observedAt: "2026-10-11T12:00:00.000Z" });
    expect((await page.request.get("/api/social/instagram?__reset")).status()).toBe(204);
    await page.getByTestId("nav-pulse").click();
    await expect(page).toHaveURL(/\/pulse$/); // the home must unmount before it mounts again, so its read happens after the reset
    await page.getByTestId("nav-now").click();
    const tile = page.getByTestId("context-social");
    await expect(tile).toHaveAttribute("data-instagram", "CONNECTED", { timeout: 20_000 });
    await expect(tile).toContainText("Instagram · Connected");
  });

  test("AC06 · glass and aluminium stay: translucent blurred tiles, metal glyph tiles, the rail and topbar icons", async ({ page }) => {
    await page.goto("/");
    const material = await page.getByTestId("context-social").evaluate((el) => {
      const s = getComputedStyle(el);
      return { blur: s.backdropFilter || (s as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter, border: s.borderTopWidth, radius: s.borderRadius };
    });
    expect(material.blur).toMatch(/blur/);
    expect(material.border).toBe("1px");
    expect(material.radius).toBe("28px");
    const glyph = await page.getByTestId("context-social").locator(".metal").first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(glyph).toMatch(/gradient/);
    await expect(page.getByTestId("nav-now")).toBeVisible();
    await expect(page.getByTestId("nav-pulse")).toBeVisible();
    await expect(page.getByTestId("search-open")).toBeVisible();
    // light canvas, dark text
    const colors = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, scheme: getComputedStyle(document.documentElement).colorScheme }));
    expect(colors.scheme).toBe("light");
    expect(colors.bg).toBe("rgb(236, 239, 243)");
    expect(colors.fg).toBe("rgb(31, 36, 43)");
    await expect(page.locator('[data-testid^="lang-"]')).toHaveCount(3);
    await expect(page.locator("[data-theme], [data-testid='theme-toggle']")).toHaveCount(0);
  });

  test("AC07 · the Instagram cockpit route keeps working and reads on the light material", async ({ page }) => {
    await page.goto("/pulse/social/instagram");
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(page.getByTestId("prototype-flag")).toHaveText(/Instagram live/);
  });

  test("AC08 · keyboard: the Social Media Business tile is reachable with Tab and shows a solid focus ring", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("context-social").focus();
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("context-social")).toHaveAttribute("aria-haspopup", "dialog");
    await expect(page.getByTestId("context-social")).toHaveAttribute("aria-expanded", "false");
  });

  test("AC08 · DE / EN / IT translate the tiles; the heading stays ASADA", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("lang-de").click();
    await expect(page.getByTestId("context-initiatives")).toContainText("Initiativen & Fortschritt");
    await expect(page.getByTestId("context-sessions")).toContainText("Sessions & Workshops");
    await expect(page.getByTestId("context-knowledge")).toContainText("Wissen & Ressourcen");
    await expect(page.getByTestId("context-community")).toContainText("Community & Beziehungen");
    await expect(page.getByTestId("context-social")).toContainText("Instagram · Verbunden");
    await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
    await page.getByTestId("lang-it").click();
    await expect(page.getByTestId("context-initiatives")).toContainText("Iniziative e progressi");
    await expect(page.getByTestId("context-knowledge")).toContainText("Conoscenza e risorse");
    await page.getByTestId("lang-en").click();
    await expect(page.getByTestId("context-initiatives")).toContainText("Initiatives & Progress");
  });

  for (const viewport of VIEWPORTS) {
    test(`AC08 · ${viewport.width}×${viewport.height}: no horizontal overflow, the tiles fit, 200 % text zoom clips nothing`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      for (const id of TILE_ORDER) {
        const rect = await box(page, `context-${id}`);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      // 200 % text zoom: every tile grows with its text instead of clipping it
      await page.addStyleTag({ content: "html { font-size: 200% !important; } body { font-size: 28px !important; }" });
      await page.evaluate(() => (document.documentElement.style as unknown as { zoom: string }).zoom = "2");
      await page.waitForTimeout(200);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="context-"]')).flatMap((tile) =>
          [tile, ...Array.from(tile.querySelectorAll("span"))].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2).map((el) => el.textContent?.slice(0, 40)),
        ),
      );
      expect(clipped).toEqual([]);
      await expect(page.getByTestId("context-social")).toBeVisible();
      await expect(page.getByTestId("asada-title")).toBeVisible();
    });
  }

  test("AC08 · reduced motion: no transform on hover, dialog opens and closes without animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByTestId("context-social").hover();
    expect(await page.getByTestId("context-social").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    await page.getByTestId("context-social").click();
    const duration = await page.getByRole("dialog").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThan(0.01);
    await page.keyboard.press("Escape");
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
  });

  test("AC09 · the Social API refuses cross-site reads and the browser never sees the worker key", async ({ page, request }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await expect(page.getByTestId("context-social")).toHaveAttribute("data-instagram", "CONNECTED");
    expect(requests.some((u) => u.includes("/internal/social-snapshot") || u.includes(":3198"))).toBe(false);
    expect(await page.content()).not.toContain("e2e-fake-social-key");
    const crossSite = await request.get("/api/social/instagram", { headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } });
    expect(crossSite.status()).toBe(403);
  });
});

test.describe("UI-02 · Social Media Business channel picker", () => {
  test("AC01/AC02/AC03 · click opens the picker; channels in order; only Instagram has an action", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("context-social").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-lens", "social");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("Social Media Business");
    await expect(dialog).toContainText("Choose a channel");
    await expect(page.getByTestId("asada-title")).toBeVisible(); // the home stays as orientation behind the glass
    // ... and is dimmed behind it: every tile except the selected trigger is faded and blurred (now.module.css [data-lens-open])
    for (const id of TILE_ORDER.slice(1)) {
      const dimmed = await page.getByTestId(`context-${id}`).evaluate((el) => ({ opacity: parseFloat(getComputedStyle(el).opacity), filter: getComputedStyle(el).filter }));
      expect(dimmed.opacity, `${id} opacity`).toBeLessThanOrEqual(0.6);
      expect(dimmed.filter, `${id} filter`).toMatch(/blur/);
    }
    const names = await Promise.all(CHANNEL_ORDER.map((id) => page.getByTestId(`channel-${id}`).locator("span").nth(2).innerText()));
    expect(names).toEqual(["Instagram", "Substack", "TikTok", "YouTube", "Facebook"]);
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("href", "/pulse/social/instagram");
    for (const id of CHANNEL_ORDER.slice(1)) {
      const row = page.getByTestId(`channel-${id}`);
      await expect(row).toHaveAttribute("data-state", "under-construction");
      await expect(row).toContainText("Under Construction");
      await expect(row.locator("a, button, [tabindex], [role='button'], [role='link']")).toHaveCount(0);
      expect(await row.innerText()).not.toMatch(/\d/);
      expect(await row.evaluate((el) => el.tagName)).toBe("LI");
    }
    await expect(dialog.locator("a")).toHaveCount(1);
    await expect(page.getByTestId("context-social")).toHaveAttribute("aria-expanded", "true");
  });

  for (const key of ["Enter", "Space"]) {
    test(`AC01 · keyboard: ${key} on the tile opens the picker with the Instagram row focused`, async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("context-social").focus();
      await page.keyboard.press(key);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByTestId("channel-instagram")).toBeFocused();
    });
  }

  test("AC04 · Instagram is two interactions away; back returns to ASADA", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("context-social").click(); // 1
    await page.getByTestId("channel-instagram").click(); // 2
    await expect(page).toHaveURL(/\/pulse\/social\/instagram$/);
    await expect(page.getByTestId("instagram-cockpit")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("asada-title")).toHaveText("ASADA");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test("AC05 · focus management: initial focus, Tab stays inside, Escape / X / outside click close and return focus", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("context-social");
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(page.getByTestId("channel-instagram")).toBeFocused();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByTestId("lens-close").click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(40, 860);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("AC05 · mobile 390×844: the picker stays inside the viewport, no horizontal overflow, Escape returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("context-social").click();
    await page.getByTestId("channel-lens").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const rect = await box(page, "channel-lens");
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    for (const id of CHANNEL_ORDER) await expect(page.getByTestId(`channel-${id}`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("context-social")).toBeFocused();
    const dir = process.env.EVIDENCE_DIR;
    if (dir) {
      await page.screenshot({ path: `${dir}/390x844-asada-home.png` });
      await page.getByTestId("context-social").click();
      await page.getByTestId("channel-lens").waitFor();
      await page.screenshot({ path: `${dir}/390x844-asada-channels.png` });
    }
  });

  test("AC06 · the Instagram row carries the adapter state, never Live without a verified read", async ({ page, social }) => {
    await page.goto("/");
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", "CONNECTED");
    await expect(page.getByTestId("channel-instagram")).toContainText("Connected");
    await page.keyboard.press("Escape");
    await social.fault({ status: 409, error: "account-mismatch" });
    expect((await page.request.get("/api/social/instagram?__reset")).status()).toBe(204); // drop the dashboard snapshot cache: the next read must hit the faulted worker
    await page.goto("/");
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", "PERMISSION_REQUIRED", { timeout: 20_000 });
    await expect(page.getByTestId("channel-instagram")).toContainText("Permission required");
    await expect(page.getByTestId("channel-note")).toContainText("currently reports: Permission required");
    await expect(page.getByRole("dialog")).not.toContainText(/live/i);
    await page.keyboard.press("Escape");
    await page.getByTestId("lang-de").click();
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-note")).toContainText("aktueller Stand: Berechtigung nötig");
    await expect(page.getByRole("dialog")).not.toContainText(/live/i);
    await page.keyboard.press("Escape");
    // EMPTY: a verified read with no posts is distinguishable and is not "live" either (Owner rule: Live only while CONNECTED)
    await social.fault({ empty: true });
    expect((await page.request.get("/api/social/instagram?__reset")).status()).toBe(204);
    await page.goto("/");
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-instagram")).toHaveAttribute("data-instagram", "EMPTY", { timeout: 20_000 });
    await expect(page.getByTestId("channel-instagram")).toContainText("Keine Beiträge");
    await expect(page.getByTestId("channel-note")).toContainText("aktueller Stand: Keine Beiträge");
    await expect(page.getByRole("dialog")).not.toContainText(/live/i);
    await page.keyboard.press("Escape");
    await page.getByTestId("lang-en").click();
    await page.getByTestId("context-social").click();
    await expect(page.getByTestId("channel-note")).toContainText("currently reports: No posts");
    await expect(page.getByRole("dialog")).not.toContainText(/live/i);
  });

  test("AC07 · DE / EN / IT: dialog title, subtitle and Under Construction in the chosen language, Inter throughout", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("lang-de").click();
    await page.getByTestId("context-social").click();
    await expect(page.getByRole("dialog")).toContainText("Wähle einen Kanal");
    await expect(page.getByTestId("channel-instagram")).toContainText("Instagram-Cockpit öffnen");
    await expect(page.getByTestId("channel-substack")).toContainText("Under Construction");
    expect(await page.getByRole("dialog").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Inter/);
    await page.keyboard.press("Escape");
    await page.getByTestId("lang-it").click();
    await page.getByTestId("context-social").click();
    await expect(page.getByRole("dialog")).toContainText("Scegli un canale");
    await expect(page.getByTestId("channel-instagram")).toContainText("Apri il cockpit Instagram");
    await page.keyboard.press("Escape");
    await page.getByTestId("lang-en").click();
    await page.getByTestId("context-social").click();
    await expect(page.getByRole("dialog")).toContainText("Choose a channel");
  });

  test("AC08 · after the picker the real cockpit still reads Instagram through the server only", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await page.getByTestId("context-social").click();
    await page.getByTestId("channel-instagram").click();
    await expect(page.getByTestId("instagram-cockpit")).toHaveAttribute("data-state", "CONNECTED");
    expect(requests.filter((u) => u.includes("/api/social/instagram")).length).toBeGreaterThanOrEqual(1);
    expect(requests.some((u) => u.includes("/internal/social-snapshot") || u.includes(":3198"))).toBe(false);
  });
});
