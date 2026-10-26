"use client";

import { useEffect, useState } from "react";
import { fetchInstagram } from "./api";
import { useLastKnownSocialPhase } from "./phase";
import { cockpitStateOf, worstState } from "./state";
import type { CockpitState, SocialResult } from "./types";

/**
 * One read of the Social API on mount, through the dashboard server (the browser never sees the worker
 * or its key), combined with what the cockpit last reported in this session. The home and the channel
 * picker show the less reassuring of the two: a cached snapshot never overrides a failure the cockpit saw.
 */
export function useInstagramState(): { state: CockpitState; result: SocialResult | null } {
  const [result, setResult] = useState<SocialResult | null>(null);
  const lastKnown = useLastKnownSocialPhase();

  useEffect(() => {
    let cancelled = false;
    fetchInstagram(false).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fresh = cockpitStateOf(result);
  return { state: fresh === "LOADING" ? "LOADING" : (worstState(lastKnown, fresh) ?? fresh), result };
}
