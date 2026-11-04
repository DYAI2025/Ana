import "server-only";
import type { SocialFailure, SocialResult } from "@/features/social/types";
import type { WorkSnapshot } from "@/features/work/types";
import type { WorldAudience, WorldPayload, WorldPulse, WorldSourceState, WorldWork, WorldWorkIssue } from "@/features/world/types";
import { fetchWorkerJson, type WorkerResponse } from "@/server/social/client";
import type { SocialConfig } from "@/server/social/config";
import { InvalidWorkerResponse } from "@/server/social/normalize";
import { NOT_CONFIGURED, workerFailure, type SnapshotService } from "@/server/social/service";
import { MISSING_SERIES, MISSING_WHO, normalizeAudience, normalizePulse, type NormalizedAudience, type NormalizedPulse } from "./normalize";
import { resolveLook, type ImageLook, type ManualLook, type NewestPost } from "@/features/world/looks";
import type { VisionReader } from "./vision";
import { readAnaPlace, readRelease } from "./presence";
import { historyEntry, type HistoryEntry } from "./audienceHistory";
import type { PostTagger } from "./tagger";
import type { TopicTagger } from "./topicTagger";
import type { NewsletterReader } from "./newsletterReader";
import { NEWSLETTERS_OFF } from "@/features/world/newsletters";
import { OFFICE_VERSION } from "@/features/world/office";
import type { BrainWriter } from "./brainWriter";
import type { BriefService } from "./briefService";
import type { PostTags } from "@/features/world/postTags";

export const PULSE_PATH = "/internal/social-pulse";
export const AUDIENCE_PATH = "/internal/social-audience";

export interface WorldTimings {
  /** a good pulse is reused this long (default 60 s): the "near real time" of the world */
  pulseMs: number;
  /** demographics are delayed up to 48 h by Meta; one read every 6 h is plenty */
  audienceMs: number;
  /** after a failure the source is asked again at the earliest after this */
  retryMs: number;
  /** Jira projection reuse (default 120 s) */
  workMs: number;
}

export const DEFAULT_TIMINGS: WorldTimings = { pulseMs: 60_000, audienceMs: 6 * 3_600_000, retryMs: 60_000, workMs: 120_000 };

export interface WorldDeps {
  social: SnapshotService | null;
  socialConfig: SocialConfig | null;
  /** one Jira read; null when the server has no Jira connection */
  readWork: (() => Promise<{ ok: true; snapshot: WorkSnapshot } | { ok: false; failure: { code: string } }>) | null;
  /** issue keys the world always shows when Jira knows them */
  workKeys: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timings?: Partial<WorldTimings>;
  /** the stored manual look pick; absent = none */
  readManual?: () => Promise<ManualLook | null>;
  /** the vision model on the newest post's cover image; absent = not configured */
  vision?: VisionReader | null;
  /** how long one read waits for the vision answer before answering without it (the next read has it) */
  visionWaitMs?: number;
  /** the stored daily audience snapshots; absent = not kept */
  history?: { read: () => Promise<HistoryEntry[]>; record: (entry: HistoryEntry) => Promise<HistoryEntry[]> } | null;
  /** categories of the posts, read in the background; absent = off */
  tagger?: PostTagger | null;
  /** office topics of the posts, read in the background; absent = off */
  topicTagger?: TopicTagger | null;
  /** popular newsletters' RSS feeds matched to the office topics, read in the background; absent = off */
  newsletters?: NewsletterReader | null;
  /** writes the daily "Was läuft" digest into the Brain; null when no Brain key is configured */
  brain?: BrainWriter | null;
  /** the brief (button and weekly); null without a model key */
  brief?: BriefService | null;
}

type Load<T> = { ok: true; value: T } | { ok: false; state: WorldSourceState; reason: string };

/** A source read with a reuse window for good answers and a back-off after failures; one in-flight read is shared. */
function cachedSource<T>(load: () => Promise<Load<T>>, goodMs: () => number, retryMs: () => number, now: () => number) {
  let good: { value: T; at: number } | null = null;
  let lastFailure: { state: WorldSourceState; reason: string; at: number } | null = null;
  let inFlight: Promise<void> | null = null;
  return async (): Promise<{ value: T | null; failure: { state: WorldSourceState; reason: string } | null; at: number | null }> => {
    const t = now();
    const fresh = good !== null && t - good.at < goodMs();
    const backingOff = lastFailure !== null && t - lastFailure.at < retryMs();
    if (!fresh && !backingOff) {
      if (!inFlight) {
        inFlight = load()
          .catch((): Load<T> => ({ ok: false, state: "error", reason: "unexpected" }))
          .then((r) => {
            if (r.ok) {
              good = { value: r.value, at: now() };
              lastFailure = null;
            } else lastFailure = { state: r.state, reason: r.reason, at: now() };
          })
          .finally(() => {
            inFlight = null;
          });
      }
      await inFlight;
    }
    return { value: good?.value ?? null, failure: lastFailure ? { state: lastFailure.state, reason: lastFailure.reason } : null, at: good?.at ?? null };
  };
}

