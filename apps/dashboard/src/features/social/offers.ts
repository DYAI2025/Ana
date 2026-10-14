/**
 * Substack Offer Signals (ANA-38 brief §7). H1 and H4 are experimental candidates, not confirmed demand. This module only
 * relates observed relative Instagram signals to them; commercial outcomes stay NOT_CONNECTED until a real source exists.
 */
import { median, MIN_THEME_N, type Analysis, type PostAnalysis, type ThemeId, type ThemeOf } from "./insights";

export type HypothesisId = "H1" | "H2" | "H3" | "H4";

export interface Hypothesis {
  id: HypothesisId;
  status: "candidate" | "parked";
  /** content themes whose posts can speak to this hypothesis */
  themes: readonly ThemeId[];
}

export const HYPOTHESES: readonly Hypothesis[] = [
  // Opportunity Drop / Creator Shortlist: curated creator, UGC, remote and travel work
  { id: "H1", status: "candidate", themes: ["opportunities", "creator", "travel"] },
  // Money Teardown — parked
  { id: "H2", status: "parked", themes: [] },
  // Pitch Room — parked
  { id: "H3", status: "parked", themes: [] },
  // Working File: practical creator/business files and learnings from Ana's own work
  { id: "H4", status: "candidate", themes: ["creator", "money"] },
];

/** Downstream commercial signals this slice cannot see (no Substack, link or sales source connected). */
export const COMMERCIAL_SIGNALS = ["substack-registrations", "paid-subscribers", "link-clicks", "sales"] as const;

export interface ThemeSignal {
  theme: ThemeId;
  n: number;
  medianSavesPerReach: number | null;
  medianSharesPerReach: number | null;
  medianHighIntentIndex: number | null;
}

export interface HypothesisSignal {
  hypothesis: Hypothesis;
  mapped: PostAnalysis[];
  /** high-intent index ≥ 1: saves + shares per reached account at or above the same-format median */
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
    return {
      theme,
      n: ps.length,
      medianSavesPerReach: median(nums(ps.map((p) => p.rates.saves_per_reach))),
      medianSharesPerReach: median(nums(ps.map((p) => p.rates.shares_per_reach))),
      medianHighIntentIndex: median(nums(ps.map((p) => p.highIntentIndex))),
    };
  });
}

export function hypothesisSignals(analysis: Analysis, themeOf: ThemeOf): HypothesisSignal[] {
  const pool = analysis.posts.filter((p) => p.highIntentIndex !== null);
  return HYPOTHESES.filter((h) => h.status === "candidate").map((hypothesis) => {
    const mapped = pool.filter((p) => themeOf(p.post).some((t) => hypothesis.themes.includes(t)));
    const supporting = mapped.filter((p) => p.highIntentIndex! >= 1).sort((a, b) => b.highIntentIndex! - a.highIntentIndex!);
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

/**
 * The single next test that could tell H1 and H4 apart. Returns which hypothesis currently leans stronger only when both
 * carry a signal and differ by ≥ 0.25×; otherwise the test is framed as open.
 */
export function nextTest(signals: readonly HypothesisSignal[]): { lean: "H1" | "H4" | null; state: "READY" | "INSUFFICIENT_EVIDENCE" } {
  const h1 = signals.find((s) => s.hypothesis.id === "H1");
  const h4 = signals.find((s) => s.hypothesis.id === "H4");
  if (!h1 || !h4 || h1.state !== "SIGNAL" || h4.state !== "SIGNAL") return { lean: null, state: "INSUFFICIENT_EVIDENCE" };
  const d = (h1.medianHighIntentIndex ?? 0) - (h4.medianHighIntentIndex ?? 0);
  return { lean: Math.abs(d) >= 0.25 ? (d > 0 ? "H1" : "H4") : null, state: "READY" };
}
