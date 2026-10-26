import { cockpitStateOf, isConnected } from "./state";
import type { SocialResult, SocialSnapshot } from "./types";

const snapshot = (posts: number) => ({ posts: Array.from({ length: posts }, (_, i) => ({ media_id: `m${i}` })) }) as unknown as SocialSnapshot;

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

  it("CONNECTED and EMPTY are the only connected states", () => {
    expect(isConnected("CONNECTED")).toBe(true);
    expect(isConnected("EMPTY")).toBe(true);
    expect(isConnected("LOADING")).toBe(false);
    expect(isConnected("STALE")).toBe(false);
  });
});
