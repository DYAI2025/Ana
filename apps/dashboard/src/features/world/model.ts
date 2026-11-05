/**
 * Pure world model: turns one WorldPayload into what the scene and the panel draw, and compares two payloads to find
 * real counter changes. No randomness, no invented values: a missing number stays null.
 */
import type { CanonicalMetric, PostFormat, SocialPost } from "@/features/social/types";
import { cockpitStateOf } from "@/features/social/state";
import type { AudienceEntry, AudienceSeries, WhoSeries, WorldPayload } from "./types";

export type ChannelId = "instagram" | "substack" | "tiktok" | "youtube" | "facebook";

export interface ChannelDef {
  id: ChannelId;
  label: string;
  /** ring colour in the scene */
  color: number;
}

/** The orbit shows at most this many posts (the newest first); every count of "posts in the orbit" uses orbitCount(). */
export const ORBIT_MAX = 30;

export function orbitCount(posts: readonly unknown[]): number {
  return Math.min(ORBIT_MAX, posts.length);
}

/** Same order as the ANA-42 channel picker. Only Instagram has an adapter today. */
export const CHANNELS: readonly ChannelDef[] = [
  { id: "instagram", label: "Instagram", color: 0xd8566f },
  { id: "substack", label: "Substack", color: 0xe0823a },
  { id: "tiktok", label: "TikTok", color: 0x3fb8c4 },
  { id: "youtube", label: "YouTube", color: 0xc9473b },
  { id: "facebook", label: "Facebook", color: 0x4a6fc2 },
];

export type ChannelStatus = "live" | "loading" | "stale" | "empty" | "error" | "permission" | "not-connected";

export interface WorldPost {
  id: string;
  format: PostFormat;
  caption: string | null;
  permalink: string | null;
  published_at: string | null;
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  interactions: number | null;
  /** public counters: from the pulse when it knows the post (newer), else from the snapshot */
  likes: number | null;
  comments: number | null;
  counters_at: string | null;
  /** interactions ÷ reach, only when both are measured */
  er: number | null;
  /**
   * (saves + shares) ÷ reach, only when all three are measured: people who keep or pass a post on — a closer hint for
   * long-form reading (Substack) than a like
   */
  ssr: number | null;
  /** Reels only: average watch time in seconds and the share of views skipped in the first 3 s (0-1), when measured */
  watchSeconds?: number | null;
  skipRate?: number | null;
  /** true when the post is in the pulse but not yet in the snapshot (no insights yet) */
  fresh: boolean;
  /** cover picture on Meta's CDN (video thumbnail or photo), null when unknown */
  cover?: string | null;
  /** one of Ana's older posts from the history list (not in the world view, so it cannot be opened there) */
  history?: boolean;
}

export interface ChannelView {
  def: ChannelDef;
  status: ChannelStatus;
  handle: string | null;
  followers: number | null;
  followers_source: "pulse" | "snapshot" | null;
  media_count: number | null;
  reach28: number | null;
  views28: number | null;
  engaged28: number | null;
  interactions28: number | null;
  observed_at: string | null;
  posts: WorldPost[];
  /** median ER of the posts that have one (null below 3 posts: too few to compare) */
  erMedian: number | null;
}

