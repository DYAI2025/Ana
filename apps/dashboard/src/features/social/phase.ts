"use client";

import { useSyncExternalStore } from "react";
import type { CockpitState } from "./types";

/**
 * The Instagram cockpit's current state, shared with the Topbar so its live label says what is actually true
 * (reading, live, stale or not connected) instead of a fixed "live" claim. In-memory only.
 */
let phase: CockpitState | null = null;
const listeners = new Set<() => void>();

export function setSocialPhase(next: CockpitState | null) {
  if (next === phase) return;
  phase = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSocialPhase(): CockpitState | null {
  return useSyncExternalStore(subscribe, () => phase, () => null);
}
