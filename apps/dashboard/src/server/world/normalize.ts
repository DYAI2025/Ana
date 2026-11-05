import "server-only";
import type { AudienceSeries, AudienceSeriesState, PulseItem, WhoSeries, WorldAudience, WorldContactTaps, WorldFollows, WorldOnlineHours, WorldReachSplit } from "@/features/world/types";
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
  engaged_country_week: AudienceSeries;
  engaged_city_week: AudienceSeries;
  who: WorldAudience["who"];
  follows: WorldFollows;
  reach_split: WorldReachSplit;
  contact_taps: WorldContactTaps;
  online: WorldOnlineHours;
}

const SERIES_STATES: readonly AudienceSeriesState[] = ["ok", "unavailable", "error", "not_fetched"];
export const MISSING_SERIES: AudienceSeries = { state: "not_fetched", reason: "not-returned", results: [] };
export const MISSING_WHO: WhoSeries = { age: MISSING_SERIES, gender: MISSING_SERIES, age_gender: MISSING_SERIES };

type Breakdown = "country" | "city" | "age" | "gender" | "age,gender";
const AGE = String.raw`\d{2}(?:-\d{2}|\+)`;
// a key that does not have the documented shape is dropped instead of guessed
const KEY_SHAPE: Record<Breakdown, RegExp | null> = {
  country: /^[A-Z]{2}$/,
  city: null,
  age: new RegExp(`^${AGE}$`),
  gender: /^[FMU]$/,
  "age,gender": new RegExp(`^${AGE}\\|[FMU]$`),
};

function series(metrics: readonly unknown[], name: string, breakdown: Breakdown, timeframe: "this_month" | "this_week"): AudienceSeries {
  // a worker before the timeframe-aware reads sent this_month only, with the timeframe field set
  const m = metrics.find((x) => isRec(x) && x.name === name && x.breakdown === breakdown && (x.timeframe ?? "this_month") === timeframe);
  if (!isRec(m)) return MISSING_SERIES;
  const state = SERIES_STATES.includes(m.state as AudienceSeriesState) ? (m.state as AudienceSeriesState) : "error";
  const shape = KEY_SHAPE[breakdown];
  const results = (Array.isArray(m.results) ? m.results : [])
    .filter(isRec)
    .map((r) => ({ key: str(r.key), value: count(r.value) }))
    .filter((r): r is { key: string; value: number } => r.key !== null && r.key.length <= 120 && r.value !== null)
    .filter((r) => shape === null || shape.test(r.key))
    .sort((a, b) => b.value - a.value)
    .slice(0, 45);
  if (state === "ok" && results.length === 0) return { state: "unavailable", reason: "empty-response", results: [] };
  return { state, reason: state === "ok" ? null : (str(m.error_class)?.slice(0, 40) ?? null), results: state === "ok" ? results : [] };
}

export const MISSING_FOLLOWS: WorldFollows = { state: "not_fetched", reason: "not-returned", since: null, until: null, gained: null, lost: null };
const secondsIso = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null);
const followCount = (results: unknown[], key: string): number | null => {
  const r = results.find((x) => isRec(x) && x.key === key);
  return r && isRec(r) && typeof r.value === "number" && Number.isInteger(r.value) && r.value >= 0 ? r.value : null;
};

/** follows_and_unfollows by follow type: FOLLOWER = followed, NON_FOLLOWER = unfollowed or left Instagram. */
function follows(raw: unknown): WorldFollows {
  if (!isRec(raw)) return MISSING_FOLLOWS;
  const state = SERIES_STATES.includes(raw.state as AudienceSeriesState) ? (raw.state as AudienceSeriesState) : "error";
  const window = { since: secondsIso(raw.since), until: secondsIso(raw.until) };
  if (state !== "ok") return { state, reason: str(raw.error_class)?.slice(0, 40) ?? null, ...window, gained: null, lost: null };
  const results = Array.isArray(raw.results) ? raw.results : [];
  const gained = followCount(results, "FOLLOWER");
  const lost = followCount(results, "NON_FOLLOWER");
  if (gained === null && lost === null) return { state: "unavailable", reason: "unknown-follow-types", ...window, gained: null, lost: null };
  return { state: "ok", reason: null, ...window, gained, lost };
}

export const MISSING_REACH_SPLIT: WorldReachSplit = { state: "not_fetched", reason: "not-returned", since: null, until: null, followers: null, non_followers: null };
export const MISSING_CONTACT_TAPS: WorldContactTaps = { state: "not_fetched", reason: "not-returned", total: null };
export const MISSING_ONLINE: WorldOnlineHours = { state: "not_fetched", reason: "not-returned", days: 0, utc_hours: Array(24).fill(null) };

const seriesState = (v: unknown): AudienceSeriesState => (SERIES_STATES.includes(v as AudienceSeriesState) ? (v as AudienceSeriesState) : "error");
const signal = (raw: unknown, name: string): Rec | null => (Array.isArray(raw) ? (raw.find((s) => isRec(s) && s.name === name) as Rec | undefined) ?? null : null);

