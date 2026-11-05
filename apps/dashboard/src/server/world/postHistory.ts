import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PostFormat } from "@/features/social/types";
import type { WorldHistoryPost, WorldPostHistory } from "@/features/world/types";
import { fetchWorkerJson } from "@/server/social/client";
import type { SocialConfig } from "@/server/social/config";
import { formatOf } from "@/server/social/normalize";
import { historyFile } from "./audienceHistory";
import type { TaggedPost } from "./tagger";

/**
 * Ana's last 200 posts for the office board (Ben, 2026-11-05): the snapshot reaches only her newest 50, too few for any
 * topic to be tested. Once a day the worker's /internal/media-history lists the posts; their lifetime saves, shares and
 * reach come from /internal/media-insights, 40 posts per call, once per post when it is at least 7 days old (lifetime
 * numbers of an older post hardly move). Stored: id, day, format and those three numbers. Covers and captions stay in
 * memory only (for the topic reader and the board) and come back with the next daily read.
 */

export const HISTORY_MAX = 200;
export const HISTORY_EVERY_MS = 24 * 3_600_000;
export const HISTORY_RETRY_MS = 3_600_000;
/** posts per insights call (the worker accepts up to 40) and the pause between two calls */
export const INSIGHTS_BATCH = 40;
export const INSIGHTS_GAP_MS = 2 * 60_000;
/** younger posts are still growing: their numbers come from the live snapshot, not from here */
export const MATURE_DAYS = 7;
/** a post Meta refused is asked again after this, at most INSIGHTS_TRIES times; one the worker did not reach after the
 * shorter pause; a failed or throttled call pauses all */
const INSIGHTS_RETRY_MS = 6 * 3_600_000;
const INSIGHTS_SKIPPED_MS = 20 * 60_000;
export const INSIGHTS_TRIES = 4;
const INSIGHTS_BLOCK_MS = 3_600_000;
const TIMEOUT_MS = 60_000;
const ID_RE = /^\d{1,30}$/;

interface StoredPost {
  published_at: string;
  format: PostFormat;
  /** null = not read yet (or not mature yet) */
  reach: number | null;
  saves: number | null;
  shares: number | null;
  /** when the numbers were settled; null = not yet */
  insights_at: string | null;
  /** answers so far that failed for this post (kept across restarts) */
  tries?: number;
  /** not asked again before this time (ISO; kept across restarts) */
  retry_at?: string;
}

interface StoreFile {
  version: 1;
  fetched_at: string | null;
  posts: Record<string, StoredPost>;
}

export function postHistoryFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(path.dirname(historyFile(env)), "world-post-history.json");
}

const FORMATS = new Set<PostFormat>(["reel", "carousel", "image", "video", "unknown"]);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The stored posts. Missing file = empty; anything that is not a store throws, so it is never overwritten. */
export async function readPostHistory(file: string): Promise<StoreFile> {
  const out: StoreFile = { version: 1, fetched_at: null, posts: Object.create(null) };
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw error;
  }
  const raw: unknown = JSON.parse(text);
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.posts)) throw new Error("not a post history store");
  out.fetched_at = typeof raw.fetched_at === "string" && Number.isFinite(Date.parse(raw.fetched_at)) ? raw.fetched_at : null;
  for (const [id, v] of Object.entries(raw.posts)) {
    if (!ID_RE.test(id) || !isObject(v) || typeof v.published_at !== "string" || !Number.isFinite(Date.parse(v.published_at))) continue;
    const format = typeof v.format === "string" && FORMATS.has(v.format as PostFormat) ? (v.format as PostFormat) : "unknown";
    const at = typeof v.insights_at === "string" && Number.isFinite(Date.parse(v.insights_at)) ? v.insights_at : null;
    const tries = typeof v.tries === "number" && Number.isInteger(v.tries) && v.tries > 0 ? v.tries : undefined;
    const retryAt = typeof v.retry_at === "string" && Number.isFinite(Date.parse(v.retry_at)) ? v.retry_at : undefined;
    out.posts[id] = { published_at: v.published_at, format, reach: num(v.reach), saves: num(v.saves), shares: num(v.shares), insights_at: at, ...(tries ? { tries } : {}), ...(retryAt ? { retry_at: retryAt } : {}) };
  }
  return out;
}

