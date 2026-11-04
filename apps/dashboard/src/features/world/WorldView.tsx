"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/components/providers/I18nProvider";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { channelStatuses, ORBIT_MAX, instagramView, orbitCount, pulseEvents, shares, trends, TREND_POINTS, whoView, type ChannelView, type PulseEvent, type ShareEntry, type WhoView } from "./model";
import { BEN_ACTIVITIES, berlinDay, VINCE_ACTIVITIES, type BenActivity, type VinceActivity } from "./berlinDay";
import { ANA_ACTIVITIES, ANA_OUTFITS, colorHex, currentActivity, SWATCHES, type AnaActivity, type AnaLookId, type ManualLook } from "./looks";
import { PEOPLE, PROJECTS, type WorldPersonId } from "./people";
import type { AudienceSeries, WorldPayload } from "./types";
import { postsWith, TAG_FIELDS, TAG_MIN_CONFIDENCE, topPosts, whatWorks, type PostTags, type RateKind, type TagField } from "./postTags";
import type { SceneData, SceneRef, StationStatus, ViewName, WorldScene } from "./scene/world";
import { pulseDigest } from "./pulse";
import { BriefBlock } from "./BriefBlock";
import { OfficeRoom } from "./OfficeRoom";
import styles from "./world.module.css";

const TABS = ["now", "hot", "selection", "sources"] as const;
type Tab = (typeof TABS)[number];
type Layer = "week" | "engaged" | "followers";
const POLL_MS = 60_000;

function useWorld(sinkRef: { current: (e: PulseEvent[]) => void }) {
  const [world, setWorld] = useState<WorldPayload | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const prevRef = useRef<WorldPayload | null>(null);
  const reloadRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let alive = true;
    let busy = false;
    // a reload asked for while a read is running happens right after it (a write must not be hidden by an older read)
    let again2 = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), ms);
    };
    // one read at a time and one pending timer: returning to the tab never starts a second poll chain
    const load = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const r = await fetch("/api/world", { cache: "no-store", headers: { Accept: "application/json" } });
        const body = (await r.json()) as { ok: true; world: WorldPayload } | { ok: false; reason?: string };
        if (!alive) return;
        if (body.ok) {
          const ev = pulseEvents(prevRef.current, body.world);
          prevRef.current = body.world;
          setWorld(body.world);
          setFailure(null);
          if (ev.length) {
            setEvents((e) => [...ev, ...e].slice(0, 40));
            sinkRef.current(ev);
          }
        } else setFailure(body.reason ?? `HTTP ${r.status}`);
      } catch {
        if (alive) setFailure("network");
      } finally {
        busy = false;
        if (alive) {
          if (again2) {
            again2 = false;
            schedule(0);
          } else schedule(document.hidden ? POLL_MS * 2 : POLL_MS);
        }
      }
    };
    // coming back to the tab reads at once instead of waiting for the next minute
    const again = () => {
      if (document.hidden || !alive || busy) return;
      if (timer) clearTimeout(timer);
      void load();
    };
    reloadRef.current = () => {
      if (busy) {
        again2 = true;
        return;
      }
      if (timer) clearTimeout(timer);
      void load();
    };
    void load();
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [sinkRef]);
  const reload = useCallback(() => reloadRef.current(), []);
  return { world, failure, events, reload };
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function seriesOf(world: WorldPayload, layer: Layer, kind: "country" | "city"): AudienceSeries {
  const a = world.audience;
  if (layer === "week") return kind === "country" ? a.engaged_country_week : a.engaged_city_week;
  return layer === "engaged" ? (kind === "country" ? a.engaged_country : a.engaged_city) : kind === "country" ? a.follower_country : a.follower_city;
}

function whoOf(world: WorldPayload, layer: Layer) {
  const w = world.audience.who;
  return layer === "week" ? w.engaged_week : layer === "engaged" ? w.engaged_month : w.follower;
}

