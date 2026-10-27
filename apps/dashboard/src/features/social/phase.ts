"use client";

import { useSyncExternalStore } from "react";
import type { KnownPhase } from "./state";
import type { CockpitState } from "./types";

/**
 * The Instagram cockpit's current state, shared with the Topbar so its live label says what is actually true
 * (reading, live, stale or not connected) instead of a fixed "live" claim. In-memory only.
 *
 * `lastKnown` keeps the last state the cockpit reported in this browser session even after the cockpit unmounts,
 * together with the newest snapshot the cockpit had seen by then: the home must not claim "connected" from the
 * server's cached copy of that same snapshot when the cockpit has just seen the worker fail, but a newer snapshot
 * proves the worker answered again (see `homeState`).
 */
let phase: CockpitState | null = null;
let lastKnown: KnownPhase | null = null;
let seenObservedAt: string | null = null;
const listeners = new Set<() => void>();

export function setSocialPhase(next: CockpitState | null, observedAt: string | null = null) {
  if (observedAt !== null && Number.isFinite(Date.parse(observedAt)) &&
      (seenObservedAt === null || Date.parse(observedAt) > Date.parse(seenObservedAt))) seenObservedAt = observedAt;
  const changedReport = next !== null && next !== "LOADING" &&
    (lastKnown?.state !== next || lastKnown?.observedAt !== seenObservedAt);
  if (next === phase && !changedReport) return;
  phase = next;
  if (changedReport) lastKnown = { state: next, observedAt: seenObservedAt };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSocialPhase(): CockpitState | null {
  return useSyncExternalStore(subscribe, () => phase, () => null);
}

export function useLastKnownSocialPhase(): KnownPhase | null {
  return useSyncExternalStore(subscribe, () => lastKnown, () => null);
}
