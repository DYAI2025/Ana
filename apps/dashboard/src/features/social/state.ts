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

/**
 * Only a verified, current read with content counts as connected (Owner decision 26 Oct 2026: "Live" only while the
 * adapter reports CONNECTED). EMPTY is a successful read of nothing, STALE and ERROR never read as live.
 */
export function isConnected(state: CockpitState): boolean {
  return state === "CONNECTED";
}

/** Most to least severe: a tile that knows two answers shows the one that claims less. */
const SEVERITY: CockpitState[] = ["PERMISSION_REQUIRED", "ERROR", "STALE", "EMPTY", "CONNECTED", "LOADING"];

/** The less reassuring of two states (null counts as "no knowledge"). */
export function worstState(a: CockpitState | null, b: CockpitState | null): CockpitState | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;
}

/** What the cockpit last reported in this browser session, with the newest snapshot it had seen by then. */
export interface KnownPhase {
  state: CockpitState;
  /** `observed_at` of the newest snapshot the cockpit saw (null when it never saw one). */
  observedAt: string | null;
}

/** True when `fresh` was observed by the worker after `seen` (unparsable stamps never count as newer: fail closed). */
function observedAfter(fresh: string, seen: string | null): boolean {
  if (seen === null) return true;
  const a = Date.parse(fresh);
  const b = Date.parse(seen);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/**
 * The home's Instagram state from the cockpit's last report and the home's own read.
 *
 * The dashboard server keeps a good snapshot for ten minutes, so a read from the home can be a cache hit that says
 * nothing about the worker. Two rules keep the home honest in both directions:
 *  - a successful read whose snapshot is NEWER than anything the cockpit saw proves the worker answered again, so it
 *    wins over an earlier failure (ERROR → recovery → CONNECTED, never a permanent error);
 *  - the same snapshot the cockpit already had (a cache hit) proves nothing, so the less reassuring of the two states
 *    stays (a failed refresh is never turned into "Connected" by the cache).
 */
export function homeState(lastKnown: KnownPhase | null, fresh: SocialResult | null): CockpitState {
  const state = cockpitStateOf(fresh);
  if (state === "LOADING" || lastKnown === null) return state;
  if (fresh?.ok && !fresh.stale && observedAfter(fresh.snapshot.observed_at, lastKnown.observedAt)) return state;
  return worstState(lastKnown.state, state) ?? state;
}