export interface HistoryItem {
  id: string;
  published_at: string;
  format: PostFormat;
  cover: string | null;
  caption: string | null;
}

/**
 * The worker's media-history answer, checked: items without an id or a time are skipped. `full` = the list is complete
 * (200 posts, or all she has); a list the worker stopped early (budget, throttle) is not, and must not prune the store.
 */
export function parseHistory(data: unknown): { items: HistoryItem[]; full: boolean } | null {
  const media = isObject(data) && isObject(data.media) ? data.media : null;
  if (!media || !Array.isArray(media.items)) return null;
  const out: HistoryItem[] = [];
  for (const m of media.items) {
    if (!isObject(m) || typeof m.id !== "string" || !ID_RE.test(m.id) || typeof m.timestamp !== "string") continue;
    const at = Date.parse(m.timestamp.replace(/\+0000$/, "Z"));
    if (!Number.isFinite(at)) continue;
    const str = (x: unknown) => (typeof x === "string" && x ? x : null);
    out.push({
      id: m.id,
      published_at: new Date(at).toISOString(),
      format: formatOf(str(m.media_type), str(m.media_product_type)),
      cover: httpsUrl(m.thumbnail_url) ?? httpsUrl(m.image_url),
      caption: typeof m.caption === "string" ? m.caption : null,
    });
  }
  const stopped = media.stopped === null || media.stopped === undefined ? null : media.stopped;
  // a malformed item makes the list incomplete too: pruning must never drop a post only because its item was unreadable
  const full = stopped === null && out.length === media.items.length && (out.length >= HISTORY_MAX || media.has_more === false);
  return { items: out, full };
}

const httpsUrl = (x: unknown): string | null => {
  if (typeof x !== "string" || !x) return null;
  try {
    return new URL(x).protocol === "https:" ? x : null;
  } catch {
    return null;
  }
};

/** Snapshot posts whose reach, saves and shares the snapshot itself measured (verified values). */
export function measuredIds(posts: ReadonlyArray<{ media_id: string; observations: ReadonlyArray<{ metric_name: string; availability_state: string; value: number | null }> }>): string[] {
  return posts
    .filter((p) => ["reach", "saves", "shares"].every((m) => p.observations.some((o) => o.metric_name === m && o.availability_state === "VERIFIED" && o.value !== null)))
    .map((p) => p.media_id);
}

export interface PostNumbers {
  reach: number | null;
  saves: number | null;
  shares: number | null;
  /** every one of reach, saves and shares came back measured or "does not apply": asking again would not change it */
  final: boolean;
  /** Meta refused something for this post (an error): counts as a try. Not fetched (budget, throttle) never does. */
  failed: boolean;
}

/** The worker's media-insights answer: reach, saves and shares per post that came back ok, partial or unavailable. */
export function parseInsights(data: unknown): Map<string, PostNumbers> {
  const out = new Map<string, PostNumbers>();
  const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
  for (const it of items) {
    if (!isObject(it) || typeof it.id !== "string" || !ID_RE.test(it.id) || !isObject(it.insights)) continue;
    const state = it.insights.state;
    if (state === "error") {
      out.set(it.id, { reach: null, saves: null, shares: null, final: false, failed: true });
      continue;
    }
    if (state === "not_fetched") {
      out.set(it.id, { reach: null, saves: null, shares: null, final: false, failed: false });
      continue;
    }
    if (state !== "ok" && state !== "partial" && state !== "unavailable") continue;
    const metrics = Array.isArray(it.insights.metrics) ? it.insights.metrics : [];
    const find = (name: string) => metrics.find((x) => isObject(x) && x.name === name) as Record<string, unknown> | undefined;
    const value = (name: string) => {
      const m = find(name);
      return m && m.state === "ok" ? num(m.value) : null;
    };
    const settled = (name: string) => {
      const m = find(name);
      return state === "unavailable" || (m !== undefined && (m.state === "ok" || m.state === "unavailable"));
    };
    const failed = ["reach", "saved", "shares"].some((n) => find(n)?.state === "error");
    out.set(it.id, { reach: value("reach"), saves: value("saved"), shares: value("shares"), final: ["reach", "saved", "shares"].every(settled), failed });
  }
  return out;
}

