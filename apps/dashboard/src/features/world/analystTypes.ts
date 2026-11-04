/**
 * What POST /api/world/analyst returns (Jira ANAK-3). Client-safe. Values and labels are the server's: the model only
 * names references. Media ids appear only for posts an answer cites. Captions, permalinks, handles, account data,
 * audience geography and provider error texts have no field here.
 */
export const ANALYST_METRICS = ["reach", "views", "saves", "shares", "total_interactions", "er", "ssr"] as const;
export type AnalystMetric = (typeof ANALYST_METRICS)[number];

export const ANALYST_FIELDS = ["theme", "shot", "hook", "cta", "mood"] as const;
export type AnalystField = (typeof ANALYST_FIELDS)[number];

export const QUESTION_MAX = 500;

export interface MeasuredBlock {
  media_id: string;
  day: string;
  format: string;
  metric: AnalystMetric;
  /** null: not measured, never 0 */
  value: number | null;
}

export interface CategoryBlock {
  media_id: string;
  field: AnalystField;
  value: string;
}

export interface GroupBlock {
  field: AnalystField | "format";
  value: string;
  metric: "er" | "ssr";
  median: number;
  n: number;
  /** too few posts to carry a pattern */
  small: boolean;
}

export interface BrainBlock {
  note_id: string;
  source_ids: string[];
  status: string;
  origin: string;
  /** when the Brain block was written */
  at: string;
  /** the Brain's own reading is a derivation nobody confirmed; the dashboard cannot prove the note's index is current */
  uncertainty: "derived_unconfirmed";
  index_state: "not_proven";
  text: string;
}

export type HypothesisRef = { type: "post"; media_id: string } | { type: "group"; field: GroupBlock["field"]; value: string; metric: GroupBlock["metric"] } | { type: "brain"; note_id: string };

export interface HypothesisBlock {
  text: string;
  refs: HypothesisRef[];
}

export type BrainState = "ok" | "none" | "blocked" | "unknown";
export type BrainReason = "no_release" | "not_configured" | "stale_index" | "projection_unreadable" | "brain_failed";

export interface AnalystStatus {
  fetched_at: string;
  stale: boolean;
  categories: "ok" | "none" | "unreadable";
  window: { from: string | null; to: string | null; considered: number; total: number };
  brain: { state: BrainState; reason: BrainReason | null; withheld: number };
}

export interface AnalystAnswer {
  measured: MeasuredBlock[];
  categories: CategoryBlock[];
  groups: GroupBlock[];
  brain: BrainBlock[];
  hypotheses: HypothesisBlock[];
  /** statements of the model the server did not let through */
  rejected: number;
}

export type AnalystFailure = "off" | "misconfigured" | "invalid_question" | "busy" | "daily_cap" | "instagram_unavailable" | "no_evidence" | "invalid_answer" | "provider_timeout" | "provider_rate_limited" | "provider_refused" | "provider_failed";

export type AnalystResponse = { ok: true; answer: AnalystAnswer; status: AnalystStatus } | { ok: false; reason: AnalystFailure };
