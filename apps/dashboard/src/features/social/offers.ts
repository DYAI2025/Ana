/**
 * Substack Offer Signals (ANA-38 brief §7). H1 and H4 are experimental candidates, not confirmed demand. This module only
 * relates observed relative Instagram signals to them; commercial outcomes stay NOT_CONNECTED until a real source exists.
 * Every index here is within-format (see insights.ts), so a theme's format mix cannot create a signal.
 */
import { median, MIN_PATTERN_GROUP_N, MIN_THEME_N, type Analysis, type PostAnalysis, type ThemeId, type ThemeOf } from "./insights";
import type { FamilyId } from "./themes";
import type { SocialPost } from "./types";

export type HypothesisId = "H1" | "H2" | "H3" | "H4";
export type FamilyOf = (post: SocialPost) => readonly FamilyId[];

export interface Hypothesis {
  id: HypothesisId;
  status: "candidate" | "parked";
  /** keyword families whose posts can speak to this hypothesis (disjoint between H1 and H4) */
  families: readonly FamilyId[];
}

export const HYPOTHESES: readonly Hypothesis[] = [
  // Opportunity Drop / Creator Shortlist: curated creator, UGC, remote and travel work
  { id: "H1", status: "candidate", families: ["opportunity", "travel"] },
  // Money Teardown — parked
  { id: "H2", status: "parked", families: [] },
  // Pitch Room — parked
  { id: "H3", status: "parked", families: [] },
  // Working File: practical creator/business files, templates and learnings from Ana's own work
  { id: "H4", status: "candidate", families: ["practical", "money"] },
];

/** Downstream commercial signals this slice cannot see (no Substack, link or sales source connected). */
export const COMMERCIAL_SIGNALS = ["substack-registrations", "paid-subscribers", "link-clicks", "sales"] as const;

export interface ThemeSignal {
  theme: ThemeId;
  n: number;
  state: "SIGNAL" | "INSUFFICIENT_EVIDENCE";
  medianSavesIndex: number | null;
  medianSharesIndex: number | null;
  medianHighIntentIndex: number | null;
}

export interface HypothesisSignal {
  hypothesis: Hypothesis;
  mapped: PostAnalysis[];
  /** high-intent index > 1: saves + shares per reached account above the same-format median */
  supporting: PostAnalysis[];
  contradicting: PostAnalysis[];
  medianHighIntentIndex: number | null;
  state: "SIGNAL" | "INSUFFICIENT_EVIDENCE";
}

const nums = (xs: Array<number | null>) => xs.filter((v): v is number => v !== null);

export function themeSignals(analysis: Analysis, themeOf: ThemeOf): ThemeSignal[] {
  const pool = analysis.posts.filter((p) => p.highIntentIndex !== null);
  return (["travel", "creator", "money", "personal", "opportunities"] as const).map((theme) => {
    const ps = pool.filter((p) => themeOf(p.post).includes(theme));
    const enough = ps.length >= MIN_THEME_N;
    return {
      theme,
      n: ps.length,
      state: enough ? "SIGNAL" : "INSUFFICIENT_EVIDENCE",
      medianSavesIndex: enough ? median(nums(ps.map((p) => p.savesIndex))) : null,
      medianSharesIndex: enough ? median(nums(ps.map((p) => p.sharesIndex))) : null,
      medianHighIntentIndex: enough ? median(nums(ps.map((p) => p.highIntentIndex))) : null,
    };
  });
}

export function hypothesisSignals(analysis: Analysis, familyOf: FamilyOf): HypothesisSignal[] {
  const pool = analysis.posts.filter((p) => p.highIntentIndex !== null);
  return HYPOTHESES.filter((h) => h.status === "candidate").map((hypothesis) => {
    const mapped = pool.filter((p) => familyOf(p.post).some((f) => hypothesis.families.includes(f)));
    const supporting = mapped.filter((p) => p.highIntentIndex! > 1).sort((a, b) => b.highIntentIndex! - a.highIntentIndex!);
    const contradicting = mapped.filter((p) => p.highIntentIndex! < 1).sort((a, b) => a.highIntentIndex! - b.highIntentIndex!);
    return {
      hypothesis,
      mapped,
      supporting,
      contradicting,
      medianHighIntentIndex: median(mapped.map((p) => p.highIntentIndex!)),
      state: mapped.length >= MIN_THEME_N ? "SIGNAL" : "INSUFFICIENT_EVIDENCE",
    };
  });
}

export interface NextTest {
  lean: "H1" | "H4" | null;
  state: "READY" | "INSUFFICIENT_EVIDENCE";
  /** posts mapped to exactly one of the two hypotheses (posts mapped to both are left out of the lean) */
  nH1: number;
  nH4: number;
}

/**
 * The single next test that could tell H1 and H4 apart. A lean is named only from disjoint posts, with at least
 * MIN_PATTERN_GROUP_N on each side and a difference of ≥ 0.25×; otherwise there is no lean.
 */
export function nextTest(signals: readonly HypothesisSignal[]): NextTest {
  const h1 = signals.find((s) => s.hypothesis.id === "H1");
  const h4 = signals.find((s) => s.hypothesis.id === "H4");
  if (!h1 || !h4) return { lean: null, state: "INSUFFICIENT_EVIDENCE", nH1: 0, nH4: 0 };
  const inH4 = new Set(h4.mapped.map((p) => p.post.media_id));
  const inH1 = new Set(h1.mapped.map((p) => p.post.media_id));
  const only1 = h1.mapped.filter((p) => !inH4.has(p.post.media_id));
  const only4 = h4.mapped.filter((p) => !inH1.has(p.post.media_id));
  const base = { nH1: only1.length, nH4: only4.length };
  if (only1.length < MIN_PATTERN_GROUP_N || only4.length < MIN_PATTERN_GROUP_N) return { lean: null, state: "INSUFFICIENT_EVIDENCE", ...base };
  const d = (median(only1.map((p) => p.highIntentIndex!)) ?? 0) - (median(only4.map((p) => p.highIntentIndex!)) ?? 0);
  return { lean: Math.abs(d) >= 0.25 ? (d > 0 ? "H1" : "H4") : null, state: "READY", ...base };
}
