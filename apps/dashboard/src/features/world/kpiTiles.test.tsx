import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/providers/I18nProvider";
import { ContactTapsTile, FollowsLine, OnlineTile, ReachSplitTile, ViewingTiles, hourIn, peakUtcHour } from "./kpiTiles";
import type { WorldContactTaps, WorldFollows, WorldOnlineHours, WorldPlace, WorldReachSplit, WorldReelViewing } from "./types";

function Tiles({ follows, viewing, current = true }: { follows: WorldFollows; viewing: WorldReelViewing; current?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div>
      <FollowsLine follows={follows} current={current} t={t} locale={locale} />
      <ViewingTiles viewing={viewing} t={t} locale={locale} />
    </div>
  );
}
const F: WorldFollows = { state: "ok", reason: null, since: "2026-11-04T10:00:00.000Z", until: "2026-11-05T10:00:00.000Z", gained: 120, lost: 45 };
const V: WorldReelViewing = { state: "on", reels: 37, skip_reels: 35, watch_ms: 28130, skip_pct: 34.5, previous: { day: "2026-11-04", watch_ms: 26500, skip_pct: 36.1 }, store_error: false };
const show = (follows: WorldFollows, viewing: WorldReelViewing, current = true) =>
  render(
    <I18nProvider>
      <Tiles follows={follows} viewing={viewing} current={current} />
    </I18nProvider>,
  );

describe("KPI tiles — what changed (ANA-52)", () => {
  it("followers: gained and lost in the last 24 h, the arrow follows the balance, the Meta delay is named", () => {
    show(F, V);
    const line = screen.getByTestId("world-kpi-follows");
    expect(line.textContent).toBe("▲+120 / −45 in 24 h");
    expect(line.getAttribute("data-direction")).toBe("up");
    expect(line.getAttribute("data-good")).toBe("true");
    expect(line.getAttribute("title")).toContain("up to 48 h");
  });

  it("followers: more lost than gained points down; an unknown side is '?', never 0; no data says so", () => {
    const a = show({ ...F, gained: 10, lost: 30 }, V);
    expect(screen.getByTestId("world-kpi-follows").getAttribute("data-direction")).toBe("down");
    expect(screen.getByTestId("world-kpi-follows").getAttribute("data-good")).toBe("false");
    expect(screen.getByTestId("world-kpi-follows").textContent).toBe("▼+10 / −30 in 24 h");
    a.unmount();
    const b = show({ ...F, lost: null }, V);
    expect(screen.getByTestId("world-kpi-follows").textContent).toBe("+120 / −? in 24 h");
    expect(screen.getByTestId("world-kpi-follows").getAttribute("data-direction")).toBe("unknown");
    b.unmount();
    show({ ...F, state: "unavailable", reason: "meta-100", gained: null, lost: null }, V);
    expect(screen.getByTestId("world-kpi-follows").textContent).toBe("Changes in 24 h not available");
  });

  it("watch time and skips: medians with the change since the stored day before; fewer skips is the good direction", () => {
    show(F, V);
    const watch = screen.getByTestId("world-kpi-watch");
    expect(watch.textContent).toContain("Median watch time (Reels)");
    expect(watch.textContent).toContain("28.1 s");
    expect(screen.getByTestId("world-kpi-watch-delta").textContent).toBe("▲+1.6 s vs. Nov 4");
    expect(screen.getByTestId("world-kpi-watch-delta").getAttribute("data-good")).toBe("true");
    const skip = screen.getByTestId("world-kpi-skip");
    expect(skip.textContent).toContain("34.5 %");
    expect(screen.getByTestId("world-kpi-skip-delta").textContent).toBe("▼−1.6 pts vs. Nov 4");
    expect(screen.getByTestId("world-kpi-skip-delta").getAttribute("data-good")).toBe("true");
    expect(watch.getAttribute("title")).toContain("37 Reels");
    expect(skip.getAttribute("title")).toContain("35 Reels");
  });

  it("without a stored day before there is no arrow but a note; without a value a dash, never 0", () => {
    const a = show(F, { ...V, previous: null });
    expect(screen.getByTestId("world-kpi-watch-delta").textContent).toBe("Comparison from tomorrow");
    a.unmount();
    show(F, { ...V, watch_ms: null, skip_pct: null, reels: 0 });
    expect(screen.getByTestId("world-kpi-watch").textContent).toContain("—");
    expect(screen.getByTestId("world-kpi-skip").textContent).toContain("—");
    expect(screen.queryByTestId("world-kpi-watch-delta")).toBeNull();
  });

  it("an answer from an audience read that failed since is not shown as the last 24 h", () => {
    show(F, V, false);
    expect(screen.getByTestId("world-kpi-follows").textContent).toBe("Changes in 24 h not available");
  });

  it("a storage error is named instead of promising a comparison tomorrow", () => {
    show(F, { ...V, previous: null, store_error: true });
    expect(screen.getByTestId("world-kpi-watch-delta").textContent).toBe("Comparison not saved (storage error)");
  });

  it("off: no tiles at all", () => {
    show(F, { ...V, state: "off" });
    expect(screen.queryByTestId("world-kpi-watch")).toBeNull();
  });
});

