/**
 * ANA World data contract (client-safe). GET /api/world returns one WorldPayload: the dashboard's own normalized
 * Instagram snapshot, a near-real-time counter pulse, Meta's aggregated audience geography, Jira work (when the
 * server has a Jira connection) and the operator-set place of Ana. Provider payloads never reach the browser.
 */
import type { PostFormat, SocialResult } from "@/features/social/types";
import type { StatusCategory } from "@/features/work/types";
import type { AnaLook } from "./looks";

/** How one source answered this read. A missing source is never shown as data. */
export type WorldSourceState = "ok" | "not-configured" | "unavailable" | "error" | "permission-required";

export interface WorldSourceStatus {
  state: WorldSourceState;
  /** short, non-secret reason (an error class or code), null when ok */
  reason: string | null;
  /** when the dashboard server last got a good answer from this source */
  fetched_at: string | null;
}

export interface PulseItem {
  id: string;
  published_at: string | null;
  like_count: number | null;
  comments_count: number | null;
}

export interface WorldPulse extends WorldSourceStatus {
  followers: number | null;
  media_count: number | null;
  items: PulseItem[];
}

export type AudienceSeriesState = "ok" | "unavailable" | "error" | "not_fetched";

export interface AudienceEntry {
  key: string;
  value: number;
}

export interface AudienceSeries {
  state: AudienceSeriesState;
  reason: string | null;
  results: AudienceEntry[];
}

export interface WorldAudience extends WorldSourceStatus {
  /** Meta timeframe of the demographics, e.g. "this_month" */
  timeframe: string | null;
  engaged_country: AudienceSeries;
  engaged_city: AudienceSeries;
  follower_country: AudienceSeries;
  follower_city: AudienceSeries;
  /** the last 7 days (Meta this_week); not_fetched from a worker that does not read it */
  engaged_country_week: AudienceSeries;
  engaged_city_week: AudienceSeries;
  /** who engaged or follows, for the whole account (Meta does not cross it with countries) */
  who: { engaged_week: WhoSeries; engaged_month: WhoSeries; follower: WhoSeries };
  /** days of stored audience snapshots, the base for later comparisons of posts and audience shifts */
  history: { days: number; since: string | null };
  /** follows and unfollows of the last 24 hours (Meta follows_and_unfollows, up to 48 h delayed; ANA-52) */
  follows: WorldFollows;
}

/**
 * How long people watch Ana's Reels and how many skip in the first 3 s (ANA-52): medians over the measured Reels of
 * the snapshot, and the stored value of the day before (null on the first day). Missing values are null, never 0.
 */
export interface WorldReelViewing {
  state: "on" | "off";
  /** Reels with a measured watch time */
  reels: number;
  watch_ms: number | null;
  /** percent 0-100 */
  skip_pct: number | null;
  previous: { day: string; watch_ms: number | null; skip_pct: number | null } | null;
  store_error: boolean;
}

export const REEL_VIEWING_OFF: WorldReelViewing = { state: "off", reels: 0, watch_ms: null, skip_pct: null, previous: null, store_error: false };

/** A side Meta did not return is null (unknown), never 0. */
export interface WorldFollows {
  state: AudienceSeriesState;
  reason: string | null;
  /** the window Meta was asked for */
  since: string | null;
  until: string | null;
  gained: number | null;
  lost: number | null;
}

/** age band ("25-34", "65+"), gender ("F", "M", "U" = not stated) and both ("25-34|F") */
export interface WhoSeries {
  age: AudienceSeries;
  gender: AudienceSeries;
  age_gender: AudienceSeries;
}

export interface WorldWorkIssue {
  key: string;
  summary: string;
  status: string;
  category: StatusCategory;
  assignee: string | null;
  url: string;
}

export interface WorldWork extends WorldSourceStatus {
  issues: WorldWorkIssue[];
}

