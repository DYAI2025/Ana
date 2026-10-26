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
