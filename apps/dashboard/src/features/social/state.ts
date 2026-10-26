import type { CockpitState, SocialResult } from "./types";

/**
 * The page-level Instagram state, derived from one real Social API answer (never from a fixture).
 * Shared by the cockpit and the ASADA home so both say the same thing about the same read.
 */
export function cockpitStateOf(result: SocialResult | null): CockpitState {
  if (result === null) return "LOADING";
  if (!result.ok) return result.failure.state === "PERMISSION_REQUIRED" ? "PERMISSION_REQUIRED" : "ERROR";
  if (result.stale) return "STALE";
  return result.snapshot.posts.length === 0 ? "EMPTY" : "CONNECTED";
}

/** Only a verified, current read counts as connected; STALE and ERROR never read as live. */
export function isConnected(state: CockpitState): boolean {
  return state === "CONNECTED" || state === "EMPTY";
}

/** Most to least severe: a tile that knows two answers shows the one that claims less. */
const SEVERITY: CockpitState[] = ["PERMISSION_REQUIRED", "ERROR", "STALE", "EMPTY", "CONNECTED", "LOADING"];

/** The less reassuring of two states (null counts as "no knowledge"). */
export function worstState(a: CockpitState | null, b: CockpitState | null): CockpitState | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;
}
