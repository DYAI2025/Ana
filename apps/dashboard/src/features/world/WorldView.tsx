"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/components/providers/I18nProvider";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { channelStatuses, instagramView, pulseEvents, shares, type ChannelView, type PulseEvent, type ShareEntry } from "./model";
import { PEOPLE, PROJECTS, type WorldPersonId } from "./people";
import type { AudienceSeries, WorldPayload } from "./types";
import type { SceneData, SceneRef, StationStatus, ViewName, WorldScene } from "./scene/world";
import styles from "./world.module.css";

type Tab = "now" | "selection" | "sources";
type Layer = "engaged" | "followers";
const POLL_MS = 60_000;

function useWorld(sinkRef: { current: (e: PulseEvent[]) => void }) {
  const [world, setWorld] = useState<WorldPayload | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const prevRef = useRef<WorldPayload | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
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
        if (alive) timer = setTimeout(load, document.hidden ? POLL_MS * 2 : POLL_MS);
      }
    };
    // coming back to the tab reads at once instead of waiting for the next minute
    const again = () => {
      if (document.hidden || !alive) return;
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
  return { world, failure, events };
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
  return layer === "engaged" ? (kind === "country" ? a.engaged_country : a.engaged_city) : kind === "country" ? a.follower_country : a.follower_city;
}

export function WorldView() {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const sceneRef = useRef<WorldScene | null>(null);
  const sinkRef = useRef<(e: PulseEvent[]) => void>((ev) => sceneRef.current?.burst(ev));
  const { world, failure, events } = useWorld(sinkRef);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState<"loading" | "ok" | "unsupported">("loading");
  const [view, setView] = useState<ViewName>("world");
  const [layer, setLayer] = useState<Layer>("engaged");
  const [tab, setTab] = useState<Tab>("now");
  const [selected, setSelected] = useState<SceneRef | null>(null);
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

  const countries: Array<ShareEntry & { label: string }> = useMemo(() => (world ? shares(seriesOf(world, layer, "country")).map((c) => ({ ...c, label: country(c.key) })) : []), [world, layer, country]);
  const anaPlaceLabel = world?.places.ana?.label ?? null;

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
          ana: { name: PEOPLE.ana.name, sub: t("world.people.ana.sub", { place: anaPlaceLabel ?? "—" }) },
          ben: { name: PEOPLE.ben.name, sub: t("world.people.ben.sub") },
          vince: { name: PEOPLE.vince.name, sub: t("world.people.vince.sub") },
        },
        berlin: t("world.places.berlin"),
        anaPlace: anaPlaceLabel ? t("world.places.anaSet", { place: anaPlaceLabel }) : t("world.places.anaUnknown"),
        vps: t("world.vps.name"),
        vpsSub: world.release.sha ? t("world.vps.sub", { sha: world.release.sha.slice(0, 7) }) : t("world.vps.subLocal"),
        ring: t("world.ring.name"),
        ringSub: t("world.ring.sub", { n: ig.posts.length }),
        notConnected: t("world.channels.not-connected"),
      },
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

  const postTitle = (id: string | null) => {
    const p = ig?.posts.find((x) => x.id === id);
    const c = p?.caption?.replace(/\s+/g, " ").trim();
    return c ? (c.length > 48 ? `${c.slice(0, 47)}…` : c) : t("world.feed.untitled");
  };
  const eventText = (e: PulseEvent) => {
    if (e.kind === "new-post") return t("world.feed.newPost");
    if (e.kind === "followers") return t("world.feed.followers", { n: e.delta > 0 ? `+${e.delta}` : String(e.delta) });
    const key = e.kind === "likes" ? (e.delta > 0 ? "world.feed.likes" : "world.feed.likesDown") : e.delta > 0 ? "world.feed.comments" : "world.feed.commentsDown";
    return t(key, { n: e.delta > 0 ? e.delta : e.delta, post: postTitle(e.postId) });
  };

  const pulseLine = !world ? t("world.pulse.waiting") : world.pulse.state === "ok" ? t("world.pulse.live", { time: ago(world.pulse.fetched_at) }) : world.pulse.fetched_at ? t("world.pulse.failed", { reason: world.pulse.reason ?? world.pulse.state }) : t("world.pulse.waiting");
  const timeframe = world?.audience.timeframe ?? "this_month";
  const timeframeLabel = timeframe === "this_week" ? t("world.audience.timeframes.this_week") : t("world.audience.timeframes.this_month");

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
    </section>
  ) : null;

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
          <b>{num(ig ? Math.min(30, ig.posts.length) : null)}</b>
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

  const selectionPane = (() => {
    if (!selected || !world || !ig) return <div className={styles.pane}><p className={styles.muted}>{t("world.selectHint")}</p></div>;
    const s = selected;
    if (s.type === "person") {
      const p = PEOPLE[s.id as WorldPersonId];
      const own = PROJECTS.filter((x) => x.owner === s.id);
      const place = s.id === "ana" ? world.places.ana : null;
      const local = place ? new Date(now + Math.round(place.lon / 15) * 3_600_000).toISOString().slice(11, 16) : new Intl.DateTimeFormat(locale, { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(now));
      return (
        <div className={styles.pane}>
          <h3 className={styles.selTitle} style={{ ["--tint" as string]: p.tint }}>{p.name}</h3>
          <p>{s.id === "ana" ? (place ? place.label : t("world.places.anaUnknown")) : t("world.places.berlin")}</p>
          {s.id !== "ana" || place ? <p className={styles.muted}>{s.id === "ana" ? t("world.people.localTimeEstimated", { time: local }) : t("world.people.localTime", { time: local })}</p> : null}
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
          <p>{t("world.ring.sub", { n: ig.posts.length })}</p>
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
              {(["engaged", "followers"] as const).map((l) => (
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
            {gl === "loading" ? <p className={styles.stageNote}>{t("world.loading")}</p> : null}
            {gl === "unsupported" ? (
              <p className={styles.stageNote} data-testid="world-no-webgl">
                {t("world.noWebgl")}
              </p>
            ) : null}
          </div>
        </div>
        <aside className={styles.panel} aria-label={t("world.tabs.label")}>
          <div role="tablist" aria-label={t("world.tabs.label")} className={styles.tabs}>
            {(["now", "selection", "sources"] as const).map((k) => (
              <button key={k} role="tab" type="button" id={`world-tab-${k}`} aria-selected={tab === k} aria-controls="world-tabpanel" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)} data-testid={`world-tab-${k}`}>
                {t(`world.tabs.${k}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="world-tabpanel" aria-labelledby={`world-tab-${tab}`} className={styles.tabpanel}>
            {tab === "now" ? nowPane : tab === "selection" ? selectionPane : sourcesPane}
          </div>
        </aside>
      </div>
    </div>
  );
}
