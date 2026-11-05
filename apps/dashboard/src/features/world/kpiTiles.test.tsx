import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/providers/I18nProvider";
import { FollowsLine, ViewingTiles } from "./kpiTiles";
import type { WorldFollows, WorldReelViewing } from "./types";

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
