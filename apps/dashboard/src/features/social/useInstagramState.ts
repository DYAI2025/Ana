"use client";

import { useEffect, useState } from "react";
import { fetchInstagram } from "./api";
import { useLastKnownSocialPhase } from "./phase";
import { homeState } from "./state";
import type { CockpitState, SocialResult } from "./types";

/**
 * One read of the Social API on mount, through the dashboard server (the browser never sees the worker
 * or its key), reconciled with what the cockpit last reported in this session (`homeState`): a cached snapshot
 * never overrides a failure the cockpit saw, and a newer snapshot never stays hidden behind an old failure.
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

  return { state: homeState(lastKnown, result), result };
}
