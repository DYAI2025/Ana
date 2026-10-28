import { cockpitStateOf, homeState, isConnected, worstState, type KnownPhase } from "./state";
import type { SocialResult, SocialSnapshot } from "./types";

const snapshot = (posts: number, observedAt = "2026-10-20T10:00:00.000Z") =>
  ({ observed_at: observedAt, posts: Array.from({ length: posts }, (_, i) => ({ media_id: `m${i}` })) }) as unknown as SocialSnapshot;

describe("cockpitStateOf (UI01-AC05 / UI02-AC06)", () => {
  it("is LOADING before the first answer", () => {
    expect(cockpitStateOf(null)).toBe("LOADING");
  });

  it("is CONNECTED only for a current snapshot with posts", () => {
    const result: SocialResult = { ok: true, snapshot: snapshot(3), stale: false };
    expect(cockpitStateOf(result)).toBe("CONNECTED");
    expect(cockpitStateOf({ ok: true, snapshot: snapshot(0), stale: false })).toBe("EMPTY");
  });

  it("a failed refresh over an older snapshot is STALE, never CONNECTED", () => {
    const result: SocialResult = { ok: true, snapshot: snapshot(3), stale: true, failure: { state: "STALE", code: "upstream" } };
    expect(cockpitStateOf(result)).toBe("STALE");
    expect(isConnected(cockpitStateOf(result))).toBe(false);
  });

  it("maps failures to ERROR or PERMISSION_REQUIRED", () => {
    expect(cockpitStateOf({ ok: false, failure: { state: "ERROR", code: "unavailable" } })).toBe("ERROR");
    expect(cockpitStateOf({ ok: false, failure: { state: "PERMISSION_REQUIRED", code: "reauth-required" } })).toBe("PERMISSION_REQUIRED");
    expect(isConnected("ERROR")).toBe(false);
    expect(isConnected("PERMISSION_REQUIRED")).toBe(false);
  });

  it("CONNECTED is the only connected state: EMPTY is a verified read of nothing, never live (Owner rule 26 Oct 2026)", () => {
    expect(isConnected("CONNECTED")).toBe(true);
    expect(isConnected("EMPTY")).toBe(false);
    expect(isConnected("LOADING")).toBe(false);
    expect(isConnected("STALE")).toBe(false);
  });
});

describe("worstState", () => {
  it("prefers the less reassuring of two states", () => {
    expect(worstState("CONNECTED", "STALE")).toBe("STALE");
    expect(worstState("STALE", "CONNECTED")).toBe("STALE");
    expect(worstState("ERROR", "STALE")).toBe("ERROR");
    expect(worstState("PERMISSION_REQUIRED", "ERROR")).toBe("PERMISSION_REQUIRED");
    expect(worstState("EMPTY", "CONNECTED")).toBe("EMPTY");
  });

  it("treats null as no knowledge and LOADING as weaker than any answer", () => {
    expect(worstState(null, "CONNECTED")).toBe("CONNECTED");
    expect(worstState("STALE", null)).toBe("STALE");
    expect(worstState(null, null)).toBeNull();
    expect(worstState("LOADING", "CONNECTED")).toBe("CONNECTED");
  });
});

describe("homeState (UI01-AC05 / UI01-AC10): the home reconciles the cockpit's last report with its own read", () => {
  const OLD = "2026-10-20T10:00:00.000Z";
  const NEW = "2026-10-20T10:05:00.000Z";
  const ok = (observedAt: string, posts = 3): SocialResult => ({ ok: true, snapshot: snapshot(posts, observedAt), stale: false });
  const stale = (observedAt: string): SocialResult => ({ ok: true, snapshot: snapshot(3, observedAt), stale: true, failure: { state: "STALE", code: "upstream" } });
  const error: SocialResult = { ok: false, failure: { state: "ERROR", code: "unavailable" } };
  const permission: SocialResult = { ok: false, failure: { state: "PERMISSION_REQUIRED", code: "reauth-required" } };
  const known = (state: KnownPhase["state"], observedAt: string | null): KnownPhase => ({ state, observedAt });

  it("without a cockpit report the home shows its own read", () => {
    expect(homeState(null, null)).toBe("LOADING");
    expect(homeState(null, ok(OLD))).toBe("CONNECTED");
    expect(homeState(null, error)).toBe("ERROR");
  });

  it("is LOADING until the home's own read answered, whatever the cockpit saw", () => {
    expect(homeState(known("ERROR", null), null)).toBe("LOADING");
    expect(homeState(known("CONNECTED", OLD), null)).toBe("LOADING");
  });

  it("protection: the server's cached copy of the snapshot the cockpit already had never turns a failed refresh into Connected", () => {
    expect(homeState(known("STALE", OLD), ok(OLD))).toBe("STALE");
    expect(homeState(known("PERMISSION_REQUIRED", OLD), ok(OLD))).toBe("PERMISSION_REQUIRED");
    expect(homeState(known("ERROR", OLD), ok(OLD))).toBe("ERROR");
    // an older snapshot than the one the cockpit saw is not newer either
    expect(homeState(known("STALE", NEW), ok(OLD))).toBe("STALE");
  });

  it("recovery: a snapshot observed after the failure proves the worker answered again, so the home is CONNECTED", () => {
    expect(homeState(known("ERROR", OLD), ok(NEW))).toBe("CONNECTED");
    expect(homeState(known("STALE", OLD), ok(NEW))).toBe("CONNECTED");
    expect(homeState(known("PERMISSION_REQUIRED", OLD), ok(NEW))).toBe("CONNECTED");
    expect(homeState(known("ERROR", OLD), ok(NEW, 0))).toBe("EMPTY");
  });

  it("recovery: a failure seen before any snapshot (cold start, worker down) yields to the first successful read", () => {
    expect(homeState(known("ERROR", null), ok(OLD))).toBe("CONNECTED");
    expect(homeState(known("PERMISSION_REQUIRED", null), ok(OLD))).toBe("CONNECTED");
  });

  it("a fresh failure or STALE read is shown at least as severely as the cockpit's report", () => {
    expect(homeState(known("CONNECTED", OLD), error)).toBe("ERROR");
    expect(homeState(known("CONNECTED", OLD), stale(OLD))).toBe("STALE");
    expect(homeState(known("ERROR", OLD), stale(NEW))).toBe("ERROR");
    expect(homeState(known("STALE", OLD), permission)).toBe("PERMISSION_REQUIRED");
  });

  it("fails closed on an unreadable snapshot timestamp: it never counts as newer", () => {
    expect(homeState(known("STALE", OLD), ok("not-a-date"))).toBe("STALE");
    expect(homeState(known("ERROR", null), ok("not-a-date"))).toBe("ERROR");
    expect(homeState(known("PERMISSION_REQUIRED", null), ok(""))).toBe("PERMISSION_REQUIRED");
    expect(homeState(known("STALE", "not-a-date"), ok(NEW))).toBe("STALE");
  });
});