const value = (post: SocialPost, metric: CanonicalMetric): number | null => {
  const o = post.observations.find((x) => x.metric_name === metric && x.availability_state === "VERIFIED");
  return o?.value ?? null;
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

function statusOf(world: WorldPayload): ChannelStatus {
  const state = cockpitStateOf(world.instagram);
  switch (state) {
    case "CONNECTED":
      return "live";
    case "STALE":
      return "stale";
    case "EMPTY":
      return "empty";
    case "PERMISSION_REQUIRED":
      return "permission";
    case "LOADING":
      return "loading";
    default:
      return "error";
  }
}

export function instagramView(world: WorldPayload): ChannelView {
  const def = CHANNELS[0] as ChannelDef;
  const snapshot = world.instagram.ok ? world.instagram.snapshot : null;
  const pulseById = new Map(world.pulse.items.map((p) => [p.id, p]));
  const pulseAt = world.pulse.fetched_at;
  const posts: WorldPost[] = (snapshot?.posts ?? []).map((p) => {
    const live = pulseById.get(p.media_id);
    const reach = value(p, "reach");
    const interactions = value(p, "total_interactions");
    const likes = live?.like_count ?? value(p, "like_count_field") ?? value(p, "likes");
    const comments = live?.comments_count ?? value(p, "comments_count_field") ?? value(p, "comments");
    return {
      id: p.media_id,
      format: p.format,
      caption: p.caption,
      permalink: p.permalink,
      published_at: p.published_at,
      reach,
      views: value(p, "views"),
      saves: value(p, "saves"),
      shares: value(p, "shares"),
      interactions,
      likes,
      comments,
      counters_at: live ? pulseAt : (snapshot?.observed_at ?? null),
      er: reach && interactions !== null ? interactions / reach : null,
      ssr: reach && value(p, "saves") !== null && value(p, "shares") !== null ? ((value(p, "saves") as number) + (value(p, "shares") as number)) / reach : null,
      fresh: false,
      cover: p.thumbnail_url ?? p.image_url ?? null,
      watchSeconds: value(p, "avg_watch_time") === null ? null : (value(p, "avg_watch_time") as number) / 1000,
      skipRate: value(p, "skip_rate") === null ? null : (value(p, "skip_rate") as number) / 100,
    };
  });
  const known = new Set(posts.map((p) => p.id));
  for (const live of world.pulse.items) {
    if (known.has(live.id)) continue;
    posts.push({ id: live.id, format: "unknown", caption: null, permalink: null, published_at: live.published_at, reach: null, views: null, saves: null, shares: null, interactions: null, likes: live.like_count, comments: live.comments_count, counters_at: pulseAt, er: null, ssr: null, fresh: true });
  }
  posts.sort((a, b) => Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? "") || a.id.localeCompare(b.id));
  const account = (metric: CanonicalMetric) => snapshot?.account.find((o) => o.metric_name === metric && o.availability_state === "VERIFIED")?.value ?? null;
  const ers = posts.map((p) => p.er).filter((x): x is number => x !== null);
  const pulseFollowers = world.pulse.state === "ok" ? world.pulse.followers : null;
  return {
    def,
    status: statusOf(world),
    handle: snapshot?.handle ?? null,
    followers: pulseFollowers ?? account("followers"),
    followers_source: pulseFollowers !== null ? "pulse" : account("followers") !== null ? "snapshot" : null,
    media_count: world.pulse.media_count ?? account("media_count"),
    reach28: account("reach"),
    views28: account("views"),
    engaged28: account("accounts_engaged"),
    interactions28: account("total_interactions"),
    observed_at: snapshot?.observed_at ?? null,
    posts,
    erMedian: ers.length >= 3 ? median(ers) : null,
  };
}

export function channelStatuses(world: WorldPayload): Array<{ def: ChannelDef; status: ChannelStatus }> {
  const ig = statusOf(world);
  return CHANNELS.map((def) => ({ def, status: def.id === "instagram" ? ig : "not-connected" }));
}

export interface PulseEvent {
  kind: "likes" | "comments" | "new-post" | "followers";
  postId: string | null;
  delta: number;
  at: string;
}

/**
 * Real changes between two consecutive world reads. Only counters both reads measured are compared; a counter that
 * disappears or appears is not a change. A post is new when the newer pulse has it and the older pulse did not, and
 * it is younger than the older read (so a longer list is not mistaken for new posts).
 */
