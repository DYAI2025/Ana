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
/** a post whose insights failed is asked again after this */
const INSIGHTS_RETRY_MS = 6 * 3_600_000;
const TIMEOUT_MS = 60_000;
const ID_RE = /^\d{1,30}$/;

interface StoredPost {
  published_at: string;
  format: PostFormat;
  /** null = not read yet (or not mature yet) */
  reach: number | null;
  saves: number | null;
  shares: number | null;
  /** when the numbers were read; null = not yet */
  insights_at: string | null;
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
    out.posts[id] = { published_at: v.published_at, format, reach: num(v.reach), saves: num(v.saves), shares: num(v.shares), insights_at: at };
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

/** The worker's media-history answer, checked: items without an id or a time are skipped. */
export function parseHistory(data: unknown): HistoryItem[] | null {
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
      cover: str(m.thumbnail_url) ?? str(m.image_url),
      caption: typeof m.caption === "string" ? m.caption : null,
    });
  }
  return out;
}

/** The worker's media-insights answer: reach, saves and shares per post that came back ok or partial. */
export function parseInsights(data: unknown): Map<string, { reach: number | null; saves: number | null; shares: number | null }> {
  const out = new Map<string, { reach: number | null; saves: number | null; shares: number | null }>();
  const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
  for (const it of items) {
    if (!isObject(it) || typeof it.id !== "string" || !ID_RE.test(it.id) || !isObject(it.insights)) continue;
    if (it.insights.state !== "ok" && it.insights.state !== "partial") continue;
    const metrics = Array.isArray(it.insights.metrics) ? it.insights.metrics : [];
    const value = (name: string) => {
      const m = metrics.find((x) => isObject(x) && x.name === name && x.state === "ok");
      return isObject(m) ? num(m.value) : null;
    };
    out.set(it.id, { reach: value("reach"), saves: value("saved"), shares: value("shares") });
  }
  return out;
}

export interface PostHistory {
  current(): WorldPostHistory;
  /** covers and captions of the listed posts, for the topic reader (empty until the first read) */
  tagged(): TaggedPost[];
  /** reads the list once a day and fills missing numbers in the background; never throws, never waits */
  schedule(snapshotIds: readonly string[]): void;
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
  let listFailedAt = -Infinity;
  let lastInsightsAt = -Infinity;
  const insightsFailedAt = new Map<string, number>();
  let failing: string | null = null;
  /** the posts of the latest snapshot: their numbers are live there, so they never wait here */
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

  const mature = (p: StoredPost) => now() - Date.parse(p.published_at) >= MATURE_DAYS * 86_400_000;

  async function readList(): Promise<boolean> {
    const fetched = store.fetched_at ? Date.parse(store.fetched_at) : -Infinity;
    if (listed.length > 0 && now() - fetched < HISTORY_EVERY_MS) return false;
    if (now() - listFailedAt < HISTORY_RETRY_MS) return false;
    const r = await fetchWorkerJson(worker, `/internal/media-history?max=${HISTORY_MAX}`, fetchImpl);
    const items = r.ok ? parseHistory(r.data) : null;
    if (!items) {
      listFailedAt = now();
      failing = r.ok ? "invalid" : r.error.kind === "http" ? `http-${r.error.status}` : r.error.kind;
      return false;
    }
    failing = null;
    listed = items;
    const keep = new Set(items.map((i) => i.id));
    for (const it of items) {
      const had = store.posts[it.id];
      store.posts[it.id] = had ? { ...had, published_at: it.published_at, format: it.format } : { published_at: it.published_at, format: it.format, reach: null, saves: null, shares: null, insights_at: null };
    }
    // only Ana's last 200 posts are kept
    for (const id of Object.keys(store.posts)) if (!keep.has(id)) delete store.posts[id];
    store.fetched_at = new Date(now()).toISOString();
    return true;
  }

  async function readInsights(snapshot: ReadonlySet<string>): Promise<boolean> {
    if (now() - lastInsightsAt < INSIGHTS_GAP_MS) return false;
    const due = Object.entries(store.posts)
      .filter(([id, p]) => !snapshot.has(id) && p.insights_at === null && mature(p) && now() - (insightsFailedAt.get(id) ?? -Infinity) >= INSIGHTS_RETRY_MS)
      .sort((a, b) => (a[1].published_at < b[1].published_at ? 1 : -1))
      .slice(0, INSIGHTS_BATCH)
      .map(([id]) => id);
    if (due.length === 0) return false;
    lastInsightsAt = now();
    const r = await fetchWorkerJson(worker, `/internal/media-insights?ids=${due.join(",")}`, fetchImpl);
    if (!r.ok) {
      failing = r.error.kind === "http" ? `http-${r.error.status}` : r.error.kind;
      return false;
    }
    failing = null;
    const got = parseInsights(r.data);
    let changed = false;
    for (const id of due) {
      const v = got.get(id);
      const p = store.posts[id];
      if (!p) continue;
      if (!v) {
        insightsFailedAt.set(id, now());
        continue;
      }
      store.posts[id] = { ...p, ...v, insights_at: new Date(now()).toISOString() };
      insightsFailedAt.delete(id);
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
      const posts: WorldHistoryPost[] = Object.entries(store.posts)
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
      const waiting = Object.entries(store.posts).filter(([id, p]) => !lastSnapshot.has(id) && p.insights_at === null && mature(p)).length;
      return { state: "on", fetched_at: store.fetched_at, posts, waiting, failing, store_error: loadError };
    },
    tagged: () => listed.map((i) => ({ id: i.id, cover: i.cover, caption: i.caption })),
    schedule(snapshotIds) {
      if (busy) return;
      busy = true;
      const snapshot = new Set(snapshotIds);
      lastSnapshot = snapshot;
      running = run(snapshot)
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    },
    idle: () => running,
  };
}