/** reach by follow_type (ANA-56). A worker before ANA-56 sends no signals: not_fetched, never 0. */
function reachSplit(signals: unknown): WorldReachSplit {
  const s = signal(signals, "reach");
  if (!s || s.breakdown !== "follow_type") return MISSING_REACH_SPLIT;
  const state = seriesState(s.state);
  const window = { since: secondsIso(s.since), until: secondsIso(s.until) };
  if (state !== "ok") return { state, reason: str(s.error_class)?.slice(0, 40) ?? null, ...window, followers: null, non_followers: null };
  const results = Array.isArray(s.results) ? s.results : [];
  const followers = followCount(results, "FOLLOWER");
  const nonFollowers = followCount(results, "NON_FOLLOWER");
  if (followers === null || nonFollowers === null) return { state: "unavailable", reason: "missing-follow-type", ...window, followers: null, non_followers: null };
  return { state: "ok", reason: null, ...window, followers, non_followers: nonFollowers };
}

function contactTaps(signals: unknown): WorldContactTaps {
  const s = signal(signals, "profile_links_taps");
  if (!s) return MISSING_CONTACT_TAPS;
  const state = seriesState(s.state);
  if (state !== "ok") return { state, reason: str(s.error_class)?.slice(0, 40) ?? null, total: null };
  const total = count(s.total);
  return total === null ? { state: "unavailable", reason: "no-total", total: null } : { state: "ok", reason: null, total };
}

// Meta counts online_followers days and hours in US Pacific time (live 2026-11-05: end_time 07:00 UTC until 1 Nov,
// 08:00 UTC from 2 Nov, the end of US daylight saving time).
const PACIFIC_OFFSET = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" });
/** local minus UTC in ms ("GMT-7" → -7 h), null if the runtime gives no readable offset */
export function pacificOffsetMs(ms: number): number | null {
  const name = PACIFIC_OFFSET.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "";
  if (name === "GMT") return 0;
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000 : null;
}
const HOUR = 3_600_000;
/**
 * Mean followers online per UTC hour. A day ends at end_time (Pacific midnight); its start is end_time minus 24 h,
 * corrected by the offset change (25 h on the day daylight saving time ends, 23 h when it starts). Hour h is placed at
 * start + h hours; on those two days a few hours can land one hour off, which a mean over ~30 days absorbs.
 */
function onlineHours(raw: unknown): WorldOnlineHours {
  if (!isRec(raw)) return MISSING_ONLINE;
  const state = seriesState(raw.state);
  if (state !== "ok") return { ...MISSING_ONLINE, state, reason: str(raw.error_class)?.slice(0, 40) ?? null };
  const sum = Array<number>(24).fill(0);
  const n = Array<number>(24).fill(0);
  let days = 0;
  for (const d of (Array.isArray(raw.days) ? raw.days : []).slice(0, 31)) {
    if (!isRec(d) || !Array.isArray(d.hours) || d.hours.length !== 24) continue;
    const end = Date.parse(str(d.end_time) ?? "");
    if (Number.isNaN(end)) continue;
    const offEnd = pacificOffsetMs(end);
    const offStart = pacificOffsetMs(end - 24 * HOUR);
    if (offEnd === null || offStart === null) continue;
    const start = end - 24 * HOUR + offEnd - offStart;
    let used = false;
    d.hours.forEach((v, h) => {
      const c = count(v);
      if (c === null) return;
      const u = new Date(start + h * HOUR).getUTCHours();
      sum[u] = (sum[u] ?? 0) + c;
      n[u] = (n[u] ?? 0) + 1;
      used = true;
    });
    if (used) days += 1;
  }
  if (days === 0) return { ...MISSING_ONLINE, state: "unavailable", reason: "no-usable-day" };
  return { state: "ok", reason: null, days, utc_hours: sum.map((s, i) => { const k = n[i] ?? 0; return k ? Math.round(s / k) : null; }) };
}

/** Worker audience (audience_version 1) → four aggregated series. Never invents a value for a missing series. */
export function normalizeAudience(raw: unknown): NormalizedAudience {
  if (!isRec(raw) || raw.audience_version !== 1) throw new InvalidWorkerResponse("unsupported audience_version");
  const fetchedAt = isoOrNull(raw.fetched_at);
  if (!fetchedAt) throw new InvalidWorkerResponse("audience fetched_at is not a date");
  if (!Array.isArray(raw.metrics)) throw new InvalidWorkerResponse("audience metrics missing");
  const first = raw.metrics.find(isRec);
  const E = "engaged_audience_demographics";
  const F = "follower_demographics";
  return {
    fetched_at: fetchedAt,
    timeframe: first ? (str(first.timeframe)?.slice(0, 24) ?? null) : null,
    engaged_country: series(raw.metrics, E, "country", "this_month"),
    engaged_city: series(raw.metrics, E, "city", "this_month"),
    follower_country: series(raw.metrics, F, "country", "this_month"),
    follower_city: series(raw.metrics, F, "city", "this_month"),
    engaged_country_week: series(raw.metrics, E, "country", "this_week"),
    engaged_city_week: series(raw.metrics, E, "city", "this_week"),
    who: {
      engaged_week: { age: series(raw.metrics, E, "age", "this_week"), gender: series(raw.metrics, E, "gender", "this_week"), age_gender: series(raw.metrics, E, "age,gender", "this_week") },
      engaged_month: { age: series(raw.metrics, E, "age", "this_month"), gender: series(raw.metrics, E, "gender", "this_month"), age_gender: series(raw.metrics, E, "age,gender", "this_month") },
      follower: { age: series(raw.metrics, F, "age", "this_month"), gender: series(raw.metrics, F, "gender", "this_month"), age_gender: series(raw.metrics, F, "age,gender", "this_month") },
    },
    follows: follows(raw.follows),
    reach_split: reachSplit(raw.signals),
    contact_taps: contactTaps(raw.signals),
    online: onlineHours(raw.online_followers),
  };
}
