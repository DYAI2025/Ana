import "server-only";
import type { AudienceSeries, AudienceSeriesState, PulseItem } from "@/features/world/types";
import { InvalidWorkerResponse } from "@/server/social/normalize";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const isoOrNull = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : null;
};

export interface NormalizedPulse {
  fetched_at: string;
  followers: number | null;
  media_count: number | null;
  items: PulseItem[];
}

/** Worker pulse (pulse_version 1) → dashboard shape. Counters that are not plain non-negative numbers become null. */
export function normalizePulse(raw: unknown): NormalizedPulse {
  if (!isRec(raw) || raw.pulse_version !== 1) throw new InvalidWorkerResponse("unsupported pulse_version");
  const fetchedAt = isoOrNull(raw.fetched_at);
  if (!fetchedAt) throw new InvalidWorkerResponse("pulse fetched_at is not a date");
  if (!Array.isArray(raw.items)) throw new InvalidWorkerResponse("pulse items missing");
  const account = isRec(raw.account) ? raw.account : {};
  const items: PulseItem[] = [];
  for (const item of raw.items.slice(0, 25)) {
    if (!isRec(item)) continue;
    const id = str(item.id);
    if (!id || id.length > 40) continue;
    items.push({ id, published_at: isoOrNull(item.timestamp), like_count: count(item.like_count), comments_count: count(item.comments_count) });
  }
  return { fetched_at: fetchedAt, followers: count(account.followers_count), media_count: count(account.media_count), items };
}

export interface NormalizedAudience {
  fetched_at: string;
  timeframe: string | null;
  engaged_country: AudienceSeries;
  engaged_city: AudienceSeries;
  follower_country: AudienceSeries;
  follower_city: AudienceSeries;
}

const SERIES_STATES: readonly AudienceSeriesState[] = ["ok", "unavailable", "error", "not_fetched"];
export const MISSING_SERIES: AudienceSeries = { state: "not_fetched", reason: "not-returned", results: [] };

function series(metrics: readonly unknown[], name: string, breakdown: "country" | "city"): AudienceSeries {
  const m = metrics.find((x) => isRec(x) && x.name === name && x.breakdown === breakdown);
  if (!isRec(m)) return MISSING_SERIES;
  const state = SERIES_STATES.includes(m.state as AudienceSeriesState) ? (m.state as AudienceSeriesState) : "error";
  const results = (Array.isArray(m.results) ? m.results : [])
    .filter(isRec)
    .map((r) => ({ key: str(r.key), value: count(r.value) }))
    .filter((r): r is { key: string; value: number } => r.key !== null && r.key.length <= 120 && r.value !== null)
    // a country key must be an ISO 3166-1 alpha-2 code; anything else is dropped instead of guessed
    .filter((r) => breakdown !== "country" || /^[A-Z]{2}$/.test(r.key))
    .sort((a, b) => b.value - a.value)
    .slice(0, 45);
  if (state === "ok" && results.length === 0) return { state: "unavailable", reason: "empty-response", results: [] };
  return { state, reason: state === "ok" ? null : (str(m.error_class)?.slice(0, 40) ?? null), results: state === "ok" ? results : [] };
}

/** Worker audience (audience_version 1) → four aggregated series. Never invents a value for a missing series. */
export function normalizeAudience(raw: unknown): NormalizedAudience {
  if (!isRec(raw) || raw.audience_version !== 1) throw new InvalidWorkerResponse("unsupported audience_version");
  const fetchedAt = isoOrNull(raw.fetched_at);
  if (!fetchedAt) throw new InvalidWorkerResponse("audience fetched_at is not a date");
  if (!Array.isArray(raw.metrics)) throw new InvalidWorkerResponse("audience metrics missing");
  const first = raw.metrics.find(isRec);
  return {
    fetched_at: fetchedAt,
    timeframe: first ? (str(first.timeframe)?.slice(0, 24) ?? null) : null,
    engaged_country: series(raw.metrics, "engaged_audience_demographics", "country"),
    engaged_city: series(raw.metrics, "engaged_audience_demographics", "city"),
    follower_country: series(raw.metrics, "follower_demographics", "country"),
    follower_city: series(raw.metrics, "follower_demographics", "city"),
  };
}