export interface PostHistory {
  current(): WorldPostHistory;
  /** covers and captions of the listed posts, for the topic reader (empty until the first read) */
  tagged(): TaggedPost[];
  /**
   * reads the list once a day and fills missing numbers in the background; never throws, never waits. `measured` = the
   * snapshot posts whose saves, shares and reach the snapshot itself measured (those are never asked here)
   */
  schedule(measured: readonly string[]): void;
  /** Instagram is down: no snapshot measures anything now, so the history's own numbers are sent for every post */
  noSnapshot(): void;
  /** test hook */
  idle(): Promise<void>;
}

export function createPostHistory(config: SocialConfig, file: string = postHistoryFile(), fetchImpl: typeof fetch = fetch, now: () => number = Date.now): PostHistory {
  const worker: SocialConfig = { ...config, timeoutMs: TIMEOUT_MS };
  let store: StoreFile = { version: 1, fetched_at: null, posts: Object.create(null) };
  let loaded: Promise<void> | null = null;
  let loadError = false;
  let running: Promise<void> = Promise.resolve();
  let busy = false;
  /** this run's list, newest first, with covers and captions (memory only) */
  let listed: HistoryItem[] = [];
  let listedAt = -Infinity;
  let listFailedAt = -Infinity;
  let lastInsightsAt = -Infinity;
  let insightsBlockedUntil = -Infinity;
  let listFailing: string | null = null;
  let numbersFailing: string | null = null;
  /** the snapshot posts the snapshot itself measured: their numbers are live there, so they are not read or sent here */
  let lastSnapshot: ReadonlySet<string> = new Set();

  const load = () =>
    (loaded ??= readPostHistory(file).then(
      (s) => {
        store = s;
        loadError = false;
      },
      (error: unknown) => {
        loaded = null;
        loadError = true;
        throw error;
      },
    ));

  async function save() {
    await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => undefined);
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
      await fs.rename(tmp, file);
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      console.warn(`[world] post history not saved: ${(error as NodeJS.ErrnoException).code ?? "error"}`);
    }
  }

  /** her newest 200 posts in the store (a partial list can add new ones before the next full list prunes the oldest) */
  const newest = () =>
    Object.entries(store.posts)
      .sort((a, b) => (a[1].published_at < b[1].published_at ? 1 : a[1].published_at > b[1].published_at ? -1 : 0))
      .slice(0, HISTORY_MAX);
  const mature = (p: StoredPost) => now() - Date.parse(p.published_at) >= MATURE_DAYS * 86_400_000;

  async function readList(): Promise<boolean> {
    // after a restart the list (covers, captions) is read again at once; otherwise once a day
    if (now() - listedAt < HISTORY_EVERY_MS) return false;
    if (now() - listFailedAt < HISTORY_RETRY_MS) return false;
    const r = await fetchWorkerJson(worker, `/internal/media-history?max=${HISTORY_MAX}`, fetchImpl);
    const parsed = r.ok ? parseHistory(r.data) : null;
    if (!parsed) {
      listFailedAt = now();
      listFailing = r.ok ? "invalid" : r.error.kind === "http" ? `http-${r.error.status}` : r.error.kind;
      return false;
    }
    const { items, full } = parsed;
    // a full list replaces the covers and captions; a partial one adds to them (the older ones stay usable)
    if (full) listed = items;
    else {
      const fresh = new Set(items.map((i) => i.id));
      listed = [...items, ...listed.filter((i) => !fresh.has(i.id))].sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0));
    }
    for (const it of items) {
      const had = store.posts[it.id];
      store.posts[it.id] = had ? { ...had, published_at: it.published_at, format: it.format } : { published_at: it.published_at, format: it.format, reach: null, saves: null, shares: null, insights_at: null };
    }
    if (!full) {
      // the worker stopped early: keep everything already known, try the whole list again in an hour
      listFailedAt = now();
      listFailing = "incomplete";
      return items.length > 0;
    }
    listFailing = null;
    listedAt = now();
    // only Ana's last 200 posts are kept
    const keep = new Set(items.map((i) => i.id));
    for (const id of Object.keys(store.posts)) if (!keep.has(id)) delete store.posts[id];
    store.fetched_at = new Date(now()).toISOString();
    return true;
  }

  async function readInsights(snapshot: ReadonlySet<string>): Promise<boolean> {
    if (now() - lastInsightsAt < INSIGHTS_GAP_MS || now() < insightsBlockedUntil) return false;
    const due = newest()
      .filter(([id, p]) => !snapshot.has(id) && p.insights_at === null && mature(p) && (!p.retry_at || now() >= Date.parse(p.retry_at)))
      .slice(0, INSIGHTS_BATCH)
      .map(([id]) => id);
    if (due.length === 0) {
      // nothing left to ask: an old failure is no longer news
      if (now() >= insightsBlockedUntil) numbersFailing = null;
      return false;
    }
    lastInsightsAt = now();
    const r = await fetchWorkerJson(worker, `/internal/media-insights?ids=${due.join(",")}`, fetchImpl);
    if (!r.ok) {
      // the whole call failed (worker, Meta identity, throttle): a pause for everyone, nothing counts against a post
      numbersFailing = r.error.kind === "http" ? `http-${r.error.status}` : r.error.kind;
      insightsBlockedUntil = now() + INSIGHTS_BLOCK_MS;
      return false;
    }
    const halted = isObject(r.data) && typeof r.data.halted === "string" ? r.data.halted : null;
    const got = parseInsights(r.data);
    if (!due.some((id) => got.has(id))) {
      // an answer without any of the asked posts: treated like a failed call
      numbersFailing = "invalid";
      insightsBlockedUntil = now() + INSIGHTS_BLOCK_MS;
      return false;
    }
    // Meta throttled the worker part way (rate limit or token): a pause for everyone, and the posts it hit count no try
    numbersFailing = halted;
    if (halted) insightsBlockedUntil = now() + INSIGHTS_BLOCK_MS;
    let changed = false;
    for (const id of due) {
      const v = got.get(id);
      const p = store.posts[id];
      if (!p) continue;
      // numbers that came back stay, also from earlier tries (never replaced by a later "not fetched")
      const merged = { reach: v?.reach ?? p.reach, saves: v?.saves ?? p.saves, shares: v?.shares ?? p.shares };
      if (v?.final) {
        const settled: StoredPost = { ...p, ...merged, insights_at: new Date(now()).toISOString() };
        delete settled.tries;
        delete settled.retry_at;
        store.posts[id] = settled;
        changed = true;
        continue;
      }
      // not final: only a refusal by Meta counts as a try (not one caused by a throttle); a post the worker did not
      // reach is asked again after a short pause
      const refused = Boolean(v?.failed) && !halted;
      const tries = (p.tries ?? 0) + (refused ? 1 : 0);
      const next: StoredPost = { ...p, ...merged, ...(tries ? { tries } : {}), retry_at: new Date(now() + (refused ? INSIGHTS_RETRY_MS : INSIGHTS_SKIPPED_MS)).toISOString() };
      if (tries >= INSIGHTS_TRIES) {
        next.insights_at = new Date(now()).toISOString();
        delete next.retry_at;
      }
      store.posts[id] = next;
      changed = true;
    }
    return changed;
  }

  async function run(snapshot: ReadonlySet<string>) {
    await load();
    const a = await readList();
    const b = await readInsights(snapshot);
    if (a || b) await save();
  }

  return {
    current() {
      const covers = new Map(listed.map((i) => [i.id, i.cover]));
      const top = newest();
      const posts: WorldHistoryPost[] = top
        .filter(([id]) => !lastSnapshot.has(id))
        .map(([id, p]) => ({
          id,
          published_at: p.published_at,
          format: p.format,
          cover: covers.get(id) ?? null,
          reach: p.reach,
          saves: p.saves,
          shares: p.shares,
          ssr: p.reach && p.saves !== null && p.shares !== null ? (p.saves + p.shares) / p.reach : null,
        }))
        .sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0));
      const waiting = top.filter(([id, p]) => !lastSnapshot.has(id) && p.insights_at === null && mature(p)).length;
      return { state: "on", fetched_at: store.fetched_at, total: top.length, oldest: top.at(-1)?.[1].published_at ?? null, posts, waiting, list_failing: listFailing, numbers_failing: numbersFailing, store_error: loadError };
    },
    tagged: () => listed.slice(0, HISTORY_MAX).map((i) => ({ id: i.id, cover: i.cover, caption: i.caption })),
    schedule(snapshotIds) {
      const snapshot = new Set(snapshotIds);
      lastSnapshot = snapshot;
      if (busy) return;
      busy = true;
      running = run(snapshot)
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    },
    noSnapshot() {
      lastSnapshot = new Set();
    },
    idle: () => running,
  };
}
