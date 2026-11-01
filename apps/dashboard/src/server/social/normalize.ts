import "server-only";
import type { Availability, CanonicalMetric, Observation, PostFormat, SocialPost, SocialSnapshot } from "@/features/social/types";

/** Instagram insight/field names → dashboard metric names. Anything not listed is dropped, never guessed. */
const MEDIA_METRICS: Readonly<Record<string, CanonicalMetric>> = {
  reach: "reach",
  views: "views",
  saved: "saves",
  shares: "shares",
  likes: "likes",
  comments: "comments",
  total_interactions: "total_interactions",
};
const ACCOUNT_METRICS: Readonly<Record<string, CanonicalMetric>> = {
  reach: "reach",
  views: "views",
  accounts_engaged: "accounts_engaged",
  total_interactions: "total_interactions",
};
const UNITS: Readonly<Partial<Record<CanonicalMetric, Observation["unit"]>>> = { reach: "accounts", accounts_engaged: "accounts", followers: "accounts" };

const STATE: Readonly<Record<string, Availability>> = { ok: "VERIFIED", unavailable: "UNAVAILABLE", error: "ERROR", not_fetched: "NOT_FETCHED" };

export class InvalidWorkerResponse extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidWorkerResponse";
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const need = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new InvalidWorkerResponse(`missing ${what}`);
  return v;
};

/** A VIDEO without a product type could be a Reel or a feed video: it stays "unknown" and is never compared. */
export function formatOf(mediaType: string | null, productType: string | null): PostFormat {
  if (productType === "REELS") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  if (mediaType === "IMAGE") return "image";
  if (mediaType === "VIDEO" && productType === "FEED") return "video";
  return "unknown";
}

/** Only https links are rendered; anything else is treated as absent. */
const httpsOrNull = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};

/**
 * Worker snapshot (snapshot_version 1, see workers/instagram-oauth/README.md) → dashboard DTO. Values whose state is not
 * "ok" are kept as observations with `value: null` so the UI can say why a number is missing.
 */