function failureOf(response: Extract<WorkerResponse, { ok: false }>): { state: WorldSourceState; reason: string } {
  // a 404 means the worker does not offer this read yet (older deployment): not an error of the dashboard
  if (response.error.kind === "http" && response.error.status === 404) return { state: "unavailable", reason: "worker-route-missing" };
  const f: SocialFailure = workerFailure(response.error);
  return { state: f.state === "PERMISSION_REQUIRED" ? "permission-required" : "error", reason: f.code };
}

async function readWorker<T>(config: SocialConfig, path: string, fetchImpl: typeof fetch, normalize: (raw: unknown) => T): Promise<Load<T>> {
  const response = await fetchWorkerJson(config, path, fetchImpl);
  if (!response.ok) return { ok: false, ...failureOf(response) };
  try {
    return { ok: true, value: normalize(response.data) };
  } catch (error) {
    return { ok: false, state: "error", reason: error instanceof InvalidWorkerResponse ? "invalid-response" : "unreadable" };
  }
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function slimWork(snapshot: WorkSnapshot, keys: readonly string[]): WorldWorkIssue[] {
  const wanted = new Set(keys);
  return [...snapshot.issues, ...snapshot.unmapped]
    .filter((i) => wanted.has(i.key) || i.status.category === "indeterminate")
    .slice(0, 40)
    .map((i) => ({ key: i.key, summary: i.summary.slice(0, 140), status: i.status.name, category: i.status.category, assignee: i.assignee?.displayName ?? null, url: i.url }));
}

export interface WorldService {
  read(): Promise<WorldPayload>;
}

export function createWorldService(deps: WorldDeps): WorldService {
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timings = { ...DEFAULT_TIMINGS, ...deps.timings };
  const env = deps.env ?? process.env;
  const config = deps.socialConfig;

  const pulse = cachedSource<NormalizedPulse>(
    () => (config ? readWorker(config, `${PULSE_PATH}?max=12`, fetchImpl, normalizePulse) : Promise.resolve({ ok: false, state: "not-configured", reason: "not-configured" })),
    () => timings.pulseMs,
    () => timings.retryMs,
    now,
  );
  const audience = cachedSource<NormalizedAudience>(
    () => (config ? readWorker(config, AUDIENCE_PATH, fetchImpl, normalizeAudience) : Promise.resolve({ ok: false, state: "not-configured", reason: "not-configured" })),
    () => timings.audienceMs,
    () => Math.max(timings.retryMs, 10 * 60_000),
    now,
  );
  const work = cachedSource<WorldWorkIssue[]>(
    async () => {
      if (!deps.readWork) return { ok: false, state: "not-configured", reason: "not-configured" };
      const r = await deps.readWork();
      return r.ok ? { ok: true, value: slimWork(r.snapshot, deps.workKeys) } : { ok: false, state: "error", reason: r.failure.code };
    },
    () => timings.workMs,
    () => timings.retryMs,
    now,
  );

  // days of stored audience snapshots; the entry of an audience read is stored once
  let historyMeta: { days: number; since: string | null } | null = null;
  let recordedFetch: string | null = null;
  const summarize = (all: HistoryEntry[]) => ({ days: all.length, since: all[0]?.day ?? null });
  async function keepHistory(audience: NormalizedAudience | null, posts: ReadonlyArray<{ id: string; format: string; published_at: string | null; tags: PostTags | null }>) {
    const h = deps.history;
    if (!h) return { days: 0, since: null };
    try {
      if (historyMeta === null) historyMeta = summarize(await h.read());
      if (audience && audience.fetched_at !== recordedFetch) {
        const week = { country: audience.engaged_country_week, age: audience.who.engaged_week.age, gender: audience.who.engaged_week.gender };
        const entry = historyEntry(now(), audience.fetched_at, week, posts);
        recordedFetch = audience.fetched_at;
        if (entry) historyMeta = summarize(await h.record(entry));
      }
    } catch {
      // the history is a convenience: a full disk never breaks the world
    }
    return historyMeta ?? { days: 0, since: null };
  }

  return {
    async read() {
      const readAt = new Date(now()).toISOString();
      const instagramPromise: Promise<SocialResult> = deps.social ? deps.social.read() : Promise.resolve({ ok: false, failure: NOT_CONFIGURED });
      const [instagram, p, a, w, manual] = await Promise.all([instagramPromise, pulse(), audience(), work(), deps.readManual ? deps.readManual().catch(() => null) : Promise.resolve(null)]);
      const newestRaw = instagram.ok
        ? [...instagram.snapshot.posts].filter((x) => x.published_at).sort((x, y) => Date.parse(y.published_at ?? "") - Date.parse(x.published_at ?? ""))[0] ?? null
        : null;
      const newest: NewestPost | null = newestRaw ? { id: newestRaw.media_id, published_at: newestRaw.published_at, permalink: newestRaw.permalink, caption: newestRaw.caption } : null;
      const vision = deps.vision;
      // the cover of a video, or the picture of a photo post / carousel
      const cover = newestRaw ? (newestRaw.thumbnail_url ?? newestRaw.image_url ?? null) : null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const image: ImageLook | null =
        newestRaw && cover && vision
          ? await Promise.race([vision.read(newestRaw.media_id, cover).catch(() => null), new Promise<null>((r) => (timer = setTimeout(() => r(null), deps.visionWaitMs ?? 3_000)))]).finally(() => clearTimeout(timer))
          : null;
      const imageReader = !vision ? "off" : newestRaw && !cover ? "no-cover" : "on";

      const pulseOut: WorldPulse = {
        state: p.value ? "ok" : (p.failure?.state ?? "unavailable"),
        reason: p.value ? null : (p.failure?.reason ?? null),
        fetched_at: p.value ? p.value.fetched_at : null,
        followers: p.value?.followers ?? null,
        media_count: p.value?.media_count ?? null,
        items: p.value?.items ?? [],
      };
      // an older good pulse is still shown, but its failure is not hidden
      if (p.value && p.failure) {
        pulseOut.state = p.failure.state;
        pulseOut.reason = p.failure.reason;
      }
      // without Instagram nothing is categorised, but the stored categories are still read (so the Brain digest can start)
      if (deps.tagger) deps.tagger.schedule(instagram.ok ? instagram.snapshot.posts.map((x) => ({ id: x.media_id, cover: x.thumbnail_url ?? x.image_url ?? null, caption: x.caption })) : []);
      if (deps.topicTagger) deps.topicTagger.schedule(instagram.ok ? instagram.snapshot.posts.map((x) => ({ id: x.media_id, cover: x.thumbnail_url ?? x.image_url ?? null, caption: x.caption })) : []);
      if (deps.newsletters) deps.newsletters.schedule();
      // readiness and the categories are taken at the same moment: a load that finishes during a later await must not
      // let a digest built from the earlier, empty categories reach the Brain
      const tagsReady = !deps.tagger || deps.tagger.ready();
      const tags = deps.tagger ? deps.tagger.current() : {};
      const posts = instagram.ok ? instagram.snapshot.posts.map((x) => ({ id: x.media_id, format: x.format, published_at: x.published_at, tags: tags[x.media_id] ?? null })) : [];
      const history = await keepHistory(a.value, posts);
      const audienceOut: WorldAudience = a.value
        ? {
            state: a.failure ? a.failure.state : "ok",
            reason: a.failure?.reason ?? null,
            fetched_at: a.value.fetched_at,
            timeframe: a.value.timeframe,
            engaged_country: a.value.engaged_country,
            engaged_city: a.value.engaged_city,
            follower_country: a.value.follower_country,
            follower_city: a.value.follower_city,
            engaged_country_week: a.value.engaged_country_week,
            engaged_city_week: a.value.engaged_city_week,
            who: a.value.who,
            history,
          }
        : {
            state: a.failure?.state ?? "unavailable",
            reason: a.failure?.reason ?? null,
            fetched_at: null,
            timeframe: null,
            engaged_country: MISSING_SERIES,
            engaged_city: MISSING_SERIES,
            follower_country: MISSING_SERIES,
            follower_city: MISSING_SERIES,
            engaged_country_week: MISSING_SERIES,
            engaged_city_week: MISSING_SERIES,
            who: { engaged_week: MISSING_WHO, engaged_month: MISSING_WHO, follower: MISSING_WHO },
            history,
          };
      const workOut: WorldWork = { state: w.value ? (w.failure ? w.failure.state : "ok") : (w.failure?.state ?? "unavailable"), reason: w.failure?.reason ?? null, fetched_at: iso(w.at), issues: w.value ?? [] };
      const payload: WorldPayload = {
        version: 1,
        generated_at: new Date(now()).toISOString(),
        instagram,
        pulse: pulseOut,
        audience: audienceOut,
        work: workOut,
        places: { ana: readAnaPlace(env) },
        ana_look: { ...resolveLook(newest, manual, image, imageReader), read_at: readAt },
        release: readRelease(),
        post_tags: { state: deps.tagger ? "on" : "off", tags },
        post_topics: { state: deps.topicTagger ? "on" : "off", version: OFFICE_VERSION, topics: deps.topicTagger ? deps.topicTagger.current() : {}, failing: deps.topicTagger ? deps.topicTagger.failing() : 0 },
        newsletters: deps.newsletters ? deps.newsletters.current() : NEWSLETTERS_OFF,
        brain: { state: "off", last_day: null, note: null, reason: null },
        brief: deps.brief ? deps.brief.state() : { state: "off", busy: false, latest: null, weekly: null, in_brain: false, brain: false, reason: null },
      };
      if (deps.brain) {
        // the day's digest waits until the stored post categories are read: right after a restart they are not yet,
        // and an append to the Brain cannot be taken back
        if (tagsReady) deps.brain.schedule(payload, now());
        payload.brain = deps.brain.status();
      }
      // the weekly brief waits for the categories and for the audience, like the daily digest
      // and for Instagram: an outage on the first read of a week must not seal an audience-only brief for that week
      if (deps.brief && tagsReady && instagram.ok && audienceOut.state !== "unavailable" && audienceOut.fetched_at) deps.brief.scheduleWeekly(payload);
      return payload;
    },
  };
}
