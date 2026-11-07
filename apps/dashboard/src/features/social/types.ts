/**
 * Social Intelligence data model (Jira ANA-38). Client-safe: these types describe what the dashboard server returns
 * from GET /api/social/instagram. Provider responses never reach the browser; only this normalized shape does.
 */
import type { Theme } from "@/features/world/postTags";

/** How trustworthy one value is. A missing value is never 0: it carries one of the non-VERIFIED states and `value: null`. */
export type Availability = "VERIFIED" | "UNAVAILABLE" | "NOT_FETCHED" | "ERROR";

/** One normalized observation (brief §5 DTO). `media_id` is null for account-level values. */
export interface Observation {
  account_id: string;
  media_id: string | null;
  provider: "instagram";
  provider_api_version: string;
  /** Dashboard-wide metric name (stable across providers). */
  metric_name: CanonicalMetric;
  /** The field or insight name Instagram used. */
  native_metric_name: string;
  value: number | null;
  /** "ms" for a Reel's average watch time, "percent" (0-100) for its skip rate */
  unit: "accounts" | "count" | "ms" | "percent";
  /** "lifetime" for per-post insights, "28d" for account totals, "snapshot" for counts read at observed_at. */
  period: "lifetime" | "28d" | "snapshot";
  availability_state: Availability;
  /** Provider error class when availability is UNAVAILABLE or ERROR (never a message body). */
  availability_reason: string | null;
  observed_at: string;
  /** Baseline is attached by the insight engine; raw observations have none. */
  baseline_definition: null;
  source_reference: string;
}

export type CanonicalMetric =
  | "reach"
  | "views"
  | "saves"
  | "shares"
  | "likes"
  | "comments"
  | "total_interactions"
  /** Reels only (ANA-51): average watch time in ms, share of views skipped in the first 3 s in percent */
  | "avg_watch_time"
  | "skip_rate"
  | "accounts_engaged"
  | "followers"
  | "media_count"
  | "like_count_field"
  | "comments_count_field";

export type PostFormat = "reel" | "carousel" | "image" | "video" | "unknown";

export interface SocialPost {
  media_id: string;
  media_type: string | null;
  media_product_type: string | null;
  format: PostFormat;
  /** Localhost display only (PO decision, ANA-38): never stored, logged or committed. */
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  /** the picture of a photo post or carousel (Meta gives thumbnail_url only for videos); absent from older workers */
  image_url?: string | null;
  /**
   * Meta's is_shared_to_feed (Reels only): true = may appear in Feed and Reels tab, false = Reels tab only. Read to tell
   * trial Reels from feed Reels; whether false really means "trial" is still to be verified. null = Meta sent no
   * boolean; absent from older workers.
   */
  shared_to_feed?: boolean | null;
  published_at: string | null;
  insights_state: "ok" | "partial" | "unavailable" | "error" | "not_fetched";
  observations: Observation[];
}

export interface Coverage {
  /** null when the worker did not report it */
  requested: number | null;
  retrieved: number;
  /** Total posts on the account when Instagram reports media_count, otherwise null (UNKNOWN). */
  total_available: number | null;
  has_more: boolean;
  pages_fetched: number | null;
  posts_with_insights: number;
  posts_without_insights: number;
  /** null when the worker did not report its call budget (shown as unknown, never 0) */
  budget_used: number | null;
  budget_limit: number | null;
  /** "mature-first": the worker spent its call budget on posts old enough to compare before young ones */
  insights_priority: "mature-first" | null;
  /** Meta error class that stopped further insight calls (rate limit or token), if any */
  halted: string | null;
  optional_fields: "ACCEPTED" | "REJECTED_BY_META";
}

export interface SocialSnapshot {
  provider: "instagram";
  provider_api_version: string;
  account_id: string;
  handle: string;
  observed_at: string;
  /** When the dashboard server last read the worker for this answer (cache hits keep the original observed_at). */
  served_at: string;
  coverage: Coverage;
  account: Observation[];
  posts: SocialPost[];
}

/** Cockpit page states (brief §8). Metric-level UNSUPPORTED/NOT_CONNECTED states live on the individual panels. */
export type CockpitState = "CONNECTED" | "LOADING" | "EMPTY" | "STALE" | "ERROR" | "PERMISSION_REQUIRED";

export type SocialFailureCode = "not-configured" | "auth" | "reauth-required" | "account-mismatch" | "upstream" | "unavailable" | "invalid-response" | "invalid-request";

export interface SocialFailure {
  state: "ERROR" | "PERMISSION_REQUIRED" | "STALE";
  code: SocialFailureCode;
  detail?: string;
}

/**
 * Post categories for the cockpit (ANA-60): the Haiku readings the world already keeps (only the theme and the model's
 * confidence of each post in this snapshot; never a caption). "off" = no model key on the server, so no categories.
 */
export interface SocialCategories {
  state: "on" | "off";
  tags: Readonly<Record<string, { theme: Theme; confidence: number }>>;
}

export type SocialResult =
  | { ok: true; snapshot: SocialSnapshot; stale: false; categories?: SocialCategories }
  /** A refresh failed but an earlier snapshot exists: shown with its age, never as current. */
  | { ok: true; snapshot: SocialSnapshot; stale: true; failure: SocialFailure; categories?: SocialCategories }
  | { ok: false; failure: SocialFailure };