export function normalizeSnapshot(raw: unknown): SocialSnapshot {
  if (!isRec(raw) || raw.snapshot_version !== 1) throw new InvalidWorkerResponse("unsupported snapshot_version");
  const apiVersion = need(str(raw.api_version), "api_version");
  const observedAt = need(str(raw.fetched_at), "fetched_at");
  if (Number.isNaN(Date.parse(observedAt))) throw new InvalidWorkerResponse("fetched_at is not a date");
  const account = isRec(raw.account) ? raw.account : null;
  const media = isRec(raw.media) ? raw.media : null;
  const insights = isRec(raw.insights) ? raw.insights : null;
  if (!account || !media || !insights || !Array.isArray(media.items) || !Array.isArray(account.metrics)) throw new InvalidWorkerResponse("missing account, media or insights");
  const accountId = need(str(account.id), "account.id");

  const base = (metric: CanonicalMetric, native: string, mediaId: string | null, period: Observation["period"], ref: string) => ({
    account_id: accountId,
    media_id: mediaId,
    provider: "instagram" as const,
    provider_api_version: apiVersion,
    metric_name: metric,
    native_metric_name: native,
    unit: UNITS[metric] ?? ("count" as const),
    period,
    observed_at: observedAt,
    baseline_definition: null,
    source_reference: ref,
  });
  const fromState = (value: unknown, state: unknown, reason: unknown) => {
    const availability = STATE[String(state)] ?? "ERROR";
    const v = num(value);
    // a VERIFIED state without a usable number is not verified
    if (availability === "VERIFIED" && v === null) return { value: null, availability_state: "UNAVAILABLE" as const, availability_reason: "no-numeric-value" };
    return { value: availability === "VERIFIED" ? v : null, availability_state: availability, availability_reason: availability === "VERIFIED" ? null : (str(reason)?.slice(0, 40) ?? null) };
  };

  const accountObs: Observation[] = [];
  for (const [field, metric] of [["followers_count", "followers"], ["media_count", "media_count"]] as const) {
    const entry = isRec(account[field]) ? (account[field] as Rec) : {};
    accountObs.push({ ...base(metric, field, null, "snapshot", `instagram:account#${field}`), ...fromState(entry.value, entry.state, null) });
  }
  for (const m of account.metrics) {
    if (!isRec(m)) continue;
    const native = str(m.name);
    const metric = native ? ACCOUNT_METRICS[native] : undefined;
    if (!native || !metric || m.window_days !== 28) continue;
    accountObs.push({ ...base(metric, native, null, "28d", `instagram:account/insights#${native}?period=day&metric_type=total_value&window=28d`), ...fromState(m.value, m.state, m.error_class) });
  }

  const posts: SocialPost[] = media.items.map((item): SocialPost => {
    if (!isRec(item)) throw new InvalidWorkerResponse("media item is not an object");
    const mediaId = need(str(item.id), "media id");
    const mediaType = str(item.media_type);
    const productType = str(item.media_product_type);
    const ins = isRec(item.insights) ? item.insights : {};
    const observations: Observation[] = [];
    for (const m of Array.isArray(ins.metrics) ? ins.metrics : []) {
      if (!isRec(m)) continue;
      const native = str(m.name);
      const metric = native ? MEDIA_METRICS[native] : undefined;
      if (!native || !metric) continue;
      observations.push({ ...base(metric, native, mediaId, "lifetime", `instagram:media/${mediaId}/insights#${native}`), ...fromState(m.value, m.state, m.error_class) });
    }
    for (const [field, metric] of [["like_count", "like_count_field"], ["comments_count", "comments_count_field"]] as const) {
      if (!(field in item)) continue;
      const v = num(item[field]);
      observations.push({
        ...base(metric, field, mediaId, "snapshot", `instagram:media/${mediaId}#${field}`),
        value: v,
        availability_state: v === null ? "UNAVAILABLE" : "VERIFIED",
        availability_reason: v === null ? "no-numeric-value" : null,
      });
    }
    const insightsState = ["ok", "partial", "unavailable", "error", "not_fetched"].includes(String(ins.state)) ? (ins.state as SocialPost["insights_state"]) : "error";
    const published = str(item.timestamp);
    return {
      media_id: mediaId,
      media_type: mediaType,
      media_product_type: productType,
      format: formatOf(mediaType, productType),
      caption: typeof item.caption === "string" ? item.caption : null,
      permalink: httpsOrNull(item.permalink),
      thumbnail_url: httpsOrNull(item.thumbnail_url),
      image_url: httpsOrNull(item.image_url),
      published_at: published && !Number.isNaN(Date.parse(published)) ? new Date(Date.parse(published)).toISOString() : null,
      insights_state: insightsState,
      observations,
    };
  });

  const budget = isRec(insights.budget) ? insights.budget : {};
  const mediaCount = accountObs.find((o) => o.metric_name === "media_count");
  const withInsights = posts.filter((p) => p.insights_state === "ok" || p.insights_state === "partial").length;
  return {
    provider: "instagram",
    provider_api_version: apiVersion,
    account_id: accountId,
    handle: str(account.username) ?? "",
    observed_at: observedAt,
    served_at: observedAt,
    coverage: {
      requested: num(media.requested_max),
      retrieved: posts.length,
      total_available: mediaCount?.availability_state === "VERIFIED" ? mediaCount.value : null,
      has_more: media.has_more === true,
      pages_fetched: num(media.pages_fetched),
      posts_with_insights: withInsights,
      posts_without_insights: posts.length - withInsights,
      budget_used: num(budget.used),
      budget_limit: num(budget.limit),
      insights_priority: insights.priority === "mature-first" ? "mature-first" : null,
      halted: str(insights.halted)?.slice(0, 40) ?? null,
      optional_fields: media.optional_fields_state === "ACCEPTED" ? "ACCEPTED" : "REJECTED_BY_META",
    },
    account: accountObs,
    posts,
  };
}