export function pulseEvents(prev: WorldPayload | null, next: WorldPayload): PulseEvent[] {
  if (!prev || prev.pulse.state !== "ok" || next.pulse.state !== "ok" || !next.pulse.fetched_at || prev.pulse.fetched_at === next.pulse.fetched_at) return [];
  const at = next.pulse.fetched_at;
  const before = new Map(prev.pulse.items.map((p) => [p.id, p]));
  const prevAt = Date.parse(prev.pulse.fetched_at ?? "");
  const out: PulseEvent[] = [];
  for (const item of next.pulse.items) {
    const old = before.get(item.id);
    if (!old) {
      const published = Date.parse(item.published_at ?? "");
      if (Number.isFinite(published) && Number.isFinite(prevAt) && published > prevAt - 120_000) out.push({ kind: "new-post", postId: item.id, delta: 1, at });
      continue;
    }
    if (old.like_count !== null && item.like_count !== null && item.like_count !== old.like_count) out.push({ kind: "likes", postId: item.id, delta: item.like_count - old.like_count, at });
    if (old.comments_count !== null && item.comments_count !== null && item.comments_count !== old.comments_count) out.push({ kind: "comments", postId: item.id, delta: item.comments_count - old.comments_count, at });
  }
  if (prev.pulse.followers !== null && next.pulse.followers !== null && next.pulse.followers !== prev.pulse.followers) out.push({ kind: "followers", postId: null, delta: next.pulse.followers - prev.pulse.followers, at });
  return out;
}

export interface ShareEntry extends AudienceEntry {
  share: number;
}

/** Shares of an aggregated audience series; the total is the sum of the returned top entries (Meta's top 45). */
export function shares(series: AudienceSeries): ShareEntry[] {
  if (series.state !== "ok") return [];
  const total = series.results.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return [];
  return series.results.map((r) => ({ ...r, share: r.value / total }));
}

/** A country's share in the last 7 days counts as rising/falling against the 30 days from this many points on. */
export const TREND_POINTS = 2;

/** Week share minus month share in percentage points per country, only where both are known. */
export function trends(week: AudienceSeries, month: AudienceSeries): Map<string, number> {
  const w = shares(week);
  const m = new Map(shares(month).map((r) => [r.key, r.share]));
  const out = new Map<string, number>();
  for (const r of w) {
    const before = m.get(r.key);
    if (before !== undefined) out.set(r.key, Math.round((r.share - before) * 1000) / 10);
  }
  return out;
}

export interface WhoRow {
  band: string;
  /** shares of the whole series (0..1) */
  f: number;
  m: number;
  u: number;
}
export type WhoView =
  | { mode: "pyramid"; rows: WhoRow[]; max: number }
  | { mode: "split"; ages: Array<{ band: string; share: number }>; gender: { f: number; m: number; u: number } | null }
  | null;

const bandStart = (b: string) => Number.parseInt(b, 10);

/** Age × gender as a pyramid when Meta gave both together, else age bands and a gender split side by side. */
export function whoView(w: WhoSeries): WhoView {
  if (w.age_gender.state === "ok") {
    const total = w.age_gender.results.reduce((s, r) => s + r.value, 0);
    if (total > 0) {
      const rows = new Map<string, WhoRow>();
      for (const r of w.age_gender.results) {
        const [band, g] = r.key.split("|");
        if (!band || !g) continue;
        const row = rows.get(band) ?? { band, f: 0, m: 0, u: 0 };
        if (g === "F") row.f += r.value / total;
        else if (g === "M") row.m += r.value / total;
        else row.u += r.value / total;
        rows.set(band, row);
      }
      const list = [...rows.values()].sort((a, b) => bandStart(b.band) - bandStart(a.band));
      return { mode: "pyramid", rows: list, max: Math.max(0.0001, ...list.map((r) => Math.max(r.f, r.m))) };
    }
  }
  const ages = shares(w.age)
    .map((r) => ({ band: r.key, share: r.share }))
    .sort((a, b) => bandStart(b.band) - bandStart(a.band));
  const g = shares(w.gender);
  const gender = g.length ? { f: g.find((r) => r.key === "F")?.share ?? 0, m: g.find((r) => r.key === "M")?.share ?? 0, u: g.find((r) => r.key === "U")?.share ?? 0 } : null;
  if (!ages.length && !gender) return null;
  return { mode: "split", ages, gender };
}
