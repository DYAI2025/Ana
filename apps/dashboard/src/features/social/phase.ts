"use client";

import { useSyncExternalStore } from "react";
import type { CockpitState } from "./types";

/**
 * The Instagram cockpit's current state, shared with the Topbar so its live label says what is actually true
 * (reading, live, stale or not connected) instead of a fixed "live" claim. In-memory only.
 *
 * `lastKnown` keeps the last state the cockpit reported in this browser session even after the cockpit unmounts:
 * the home must not claim "connected" from a cached snapshot when the cockpit has just seen the worker fail.
 */
let phase: CockpitState | null = null;
let lastKnown: CockpitState | null = null;
const listeners = new Set<() => void>();

export function setSocialPhase(next: CockpitState | null) {
  if (next === phase) return;
  phase = next;
  if (next !== null && next !== "LOADING") lastKnown = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSocialPhase(): CockpitState | null {
  return useSyncExternalStore(subscribe, () => phase, () => null);
}

export function useLastKnownSocialPhase(): CockpitState | null {
  return useSyncExternalStore(subscribe, () => lastKnown, () => null);
}