export interface WorldPlace {
  label: string;
  lat: number;
  lon: number;
  /** IANA time zone of the place when the operator set one; null = local time is estimated from the longitude */
  tz: string | null;
}

export interface WorldRelease {
  /** commit of the running dashboard release, from the release directory name; null when not running from a release */
  sha: string | null;
  started_at: string;
}

import type { PostTags } from "./postTags";
import type { BriefRecord } from "./brief";
import type { WorldNewsletters } from "./newsletters";
import type { Locale } from "@/lib/locale";

export interface WorldPayload {
  version: 1;
  generated_at: string;
  instagram: SocialResult;
  pulse: WorldPulse;
  audience: WorldAudience;
  work: WorldWork;
  places: { ana: WorldPlace | null };
  /** what Ana's avatar wears: from her newest post, or picked by the team */
  ana_look: AnaLook;
  release: WorldRelease;
  /** categories of Ana's posts by media id (read by a model, see postTags.ts); state of the reader */
  post_tags: { state: "on" | "off"; tags: Record<string, PostTags> };
  /** office topics per post by media id (features/world/office.ts; [] = read, no topic); state of the reader */
  post_topics: { state: "on" | "off"; version: string; topics: Record<string, string[]>; failing: number };
  /** what popular Substack newsletters wrote about the office topics (features/world/newsletters.ts); "off" without a model key */
  newsletters: WorldNewsletters;
  /** Ana's last 200 posts with their lifetime saves, shares and reach, for the office board (older than the snapshot) */
  post_history: WorldPostHistory;
  /** median watch time and skip rate of Ana's Reels, with the day before (ANA-52) */
  reel_viewing: WorldReelViewing;
  /** whether "Was läuft" is written into the ANA Brain (once per Berlin day, see brainWriter.ts) */
  brain: WorldBrainSync;
  /** the brief "Das Wichtigste fürs Geschäft" (features/world/brief.ts); "off" without a model key */
  brief: WorldBriefState;
}

export interface WorldBriefState {
  state: "off" | "on" | "error";
  busy: boolean;
  /** the newest brief (button or weekly) per dashboard language */
  latest: Partial<Record<Locale, BriefRecord>>;
  /** the newest weekly brief per dashboard language */
  weekly: Partial<Record<Locale, BriefRecord>>;
  /** whether the newest week's brief is in the ANA Brain (the German one goes there) */
  in_brain: boolean;
  /** whether a Brain is configured at all */
  brain: boolean;
  reason: string | null;
}

export interface WorldBrainSync {
  state: "off" | "on" | "error";
  /** Berlin day of the last digest written */
  last_day: string | null;
  /** the week note it went into */
  note: string | null;
  reason: string | null;
}

/** One of Ana's last 200 posts; the numbers are read once the post is at least 7 days old (null until then). */
export interface WorldHistoryPost {
  id: string;
  published_at: string;
  format: PostFormat;
  /** cover on Meta's CDN, from today's list; null when unknown */
  cover: string | null;
  reach: number | null;
  saves: number | null;
  shares: number | null;
  /** (saves + shares) ÷ reach, only when all three are measured */
  ssr: number | null;
}

export interface WorldPostHistory {
  state: "on" | "off";
  /** when the full list was last read */
  fetched_at: string | null;
  /** posts in the list (her last 200) and the publication time of the oldest */
  total: number;
  oldest: string | null;
  /** the listed posts except those the snapshot measures itself (the board takes those from the snapshot) */
  posts: WorldHistoryPost[];
  /** posts at least 7 days old whose numbers are not read yet */
  waiting: number;
  /** the last list read failed or stopped early ("incomplete", "http-502", "timeout"…); null = fine */
  list_failing: string | null;
  /** the last numbers read failed; null = fine */
  numbers_failing: string | null;
  store_error: boolean;
}

export const POST_HISTORY_OFF: WorldPostHistory = { state: "off", fetched_at: null, total: 0, oldest: null, posts: [], waiting: 0, list_failing: null, numbers_failing: null, store_error: false };
