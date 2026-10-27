import { act, renderHook } from "@testing-library/react";
import { homeState } from "./state";

describe("cockpit reports retained for the ASADA home", () => {
  it("retains the newest snapshot across consecutive STALE reports, invalid dates and unmount", async () => {
    vi.resetModules();
    const { setSocialPhase, useLastKnownSocialPhase } = await import("./phase");
    const { result } = renderHook(() => useLastKnownSocialPhase());
    const old = "2026-10-20T10:00:00.000Z";
    const newer = "2026-10-20T10:05:00.000Z";
    act(() => setSocialPhase("STALE", old));
    act(() => setSocialPhase("STALE", newer));
    expect(result.current).toEqual({ state: "STALE", observedAt: newer });
    expect(homeState(result.current, { ok: true, stale: false, snapshot: { observed_at: newer, posts: [{}] } } as Parameters<typeof homeState>[1])).toBe("STALE");
    act(() => setSocialPhase("STALE", old));
    act(() => setSocialPhase("STALE", "not-a-date"));
    act(() => setSocialPhase(null));
    expect(result.current).toEqual({ state: "STALE", observedAt: newer });
  });
});
