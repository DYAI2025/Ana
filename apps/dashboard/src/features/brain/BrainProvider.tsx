"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { BrainFailure, BrainProjection, BrainResult } from "./types";

/** The browser never talks to the Brain service and never holds its token: it reads the dashboard's /api/brain. */
export const BRAIN_DEADLINE_MS = 30_000;

function isResult(body: unknown): body is BrainResult {
  if (typeof body !== "object" || body === null) return false;
  const b = body as { ok?: unknown; projection?: unknown; failure?: { kind?: unknown } };
  return (b.ok === true && typeof b.projection === "object" && b.projection !== null) || (b.ok === false && typeof b.failure?.kind === "string");
}

export async function fetchBrain(): Promise<BrainResult> {
  const unreachable: BrainResult = { ok: false, failure: { kind: "unreachable", detail: "The dashboard server did not answer" } };
  try {
    const response = await fetch("/api/brain", { cache: "no-store", signal: AbortSignal.timeout(BRAIN_DEADLINE_MS) });
    const body: unknown = await response.json();
    return isResult(body) ? body : unreachable;
  } catch {
    return unreachable;
  }
}

/** In-memory view state only: rebuilt from the Brain service on every load, never stored. */
export type BrainState = { phase: "idle" } | { phase: "loading" } | { phase: "ready"; projection: BrainProjection } | { phase: "failed"; failure: BrainFailure };

interface BrainValue {
  state: BrainState;
  /** Reads the projection (again). The Brain is read lazily: only when the Brain view asks for it. */
  load: () => void;
}

const BrainContext = createContext<BrainValue>({ state: { phase: "idle" }, load: () => undefined });

export function BrainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BrainState>({ phase: "idle" });
  const request = useRef(0);
  const load = useCallback(() => {
    const id = (request.current += 1);
    setState((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
    void fetchBrain().then((result) => {
      if (id !== request.current) return;
      // a failed refresh never keeps showing older data as if it were current
      setState(result.ok ? { phase: "ready", projection: result.projection } : { phase: "failed", failure: result.failure });
    });
  }, []);
  const value = useMemo(() => ({ state, load }), [state, load]);
  return <BrainContext.Provider value={value}>{children}</BrainContext.Provider>;
}

export const useBrain = () => useContext(BrainContext);

/** The loaded projection, or null — global search offers Brain nodes only from a real read. */
export const projectionOf = (state: BrainState): BrainProjection | null => (state.phase === "ready" ? state.projection : null);