type T = ReturnType<typeof useI18n>["t"];
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Age × gender of the whole account (Meta does not cross it with countries). */
function WhoBlock({ view, title, t, className, testId }: { view: WhoView; title: string; t: T; className: string; testId: string }) {
  return (
    <div className={className} data-testid={testId} data-mode={view?.mode ?? "none"}>
      <h4>{title}</h4>
      {view === null ? (
        <p className={styles.whoNote}>{t("world.who.none")}</p>
      ) : view.mode === "pyramid" ? (
        <>
          <div className={styles.whoRow} aria-hidden="true">
            <span />
            <span style={{ justifySelf: "end" }}>{t("world.who.women")}</span>
            <span />
            <span>{t("world.who.men")}</span>
            <span />
          </div>
          {view.rows.map((r) => (
            <div key={r.band} className={styles.whoRow} title={t("world.who.rowTitle", { band: r.band, f: pct(r.f), m: pct(r.m) })}>
              <span className={styles.whoPct}>{pct(r.f)}</span>
              <span className={`${styles.whoBar} ${styles.whoF}`} style={{ width: `${Math.max(2, (r.f / view.max) * 100)}%` }} />
              <span>{r.band}</span>
              <span className={`${styles.whoBar} ${styles.whoM}`} style={{ width: `${Math.max(2, (r.m / view.max) * 100)}%` }} />
              <span className={styles.whoPct}>{pct(r.m)}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          {view.gender ? (
            <>
              <div className={styles.whoSplit} role="img" aria-label={t("world.who.split", { f: pct(view.gender.f), m: pct(view.gender.m), u: pct(view.gender.u) })}>
                <span style={{ width: `${view.gender.f * 100}%`, background: "#d8566f" }} />
                <span style={{ width: `${view.gender.m * 100}%`, background: "#4f78b8" }} />
                <span style={{ width: `${view.gender.u * 100}%`, background: "#b9b3bd" }} />
              </div>
              <div className={styles.whoLegend}>
                <span>{t("world.who.women")} {pct(view.gender.f)}</span>
                <span>{t("world.who.men")} {pct(view.gender.m)}</span>
                {view.gender.u > 0 ? <span>{t("world.who.unknown")} {pct(view.gender.u)}</span> : null}
              </div>
            </>
          ) : null}
          {view.ages.map((r) => (
            <div key={r.band} className={styles.whoAge}>
              <span>{r.band}</span>
              <span className={styles.whoBar} style={{ width: `${Math.max(2, r.share * 100)}%` }} />
              <span>{pct(r.share)}</span>
            </div>
          ))}
        </>
      )}
      <p className={styles.whoNote}>{t("world.who.note")}</p>
    </div>
  );
}

export function WorldView() {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const sceneRef = useRef<WorldScene | null>(null);
  const sinkRef = useRef<(e: PulseEvent[]) => void>((ev) => sceneRef.current?.burst(ev));
  const { world, failure, events, reload } = useWorld(sinkRef);
  const [lookSave, setLookSave] = useState<{ state: "idle" | "saving" | "saved" | "failed"; reason?: string }>({ state: "idle" });
  // the pick just saved, shown until a world read from after the save arrives (server times on both sides)
  const [localPick, setLocalPick] = useState<{ manual: ManualLook | null; at: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState<"loading" | "ok" | "unsupported">("loading");
  const [view, setView] = useState<ViewName>("world");
  // the last 7 days lead once Meta answers them; the 30 days otherwise
  const [layerPick, setLayer] = useState<Layer | null>(null);
  const layer: Layer = layerPick ?? (world?.audience.engaged_country_week.state === "ok" ? "week" : "engaged");
  const [tab, setTab] = useState<Tab>("now");
  const [selected, setSelected] = useState<SceneRef | null>(null);
  // Ana's office: opens over the world when Ana is picked (in the scene or with the button)
  const [office, setOffice] = useState(false);
  const closeOffice = useCallback(() => setOffice(false), []);
  // a category value picked in "What works", or the top posts, lit up in the orbit
  const [worksPick, setWorksPick] = useState<{ field: TagField; value: string } | "top" | "fresh" | null>(null);
  // what "What works" ranks by: engagement, or saves + shares (the closer hint for long reads, e.g. Substack)
  const [rateKind, setRateKind] = useState<RateKind>("er");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pf = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const regions = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const country = useCallback((code: string) => regions?.of(code) ?? code, [regions]);
  const num = (v: number | null) => (v === null ? "—" : nf.format(v));
  const ago = useCallback(
    (iso: string | null) => {
      if (!iso) return t("world.never");
      const m = Math.round((now - Date.parse(iso)) / 60_000);
      if (m < 1) return t("world.ago.now");
      if (m < 60) return t("world.ago.min", { n: m });
      if (m < 48 * 60) return t("world.ago.h", { n: Math.round(m / 60) });
      return t("world.ago.d", { n: Math.round(m / 1440) });
    },
    [now, t],
  );

  const ig: ChannelView | null = useMemo(() => (world ? instagramView(world) : null), [world]);
  const workState = world?.work.state ?? "not-configured";
  const stationOf = useCallback(
    (keys: readonly string[]): StationStatus => {
      if (keys.length === 0) return "no-source";
      if (!world || workState !== "ok") return "no-jira";
      const issues = world.work.issues.filter((i) => keys.includes(i.key));
      if (issues.some((i) => i.category === "indeterminate")) return "busy";
      if (issues.length > 0 && issues.every((i) => i.category === "done")) return "done";
      return "idle";
    },
    [world, workState],
  );

  const countries: Array<ShareEntry & { label: string; sub: string; trend: number | null }> = useMemo(() => {
    if (!world) return [];
    const trend = layer === "week" ? trends(world.audience.engaged_country_week, world.audience.engaged_country) : new Map<string, number>();
    return shares(seriesOf(world, layer, "country")).map((c) => {
      const d = trend.get(c.key) ?? null;
      const share = `${Math.round(c.share * 100)} %`;
      const sub = d === null || Math.abs(d) < TREND_POINTS ? share : t(d > 0 ? "world.audience.up" : "world.audience.down", { share, n: Math.round(Math.abs(d)) });
      return { ...c, label: country(c.key), sub, trend: d };
    });
  }, [world, layer, country, t]);
  const who = useMemo(() => (world ? whoView(whoOf(world, layer)) : null), [world, layer]);
  const whoTitle = t(layer === "week" ? "world.who.week" : layer === "engaged" ? "world.who.month" : "world.who.followers");
  const anaPlaceLabel = world?.places.ana?.label ?? null;

  // the look as the panel last saved it (until a world read from after the save arrives)
  const effectiveLook = useMemo(() => {
    if (!world) return null;
    const l = world.ana_look;
    const fresh = localPick && Date.parse(l.read_at ?? world.generated_at) < Date.parse(localPick.at) ? localPick : null;
    return fresh ? { ...l, manual: fresh.manual, manual_expired: false } : l;
  }, [world, localPick]);
  const anaActivity = useMemo(() => (effectiveLook ? currentActivity(effectiveLook, now) : null), [effectiveLook, now]);
  const anaActivityId = anaActivity?.activity ?? null;

  const sceneData: SceneData | null = useMemo(() => {
    if (!world || !ig) return null;
    return {
      posts: ig.posts,
      erMedian: ig.erMedian,
      channels: channelStatuses(world),
      countries,
      anaPlace: world.places.ana,
      projects: PROJECTS.map((p) => {
        const status = stationOf(p.jiraKeys);
        return { id: p.id, shape: p.shape, owner: p.owner, status, label: t(`world.projects.${p.nameKey}`), sub: [p.jiraKeys[0], t(`world.station.${status}`)].filter(Boolean).join(" · ") };
      }),
      labels: {
        people: {
          ana: { name: PEOPLE.ana.name, sub: t("world.people.ana.sub", { state: t("world.look.activities.eating"), place: anaPlaceLabel ?? "—" }) },
          ben: { name: PEOPLE.ben.name, sub: t("world.people.ben.sub") },
          vince: { name: PEOPLE.vince.name, sub: t("world.people.vince.sub") },
        },
        berlin: t("world.places.berlin"),
        anaPlace: anaPlaceLabel ? t("world.places.anaSet", { place: anaPlaceLabel }) : t("world.places.anaUnknown"),
        vps: t("world.vps.name"),
        vpsSub: world.release.sha ? t("world.vps.sub", { sha: world.release.sha.slice(0, 7) }) : t("world.vps.subLocal"),
        ring: t("world.ring.name"),
        ringSub: t("world.ring.sub", { n: orbitCount(ig.posts) }),
        notConnected: t("world.channels.not-connected"),
        anaStates: Object.fromEntries(
          [...ANA_ACTIVITIES, "sleeping" as const].map((a) => [a, t("world.people.ana.sub", { state: t(`world.look.activities.${a}`), place: anaPlaceLabel ?? "—" })]),
        ) as Record<AnaActivity | "sleeping", string>,
        benStates: Object.fromEntries([...BEN_ACTIVITIES, "sleeping" as const].map((a) => [a, t(`world.berlinDay.ben.${a}`)])) as Record<BenActivity | "sleeping", string>,
        vinceStates: Object.fromEntries([...VINCE_ACTIVITIES, "sleeping" as const].map((a) => [a, t(`world.berlinDay.vince.${a}`)])) as Record<VinceActivity | "sleeping", string>,
        clockApprox: "≈",
      },
      anaLook: { look: world.ana_look.look, colors: world.ana_look.colors },
    };
  }, [world, ig, countries, stationOf, t, anaPlaceLabel]);

  // the 3D stage: loaded lazily, never on the server
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = labelsRef.current;
    if (!canvas || !host) return;
    if (!supportsWebGL()) {
      void Promise.resolve().then(() => setGl("unsupported"));
      return;
    }
    let disposed = false;
    let ro: ResizeObserver | null = null;
    Promise.all([import("./scene/world"), import("./geo").then((m) => m.loadGeo())])
      .then(([mod, geo]) => {
        if (disposed) return;
        sceneRef.current = mod.createWorldScene(canvas, host, geo, {
          reducedMotion: reduced,
          onSelect: (ref) => {
            setSelected(ref);
            setTab("selection");
            if (ref.type === "person" && ref.id === "ana") setOffice(true);
          },
        });
        ro = new ResizeObserver(() => sceneRef.current?.resize());
        ro.observe(canvas);
        setGl("ok");
      })
      .catch(() => {
        if (!disposed) setGl("unsupported");
      });
    return () => {
      disposed = true;
      ro?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setGl("loading");
    };
  }, [reduced]);

  useEffect(() => {
    if (gl === "ok" && sceneData) sceneRef.current?.setData(sceneData);
  }, [gl, sceneData]);
  useEffect(() => {
    if (gl === "ok") sceneRef.current?.focus(view);
  }, [gl, view]);
  useEffect(() => {
    if (gl === "ok" && anaActivityId) sceneRef.current?.setAnaActivity(anaActivityId);
  }, [gl, anaActivityId]);

  const postTitle = (id: string | null) => {
    const p = ig?.posts.find((x) => x.id === id);
    const c = p?.caption?.replace(/\s+/g, " ").trim();
    return c ? (c.length > 48 ? `${c.slice(0, 47)}…` : c) : t("world.feed.untitled");
  };
  const eventText = (e: PulseEvent) => {
    if (e.kind === "new-post") return t("world.feed.newPost");
    if (e.kind === "followers") return t("world.feed.followers", { n: e.delta > 0 ? `+${e.delta}` : String(e.delta) });
    const key = e.kind === "likes" ? (e.delta > 0 ? "world.feed.likes" : "world.feed.likesDown") : e.delta > 0 ? "world.feed.comments" : "world.feed.commentsDown";
    return t(key, { n: e.delta, post: postTitle(e.postId) });
  };

  const pulseLine = !world ? t("world.pulse.waiting") : world.pulse.state === "ok" ? t("world.pulse.live", { time: ago(world.pulse.fetched_at) }) : world.pulse.fetched_at ? t("world.pulse.failed", { reason: world.pulse.reason ?? world.pulse.state }) : t("world.pulse.waiting");
  const timeframeLabel = layer === "week" ? t("world.audience.timeframes.this_week") : t("world.audience.timeframes.this_month");
  const history = world?.audience.history ?? { days: 0, since: null };

  // which kinds of post reach which engagement (categories read by the model; format from Meta)
  const works = useMemo(() => (world && ig ? whatWorks(ig.posts, world.post_tags.tags, rateKind) : null), [world, ig, rateKind]);
  const top = useMemo(() => (ig ? topPosts(ig.posts, 5, rateKind) : []), [ig, rateKind]);
  // "Was läuft": the same digest the Brain gets once a day
  const digest = useMemo(() => (world ? pulseDigest(world, Date.parse(world.generated_at)) : null), [world]);
  const freshPosts = useMemo(() => (ig && digest ? digest.fresh.flatMap((f) => ig.posts.filter((p) => p.id === f.id)) : []), [ig, digest]);
  const pickedAll = useMemo(() => {
    if (!world || !ig || !worksPick) return null;
    return worksPick === "top" ? top : worksPick === "fresh" ? freshPosts : postsWith(ig.posts, world.post_tags.tags, worksPick.field, worksPick.value, rateKind);
  }, [world, ig, worksPick, top, freshPosts, rateKind]);
  // a pick whose posts are gone after a refresh counts as no pick (nothing stays dimmed)
  const picked = pickedAll && pickedAll.length > 0 ? pickedAll : null;
  const pick = picked ? worksPick : null;
  // only the newest posts fly in the orbit: say how many of the picked ones can light up
  const inOrbit = useMemo(() => {
    if (!ig || !picked) return 0;
    const ids = new Set(ig.posts.slice(0, ORBIT_MAX).map((p) => p.id));
    return picked.filter((p) => ids.has(p.id)).length;
  }, [ig, picked]);
  useEffect(() => {
    if (gl === "ok") sceneRef.current?.highlight(picked ? picked.map((p) => p.id) : null);
  }, [gl, picked]);
  const tagChips = (id: string) => {
    const tg: PostTags | undefined = world?.post_tags.tags[id];
    // a reading the statistics leave out is not shown as if it counted
    if (!tg || tg.confidence < TAG_MIN_CONFIDENCE) return null;
    return (
      <span className={styles.chips}>
        {(["theme", "ana", "shot", "mood"] as const).map((f) => (
          <span key={f} className={styles.chip}>
            {t(`world.works.values.${f}.${tg[f]}` as never)}
          </span>
        ))}
      </span>
    );
  };
  const pct1 = (v: number | null) => (v === null ? "—" : `${pf.format(v * 100)} %`);
  const postRow = (p: { id: string; format: string; er: number | null; ssr: number | null; reach: number | null; permalink: string | null }, extra?: string | null) => (
    <li key={p.id} className={styles.postRow}>
      <button type="button" className={styles.postTitle} onClick={() => { setSelected({ type: "post", id: p.id }); setTab("selection"); }}>
        {postTitle(p.id)}
      </button>
      <span className={styles.muted}>
        {t("world.works.meta", { format: t(`world.works.values.format.${p.format}` as never), er: pct1(p.er), ssr: pct1(p.ssr), reach: num(p.reach) })}
      </span>
      {extra ? <span className={styles.hotBadge}>{extra}</span> : null}
      {tagChips(p.id)}
      {p.permalink ? (
        <a href={p.permalink} target="_blank" rel="noopener noreferrer">
          {t("world.works.open")}
        </a>
      ) : null}
    </li>
  );
  const worksBlock =
    world && ig && works ? (
      <section className={styles.section} aria-labelledby="world-works" data-testid="world-works">
        <h3 id="world-works">{t("world.works.title")}</h3>
        <p className={styles.muted}>
          {world.post_tags.state === "off" ? t("world.works.off") : t(rateKind === "er" ? "world.works.status" : "world.works.statusSsr", { n: Object.keys(world.post_tags.tags).length, total: ig.posts.length, counted: works.counted })}
        </p>
        <div role="group" aria-label={t("world.works.rateLabel")} className={styles.segment} data-testid="world-works-rate">
          {(["er", "ssr"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={rateKind === k} onClick={() => setRateKind(k)}>
              {t(`world.works.rates.${k}`)}
            </button>
          ))}
        </div>
        {rateKind === "ssr" ? <p className={styles.note}>{t("world.works.ssrNote")}</p> : null}
        <div className={styles.audienceGroup} data-testid="world-works-top">
          <h4>{t(rateKind === "er" ? "world.works.top" : "world.works.topSsr")}</h4>
          <ol className={styles.postList}>{top.map((p) => postRow(p))}</ol>
          <button type="button" className={styles.linkButton} aria-pressed={pick === "top"} onClick={() => setWorksPick(pick === "top" ? null : "top")}>
            {t("world.works.showTop")}
          </button>
          {pick === "top" ? <p className={styles.muted}>{t("world.works.inOrbit", { k: inOrbit, n: top.length })}</p> : null}
        </div>
        <p className={styles.muted}>{t("world.works.pickHint")}</p>
        {TAG_FIELDS.map((f) => {
          const rows = works.fields[f].slice(0, 6);
          if (!rows.length) return null;
          const max = Math.max(...rows.map((r) => r.median), 0.0001);
          return (
            <div key={f} className={styles.audienceGroup} data-testid={`world-works-${f}`}>
              <h4>{t(`world.works.fields.${f}`)}</h4>
              <ul className={styles.bars}>
                {rows.map((r) => (
                  <li key={r.value} data-few={r.n < 3 ? "true" : undefined} className={r.n < 3 ? styles.few : undefined}>
                    <button
                      type="button"
                      className={styles.barLabel}
                      aria-pressed={typeof pick === "object" && pick?.field === f && pick.value === r.value}
                      onClick={() => setWorksPick(typeof pick === "object" && pick?.field === f && pick.value === r.value ? null : { field: f, value: r.value })}
                    >
                      {t(`world.works.values.${f}.${r.value}` as never)}
                    </button>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span style={{ width: `${Math.max(3, (r.median / max) * 100)}%` }} />
                    </span>
                    <span className={styles.barValue}>{t("world.works.row", { er: pf.format(r.median * 100), n: r.n })}</span>
                  </li>
                ))}
              </ul>
              {typeof pick === "object" && pick?.field === f && picked ? (
                <div data-testid="world-works-posts">
                  <p className={styles.muted}>
                    {t("world.works.postsFor", { n: picked.length, value: t(`world.works.values.${f}.${pick.value}` as never) })} {t("world.works.inOrbit", { k: inOrbit, n: picked.length })}{" "}
                    <button type="button" className={styles.linkButton} onClick={() => setWorksPick(null)}>
                      {t("world.works.clear")}
                    </button>
                  </p>
                  <ol className={styles.postList}>{picked.map((p) => postRow(p))}</ol>
                </div>
              ) : null}
            </div>
          );
        })}
        <p className={styles.note}>{t(rateKind === "er" ? "world.works.note" : "world.works.noteSsr")}</p>
      </section>
    ) : null;

  const audienceBlock = world ? (
    <section className={styles.section} aria-labelledby="world-audience">
      <h3 id="world-audience">{t("world.audience.title")}</h3>
      {(["country", "city"] as const).map((kind) => {
        const s = seriesOf(world, layer, kind);
        const list = shares(s).slice(0, 6);
        return (
          <div key={kind} className={styles.audienceGroup} data-testid={`world-audience-${kind}`}>
            <h4>{kind === "country" ? t("world.audience.countries") : t("world.audience.cities")}</h4>
            {s.state !== "ok" ? (
              <p className={styles.muted}>{t("world.audience.unavailable", { reason: s.reason ?? s.state })}</p>
            ) : (
              <ul className={styles.bars}>
                {list.map((c) => (
                  <li key={c.key}>
                    {kind === "country" ? (
                      <button type="button" className={styles.barLabel} onClick={() => { setSelected({ type: "country", key: c.key }); setTab("selection"); }}>
                        {country(c.key)}
                      </button>
                    ) : (
                      <span className={styles.barLabel}>{c.key}</span>
                    )}
                    <span className={styles.barTrack} aria-hidden="true">
                      <span style={{ width: `${Math.max(3, c.share * 100)}%` }} />
                    </span>
                    <span className={styles.barValue}>{nf.format(c.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p className={styles.note}>{t("world.audience.note", { timeframe: timeframeLabel })}</p>
      {layer === "week" ? <p className={styles.note}>{t("world.audience.trendNote", { n: TREND_POINTS })}</p> : null}
      <WhoBlock view={who} title={whoTitle} t={t} className={`${styles.who} ${styles.whoInline}`} testId="world-who-panel" />
      <p className={styles.note} data-testid="world-history">
        {history.days > 0 ? t("world.audience.history", { n: history.days, since: history.since ?? "—" }) : t("world.audience.historyNone")}
      </p>
    </section>
  ) : null;

  const moveRow = (c: { key: string; share: number; delta: number }) => (
    <li key={c.key}>
      <button type="button" className={styles.barLabel} onClick={() => { setSelected({ type: "country", key: c.key }); setTab("selection"); }}>
        {country(c.key)}
      </button>
      <span className={styles.barTrack} aria-hidden="true">
        <span style={{ width: `${Math.max(3, c.share * 100)}%` }} />
      </span>
      <span className={styles.barValue} data-dir={c.delta > 0 ? "up" : "down"}>
        {t("world.hot.move", { share: `${Math.round(c.share * 100)} %`, delta: `${c.delta > 0 ? "+" : "−"}${pf.format(Math.abs(c.delta))}` })}
      </span>
    </li>
  );
  const brainLine = (() => {
    const b = world?.brain;
    if (!b || b.state === "off") return t("world.hot.brain.off");
    if (b.state === "error") return t("world.hot.brain.error", { reason: b.reason ?? "?" });
    return b.last_day ? t("world.hot.brain.on", { day: b.last_day }) : t("world.hot.brain.pending");
  })();
  const selectTab = (k: Tab) => {
    setTab(k);
    // movement is the last 7 days against the 30: the globe shows the week with its trend colours
    if (k === "hot" && world?.audience.engaged_country_week.state === "ok") setLayer("week");
  };
  const hotPane = (
    <div className={styles.pane} data-testid="world-hot">
      {world ? (
        <BriefBlock
          world={world}
          posts={ig?.posts ?? []}
          t={t}
          ago={ago}
          onPost={(id) => {
            setSelected({ type: "post", id });
            setTab("selection");
          }}
        />
      ) : null}
      <section className={styles.section} aria-labelledby="world-hot-title">
        <h3 id="world-hot-title">{t("world.hot.title")}</h3>
        <p className={styles.muted}>{t("world.hot.lead")}</p>
        {!digest ? (
          <p className={styles.muted}>{t("world.pulse.waiting")}</p>
        ) : (
          <>
            <div className={styles.audienceGroup} data-testid="world-hot-rising">
              <h4>{t("world.hot.rising")}</h4>
              {digest.rising.length ? <ul className={styles.bars}>{digest.rising.map(moveRow)}</ul> : <p className={styles.muted}>{digest.leading.length ? t("world.hot.none", { n: TREND_POINTS }) : t("world.hot.noWeek")}</p>}
            </div>
            {digest.falling.length ? (
              <div className={styles.audienceGroup} data-testid="world-hot-falling">
                <h4>{t("world.hot.falling")}</h4>
                <ul className={styles.bars}>{digest.falling.map(moveRow)}</ul>
              </div>
            ) : null}
            {digest.topAge || digest.gender ? (
              <p data-testid="world-hot-who">
                <b>{t("world.hot.who")}</b>{" "}
                {[digest.topAge ? t("world.hot.whoAge", { band: digest.topAge.band, share: `${Math.round(digest.topAge.share * 100)} %` }) : null, digest.gender ? t("world.hot.whoGender", { f: `${Math.round(digest.gender.f * 100)} %`, m: `${Math.round(digest.gender.m * 100)} %` }) : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <div className={styles.audienceGroup} data-testid="world-hot-fresh">
              <h4>{t("world.hot.fresh")}</h4>
              {freshPosts.length ? (
                <>
                  <ol className={styles.postList}>
                    {freshPosts.map((p) => {
                      const f = digest.fresh.find((x) => x.id === p.id);
                      return postRow(p, f?.vsMedian != null ? t("world.hot.vsMedian", { x: pf.format(f.vsMedian) }) : null);
                    })}
                  </ol>
                  <button type="button" className={styles.linkButton} aria-pressed={pick === "fresh"} onClick={() => setWorksPick(pick === "fresh" ? null : "fresh")}>
                    {t("world.works.showTop")}
                  </button>
                  {pick === "fresh" ? <p className={styles.muted}>{t("world.works.inOrbit", { k: inOrbit, n: freshPosts.length })}</p> : null}
                </>
              ) : (
                <p className={styles.muted}>{t("world.hot.freshNone")}</p>
              )}
            </div>
            {digest.brand.n > 0 ? (
              <p data-testid="world-hot-brand">
                <b>{t("world.hot.brand")}</b> {t("world.hot.brandLine", { n: digest.brand.n, er: pct1(digest.brand.er), other: digest.brand.otherN, otherEr: pct1(digest.brand.otherEr) })}
              </p>
            ) : null}
          </>
        )}
        <p className={styles.note}>{t("world.hot.note")}</p>
      </section>
      {worksBlock ? (
        <details className={styles.more} data-testid="world-works-more">
          <summary>{t("world.simple.allDetails")}</summary>
          {worksBlock}
        </details>
      ) : null}
      <section className={styles.section} aria-labelledby="world-hot-brain">
        <h4 id="world-hot-brain">{t("world.hot.brain.title")}</h4>
        <p className={styles.muted} data-testid="world-hot-brain" data-state={world?.brain.state ?? "off"}>
          {brainLine}
        </p>
        <p className={styles.note}>{t("world.hot.brain.note")}</p>
      </section>
    </div>
  );

  const sourceState = (s: string) => (s === "ok" ? t("world.sources.stateOk") : s === "not-configured" ? t("world.sources.stateMissing") : s === "permission-required" ? t("world.sources.statePermission") : s === "unavailable" ? t("world.sources.stateUnavailable") : t("world.sources.stateError"));

  const nowPane = (
    <div className={styles.pane}>
      <div className={styles.kpis}>
        <div data-testid="world-kpi-followers">
          <span>{t("world.kpi.followers")}</span>
          <b>{num(ig?.followers ?? null)}</b>
        </div>
        <div>
          <span>{t("world.kpi.reach28")}</span>
          <b>{num(ig?.reach28 ?? null)}</b>
        </div>
        <div>
          <span>{t("world.kpi.interactions28")}</span>
          <b>{num(ig?.interactions28 ?? null)}</b>
        </div>
        <div data-testid="world-kpi-posts">
          <span>{t("world.kpi.posts")}</span>
          <b>{num(ig ? orbitCount(ig.posts) : null)}</b>
        </div>
      </div>
      <section className={styles.section} aria-labelledby="world-feed">
        <h3 id="world-feed">{t("world.feed.title")}</h3>
        {events.length === 0 ? (
          <p className={styles.muted}>{t("world.feed.empty")}</p>
        ) : (
          <ul className={styles.feed} data-testid="world-feed">
            {events.map((e, i) => (
              <li key={`${e.at}-${e.kind}-${e.postId ?? "acc"}-${i}`} className={styles[`ev_${e.kind}`]}>
                <span className={styles.evDot} aria-hidden="true" />
                <span>{eventText(e)}</span>
                <time dateTime={e.at}>{ago(e.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      {audienceBlock}
      <section className={styles.section} aria-labelledby="world-channels">
        <h3 id="world-channels">{t("world.channels.title")}</h3>
        <ul className={styles.channels}>
          {(world ? channelStatuses(world) : []).map((c) => (
            <li key={c.def.id} data-state={c.status}>
              <span className={styles.chDot} style={{ background: `#${c.def.color.toString(16).padStart(6, "0")}` }} aria-hidden="true" />
              {c.def.label}
              <em>{t(`world.channels.${c.status}`)}</em>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section} aria-labelledby="world-berlin">
        <h3 id="world-berlin">{t("world.berlinBox.title")}</h3>
        <p className={styles.muted}>{world?.release.sha ? t("world.berlinBox.release", { sha: world.release.sha.slice(0, 7), time: ago(world.release.started_at) }) : t("world.berlinBox.noRelease")}</p>
        <p className={styles.muted} data-testid="world-jira-state">
          {workState === "not-configured" ? t("world.berlinBox.jiraOff") : workState === "ok" ? null : t("world.berlinBox.jiraError", { reason: world?.work.reason ?? workState })}
        </p>
      </section>
    </div>
  );

  const anaNight = (place: { lon: number; tz: string | null }) => {
    const h = place.tz ? Number(new Intl.DateTimeFormat("en-GB", { timeZone: place.tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(now))) : (((new Date(now).getUTCHours() + Math.round(place.lon / 15)) % 24) + 24) % 24;
    return h >= 23 || h < 7;
  };

  const saveLook = async (look: AnaLookId | "auto", color: string, activity: AnaActivity | "auto") => {
    if (lookSave.state === "saving") return;
    setLookSave({ state: "saving" });
    try {
      const r = await fetch("/api/world/look", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ look, color, activity }) });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; reason?: string; manual?: ManualLook | null; at?: string };
      if (!r.ok || !body.ok) {
        setLookSave({ state: "failed", reason: `HTTP ${r.status}` });
        return;
      }
      setLocalPick({ manual: body.manual ?? null, at: body.at ?? new Date().toISOString() });
      setLookSave({ state: "saved" });
      reload();
    } catch {
      setLookSave({ state: "failed", reason: "network" });
    }
  };

  const lookBlock = (night: boolean, local: string) => {
    if (!world || !effectiveLook || !anaActivity) return null;
    const l = world.ana_look;
    const m = effectiveLook.manual && !effectiveLook.manual_expired ? effectiveLook.manual : null;
    // a pick from before activities existed stored the scooter as a look
    const pickedLook: AnaLookId | "auto" = m ? (m.look === "scooter" ? "everyday" : m.look) : "auto";
    const pickedColor = m ? m.color : "auto";
    const pickedActivity: AnaActivity | "auto" = m ? (m.activity && m.activity !== "auto" ? m.activity : m.look === "scooter" ? "scooter" : "auto") : "auto";
    const postTime = l.post?.published_at ? ago(l.post.published_at) : "—";
    const clock = (ms: number | null) => (ms === null ? "—" : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms)));
    const doing = night ? "sleeping" : anaActivity.activity;
    const busy = lookSave.state === "saving";
    return (
      <section className={styles.section} aria-labelledby="world-look" data-testid="world-look">
        <h4 id="world-look">{t("world.look.title")}</h4>
        <p data-testid="world-activity-now" data-activity={doing} data-source={anaActivity.source}>
          {t("world.look.activityNow", { activity: t(`world.look.activities.${doing}`) })}
        </p>
        <p className={styles.muted}>
          {night
            ? t("world.look.night", { time: local })
            : anaActivity.source === "manual"
              ? t("world.look.activityManual")
              : anaActivity.source === "post"
                ? t("world.look.activityPost", { time: clock(anaActivity.until) })
                : t("world.look.activityRotation", { time: clock(anaActivity.until) })}
        </p>
        <p data-testid="world-look-now" data-look={l.look} data-source={l.look_source}>
          {t("world.look.outfitNow", { outfit: t(`world.look.states.${l.look === "mermaid" ? "mermaid" : "everyday"}`) })}
        </p>
        <p className={styles.muted}>
          {l.look_source === "manual" && m ? t("world.look.fromManual", { time: ago(m.set_at) }) : !l.post ? t("world.look.noPost") : l.look_source === "caption" ? t("world.look.fromCaption", { time: postTime }) : l.look_source === "image" ? t("world.look.fromImage", { time: postTime, pct: Math.round((l.image_confidence ?? 0) * 100) }) : t("world.look.fromDefault", { time: postTime })}
        </p>
        {l.manual_expired && l.manual ? <p className={styles.muted}>{t("world.look.manualExpired", { time: ago(l.manual.set_at) })}</p> : null}
        {l.image_reader === "no-cover" && l.look_source !== "manual" ? <p className={styles.muted}>{t("world.look.noCover")}</p> : null}
        <p className={styles.muted} data-testid="world-look-color" data-source={l.color_source}>
          {l.color_source === "manual" ? t("world.look.colorManual") : l.color_source === "image" ? t("world.look.colorImage", { pct: Math.round((l.image_confidence ?? 0) * 100) }) : t("world.look.colorDefault")}
        </p>
        {l.post?.permalink ? (
          <a href={l.post.permalink} target="_blank" rel="noopener noreferrer">
            {t("world.look.openPost")}
          </a>
        ) : null}
        <h4>{t("world.look.pickActivity")}</h4>
        <div role="radiogroup" aria-label={t("world.look.pickActivity")} className={styles.lookPick}>
          {(["auto", ...ANA_ACTIVITIES] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={pickedActivity === k} aria-disabled={busy} onClick={() => void saveLook(pickedLook, pickedColor, k)} data-testid={`world-activity-pick-${k}`}>
              {k === "auto" ? t("world.look.activityAuto") : t(`world.look.activities.${k}`)}
            </button>
          ))}
        </div>
        <h4>{t("world.look.pick")}</h4>
        <div role="radiogroup" aria-label={t("world.look.pick")} className={styles.lookPick}>
          {(["auto", ...ANA_OUTFITS] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={pickedLook === k} aria-disabled={busy} onClick={() => void saveLook(k, pickedColor, pickedActivity)} data-testid={`world-look-pick-${k}`}>
              {k === "auto" ? t("world.look.auto") : t(`world.look.states.${k}`)}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t("world.look.pickColor")} className={styles.swatches}>
          <button type="button" role="radio" aria-checked={pickedColor === "auto"} aria-disabled={busy} onClick={() => void saveLook(pickedLook, "auto", pickedActivity)} data-testid="world-look-color-auto">
            {t("world.look.auto")}
          </button>
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={pickedColor === c} aria-label={t("world.look.colorName", { hex: c })} title={c} aria-disabled={busy} onClick={() => void saveLook(pickedLook, c, pickedActivity)} className={styles.swatch} style={{ ["--swatch" as string]: c }} data-testid={`world-look-color-${c.slice(1)}`} />
          ))}
          {l.colors ? <span className={styles.swatchNow} style={{ ["--swatch" as string]: colorHex(l.colors.primary) }} aria-hidden="true" /> : null}
        </div>
        <p className={styles.muted} role="status" data-testid="world-look-save" data-state={lookSave.state}>
          {lookSave.state === "saving" ? t("world.look.saving") : lookSave.state === "saved" ? t("world.look.saved") : lookSave.state === "failed" ? t("world.look.failed", { reason: lookSave.reason ?? "?" }) : ""}
        </p>
      </section>
    );
  };

  const selectionPane = (() => {
    if (!selected || !world || !ig) return <div className={styles.pane}><p className={styles.muted}>{t("world.selectHint")}</p></div>;
    const s = selected;
    if (s.type === "person") {
      const p = PEOPLE[s.id as WorldPersonId];
      const own = PROJECTS.filter((x) => x.owner === s.id);
      const place = s.id === "ana" ? world.places.ana : null;
      const clock = (tz: string) => new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(now));
      const local = place ? (place.tz ? clock(place.tz) : new Date(now + Math.round(place.lon / 15) * 3_600_000).toISOString().slice(11, 16)) : clock("Europe/Berlin");
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle} style={{ ["--tint" as string]: p.tint }}>{p.name}</h3>
          <p>{s.id === "ana" ? (place ? place.label : t("world.places.anaUnknown")) : t("world.places.berlin")}</p>
          {s.id !== "ana" || place ? <p className={styles.muted}>{s.id === "ana" && !place?.tz ? t("world.people.localTimeEstimated", { time: local }) : t("world.people.localTime", { time: local })}</p> : null}
          {s.id === "ana" ? (
            <button type="button" className={styles.officeOpen} onClick={() => setOffice(true)} data-testid="office-open">
              <span aria-hidden="true">🗂️ </span>
              {t("world.office.open")}
            </button>
          ) : null}
          {s.id === "ana" ? lookBlock(place ? anaNight(place) : false, local) : null}
          {s.id === "ben" || s.id === "vince"
            ? (() => {
                const d = berlinDay(now);
                const doing = d.night ? "sleeping" : s.id === "ben" ? d.ben : d.vince;
                const label = s.id === "ben" ? t(`world.berlinDay.ben.${d.night ? "sleeping" : d.ben}`) : t(`world.berlinDay.vince.${d.night ? "sleeping" : d.vince}`);
                return (
                  <section className={styles.section} data-testid={`world-${s.id}-day`} data-activity={doing}>
                    <p>{t("world.berlinDay.now", { activity: label })}</p>
                    <p className={styles.muted}>{d.night ? t("world.berlinDay.night") : t("world.berlinDay.rotation", { time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(d.until)) })}</p>
                  </section>
                );
              })()
            : null}
          {own.length ? (
            <>
              <h4>{t("world.people.owns")}</h4>
              <ul className={styles.plain}>
                {own.map((x) => (
                  <li key={x.id}>
                    <button type="button" className={styles.linkish} onClick={() => setSelected({ type: "project", id: x.id })}>
                      {t(`world.projects.${x.nameKey}`)}
                    </button>{" "}
                    · {t(`world.station.${stationOf(x.jiraKeys)}`)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className={styles.note}>{t("world.people.decoration")}</p>
        </div>
      );
    }
    if (s.type === "project") {
      const p = PROJECTS.find((x) => x.id === s.id);
      if (!p) return null;
      const issues = world.work.issues.filter((i) => p.jiraKeys.includes(i.key));
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle}>{t(`world.projects.${p.nameKey}`)}</h3>
          <p>
            {PEOPLE[p.owner].name} · {t(`world.station.${stationOf(p.jiraKeys)}`)}
          </p>
          {issues.length ? (
            <ul className={styles.plain}>
              {issues.map((i) => (
                <li key={i.key}>
                  <a href={i.url} target="_blank" rel="noopener noreferrer">{i.key}</a> {i.summary} · {i.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{p.jiraKeys.length ? `${p.jiraKeys.join(", ")} · ${workState === "not-configured" ? t("world.berlinBox.jiraOff") : t("world.station.idle")}` : t("world.sources.vinceBody")}</p>
          )}
        </div>
      );
    }
    if (s.type === "post") {
      const p = ig.posts.find((x) => x.id === s.id);
      if (!p) return null;
      return (
        <div className={styles.pane} data-testid="world-post">
          <h3 className={styles.selTitle}>{postTitle(p.id)}</h3>
          <p className={styles.muted}>{p.published_at ? t("world.post.published", { time: ago(p.published_at) }) : null}</p>
          {tagChips(p.id)}
          {p.fresh ? <p className={styles.note}>{t("world.post.fresh")}</p> : null}
          <div className={styles.kpis}>
            {(["reach", "views", "likes", "comments", "saves", "shares"] as const).map((k) => (
              <div key={k}>
                <span>{t(`world.post.${k}`)}</span>
                <b>{num(p[k])}</b>
              </div>
            ))}
          </div>
          <p>{p.er !== null && ig.erMedian !== null ? t("world.post.er", { value: `${pf.format(p.er * 100)} %`, median: `${pf.format(ig.erMedian * 100)} %` }) : p.er !== null ? t("world.post.er", { value: `${pf.format(p.er * 100)} %`, median: "—" }) : t("world.post.erNone")}</p>
          {p.ssr !== null ? <p data-testid="world-post-ssr">{t("world.post.ssr", { value: pct1(p.ssr) })}</p> : null}
          <p className={styles.muted}>{t("world.post.countersAt", { time: ago(p.counters_at) })}</p>
          {p.permalink ? (
            <a href={p.permalink} target="_blank" rel="noopener noreferrer">
              {t("world.post.open")}
            </a>
          ) : null}
        </div>
      );
    }
    if (s.type === "country") {
      const eng = world.audience.engaged_country.results.find((r) => r.key === s.key);
      const fol = world.audience.follower_country.results.find((r) => r.key === s.key);
      const share = shares(seriesOf(world, layer, "country")).find((r) => r.key === s.key);
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle}>{country(s.key)}</h3>
          <div className={styles.kpis}>
            <div>
              <span>{t("world.country.engaged")}</span>
              <b>{num(eng?.value ?? null)}</b>
            </div>
            <div>
              <span>{t("world.country.followers")}</span>
              <b>{num(fol?.value ?? null)}</b>
            </div>
          </div>
          {share ? <p>{t("world.country.share", { value: pf.format(share.share * 100) })}</p> : null}
          <p className={styles.note}>{t("world.audience.note", { timeframe: timeframeLabel })}</p>
        </div>
      );
    }
    if (s.type === "vps") {
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle}>{t("world.vps.name")}</h3>
          <p>{world.release.sha ? t("world.berlinBox.release", { sha: world.release.sha.slice(0, 7), time: ago(world.release.started_at) }) : t("world.berlinBox.noRelease")}</p>
          <p className={styles.muted}>{t("world.vps.body")}</p>
        </div>
      );
    }
    if (s.type === "ring") {
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle}>{t("world.ring.name")}</h3>
          <p>{t("world.ring.sub", { n: orbitCount(ig.posts) })}</p>
          <p className={styles.muted}>{t("world.ring.body")}</p>
        </div>
      );
    }
    return (
      <div className={styles.pane}>
        <h3 className={styles.selTitle}>{s.id === "berlin" ? t("world.places.berlin") : anaPlaceLabel ?? t("world.places.anaUnknown")}</h3>
        <p className={styles.muted}>{s.id === "berlin" ? t("world.people.ben.sub") : t("world.sources.placeBody")}</p>
      </div>
    );
  })();

  const sourcesPane = (
    <div className={styles.pane}>
      <dl className={styles.sources}>
        <div>
          <dt>{t("world.sources.snapshot")}</dt>
          <dd>
            <em data-state={world?.instagram.ok ? "ok" : "error"}>{world?.instagram.ok ? t("world.sources.stateOk") : t("world.sources.stateError")}</em> {t("world.sources.snapshotBody", { time: ago(ig?.observed_at ?? null) })}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.pulseName")}</dt>
          <dd>
            <em data-state={world?.pulse.state}>{sourceState(world?.pulse.state ?? "unavailable")}</em> {t("world.sources.pulseBody")} {world?.pulse.fetched_at ? `(${ago(world.pulse.fetched_at)})` : ""}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.audienceName")}</dt>
          <dd>
            <em data-state={world?.audience.state}>{sourceState(world?.audience.state ?? "unavailable")}</em> {t("world.sources.audienceBody")} {world?.audience.fetched_at ? `(${ago(world.audience.fetched_at)})` : ""}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.jira")}</dt>
          <dd>
            <em data-state={workState}>{sourceState(workState)}</em>
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.place")}</dt>
          <dd>
            <em data-state={world?.places.ana ? "ok" : "not-configured"}>{world?.places.ana ? t("world.sources.stateOk") : t("world.sources.stateMissing")}</em> {t("world.sources.placeBody")}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.look")}</dt>
          <dd>
            <em data-state={world && world.ana_look.image_reader !== "off" ? "ok" : "not-configured"}>{world && world.ana_look.image_reader !== "off" ? t("world.sources.stateOk") : t("world.sources.stateMissing")}</em> {t("world.sources.lookBody")}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.confluence")}</dt>
          <dd>
            <em data-state="not-configured">{t("world.sources.stateMissing")}</em> {t("world.sources.confluenceBody")}
          </dd>
        </div>
        <div>
          <dt>{t("world.sources.vince")}</dt>
          <dd>
            <em data-state="not-configured">{t("world.sources.stateMissing")}</em> {t("world.sources.vinceBody")}
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader title={t("world.title")} subtitle={t("world.subtitle")} />
      <div className={styles.layout}>
        <div className={styles.stageCol}>
          <div className={styles.toolbar}>
            <div role="group" aria-label={t("world.views.label")} className={styles.segment}>
              {(["world", "berlin", "ana", "orbit"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} data-testid={`world-view-${v}`}>
                  {t(`world.views.${v}`)}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t("world.layer.label")} className={styles.segment}>
              {(["week", "engaged", "followers"] as const).map((l) => (
                <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)}>
                  {t(`world.layer.${l}`)}
                </button>
              ))}
            </div>
            <span className={styles.pulse} data-state={world?.pulse.state ?? "loading"} data-testid="world-pulse" role="status">
              <span aria-hidden="true" />
              {failure ? t("world.pulse.failed", { reason: failure }) : pulseLine}
            </span>
          </div>
          <div className={styles.stage}>
            <canvas ref={canvasRef} className={styles.canvas} data-testid="world-canvas" role="img" aria-label={t("world.stageLabel")} hidden={gl === "unsupported"} />
            <div ref={labelsRef} className={styles.labels} />
            {world && gl === "ok" ? <WhoBlock view={who} title={whoTitle} t={t} className={styles.who ?? ""} testId="world-who" /> : null}
            {gl === "loading" ? <p className={styles.stageNote}>{t("world.loading")}</p> : null}
            {gl === "unsupported" ? (
              <p className={styles.stageNote} data-testid="world-no-webgl">
                {t("world.noWebgl")}
              </p>
            ) : null}
          </div>
        </div>
        <aside className={styles.panel} aria-label={t("world.tabs.label")}>
          <div
            role="tablist"
            aria-label={t("world.tabs.label")}
            className={styles.tabs}
            onKeyDown={(e) => {
              // WAI-ARIA tabs: arrows, Home and End move between the tabs (only the selected one is in the Tab order)
              const i = TABS.indexOf(tab);
              const next = e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : e.key === "ArrowLeft" ? TABS[(i - 1 + TABS.length) % TABS.length] : e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : undefined;
              if (!next) return;
              e.preventDefault();
              selectTab(next);
              document.getElementById(`world-tab-${next}`)?.focus();
            }}
          >
            {TABS.map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                id={`world-tab-${k}`}
                aria-selected={tab === k}
                aria-controls="world-tabpanel"
                tabIndex={tab === k ? 0 : -1}
                onClick={() => selectTab(k)}
                data-testid={`world-tab-${k}`}
                data-moving={k === "hot" && digest && digest.rising.length > 0 ? "true" : undefined}
                className={k === "hot" ? styles.hotTab : undefined}
              >
                {t(`world.tabs.${k}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="world-tabpanel" aria-labelledby={`world-tab-${tab}`} className={styles.tabpanel}>
            {tab === "now" ? nowPane : tab === "hot" ? hotPane : tab === "selection" ? selectionPane : sourcesPane}
          </div>
        </aside>
      </div>
      {office && world && ig ? (
        <OfficeRoom
          world={world}
          posts={ig.posts}
          t={t}
          locale={locale}
          onClose={closeOffice}
          onPost={(id) => {
            setOffice(false);
            setSelected({ type: "post", id });
            setTab("selection");
          }}
        />
      ) : null}
    </div>
  );
}
