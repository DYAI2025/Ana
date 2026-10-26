"use client";

import { useEffect, useState } from "react";
import { fetchInstagram } from "./api";
import { cockpitStateOf } from "./state";
import type { CockpitState, SocialResult } from "./types";

/**
 * One read of the Social API on mount, through the dashboard server (the browser never sees the worker
 * or its key). The home and the channel picker derive their Instagram state from this real answer only.
 */
export function useInstagramState(): { state: CockpitState; result: SocialResult | null } {
  const [result, setResult] = useState<SocialResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInstagram(false).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state: cockpitStateOf(result), result };
}