// ---- ANA-56: new people reached, followers online, contact-button taps ----

const SPLIT: WorldReachSplit = { state: "ok", reason: null, since: "2026-10-08T00:00:00.000Z", until: "2026-11-05T00:00:00.000Z", followers: 32302, non_followers: 1051492 };
const ONLINE: WorldOnlineHours = { state: "ok", reason: null, days: 26, utc_hours: Array.from({ length: 24 }, (_, h) => (h === 14 ? 33010 : 18000)) };
const CHIANG_MAI: WorldPlace = { label: "Chiang Mai", lat: 18.79, lon: 98.98, tz: "Asia/Bangkok" };
const NOW = new Date("2026-11-05T12:00:00Z");

function Signals({ split, online, taps, place, current = true }: { split: WorldReachSplit; online: WorldOnlineHours; taps: WorldContactTaps; place: WorldPlace | null; current?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div>
      <ReachSplitTile split={split} current={current} t={t} locale={locale} />
      <OnlineTile online={online} current={current} place={place} placeLabel={place?.label === "TH" ? "Thailand" : null} t={t} locale={locale} now={NOW} />
      <ContactTapsTile taps={taps} current={current} t={t} locale={locale} />
    </div>
  );
}
const signals = (p: Partial<{ split: WorldReachSplit; online: WorldOnlineHours; taps: WorldContactTaps; place: WorldPlace | null; current: boolean }> = {}) =>
  render(
    <I18nProvider>
      <Signals split={p.split ?? SPLIT} online={p.online ?? ONLINE} taps={p.taps ?? { state: "ok", reason: null, total: 0 }} place={p.place === undefined ? CHIANG_MAI : p.place} current={p.current ?? true} />
    </I18nProvider>,
  );

describe("KPI tiles — who Ana reaches and when her followers are online (ANA-56)", () => {
  it("new people: the share of non-followers from the two groups Meta reports, with both counts", () => {
    signals();
    const tile = screen.getByTestId("world-kpi-new-people");
    expect(tile.textContent).toContain("New people reached (28 d)");
    expect(tile.textContent).toContain("97 %");
    expect(screen.getByTestId("world-kpi-new-people-split").textContent).toBe("1.1M new · 32.3K followers");
    expect(tile.getAttribute("title")).toContain("a little more than the total reach");
  });

  it("new people: no data, a refusal or a failed read show a dash and say so, never 0 %", () => {
    const a = signals({ split: { ...SPLIT, state: "unavailable", reason: "meta-100", followers: null, non_followers: null } });
    expect(screen.getByTestId("world-kpi-new-people").textContent).toContain("—");
    expect(screen.getByTestId("world-kpi-new-people-split").textContent).toBe("Not available");
    expect(screen.getByTestId("world-kpi-new-people").textContent).not.toContain("0 %");
    a.unmount();
    signals({ current: false });
    expect(screen.getByTestId("world-kpi-new-people").textContent).toContain("—");
  });

  it("online: the peak hour in the time of Ana's place, named, with about how many are online", () => {
    signals();
    const tile = screen.getByTestId("world-kpi-online");
    expect(tile.textContent).toContain("Followers online most");
    expect(tile.textContent).toContain("21:00");
    expect(screen.getByTestId("world-kpi-online-where").textContent).toBe("Chiang Mai time · about 33,010 online");
    expect(tile.getAttribute("title")).toContain("26 days");
    expect(tile.getAttribute("title")).toContain("US Pacific time");
  });

  it("online: a country-code place is named as the world view names it", () => {
    signals({ place: { ...CHIANG_MAI, label: "TH" } });
    expect(screen.getByTestId("world-kpi-online-where").textContent).toBe("Thailand time · about 33,010 online");
  });

  it("online: without a place time zone it says it is the viewer's own time; without data a dash", () => {
    const a = signals({ place: null });
    expect(screen.getByTestId("world-kpi-online-where").textContent).toBe("your time · about 33,010 online");
    a.unmount();
    signals({ online: { state: "unavailable", reason: "meta-100", days: 0, utc_hours: Array(24).fill(null) } });
    expect(screen.getByTestId("world-kpi-online").textContent).toContain("—");
    expect(screen.getByTestId("world-kpi-online-where").textContent).toBe("Not available");
  });

  it("contact-button taps appear only when there were any", () => {
    const a = signals();
    expect(screen.queryByTestId("world-kpi-contact-taps")).toBeNull();
    a.unmount();
    signals({ taps: { state: "ok", reason: null, total: 5 } });
    expect(screen.getByTestId("world-kpi-contact-taps").textContent).toContain("5");
    expect(screen.getByTestId("world-kpi-contact-taps").getAttribute("title")).toContain("Not the link in bio");
  });

  it("peakUtcHour skips missing hours; hourIn converts a UTC hour into a time zone", () => {
    expect(peakUtcHour([null, 5, null, 9, 9])).toBe(3);
    expect(peakUtcHour(Array(24).fill(null))).toBeNull();
    expect(hourIn(14, "Asia/Bangkok", "en", NOW)).toBe("21:00");
    expect(hourIn(14, "Europe/Berlin", "de", NOW)).toBe("15:00");
  });
});
