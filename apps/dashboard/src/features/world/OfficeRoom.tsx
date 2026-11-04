"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useI18n } from "@/components/providers/I18nProvider";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import type { WorldPost } from "./model";
import { OFFICE_AS_OF, OFFICE_CONFIRMED, OFFICE_MIN_N, OFFICE_SOURCE, OFFICE_TOPICS, officeView, ROOM_SPOTS, type BoardDot, type OfficePoint, type OfficeQuadrant, type RoomSpot } from "./office";
import { PEOPLE } from "./people";
import type { RoomScene } from "./scene/officeRoom";
import type { WorldPayload } from "./types";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];

const QUADRANTS: readonly OfficeQuadrant[] = ["starter", "test", "niche", "skip"];

// the plot inside the SVG (viewBox 0 0 420 336)
const W = 420;
const H = 336;
const L = 40;
const R = 410;
const TOP = 12;
const MID_Y = 128;
const UNTESTED_LINE = 222;
const BOTTOM = 304;
const MID_X = (L + R) / 2;
const PAD = 14;
const DOT = 11;
// room for the quadrant names in the corners
const LABEL = 18;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lg = (v: number) => Math.log(v + 1);
const STEP = DOT * 2 + 3;
// where a dot may move when its spot is taken: rings of growing distance around it
const NUDGES: Array<[number, number]> = [[0, 0]];
for (let ring = 1; ring <= 4; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) NUDGES.push([dx * STEP, dy * STEP]);
NUDGES.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));

/**
 * Positions in the SVG: x by outside reactions (median topic = the middle line), y by Ana's save+share index; topics not
 * tested by her audience sit in the band at the bottom. A dot never leaves its quadrant (or band) and never covers another.
 */
function layout(points: readonly OfficePoint[], threshold: number): Map<string, { x: number; y: number }> {
  const rs = points.map((p) => p.outside.reactions);
  const lo = Math.min(...rs);
  const hi = Math.max(...rs);
  const out = new Map<string, { x: number; y: number }>();
  for (const p of points) {
    const r = p.outside.reactions;
    const [x0, x1] = p.outside.high ? [MID_X + PAD, R - PAD] : [L + PAD, MID_X - PAD];
    const x = p.outside.high ? x0 + clamp01((lg(r) - lg(threshold)) / (lg(hi) - lg(threshold) || 1)) * (x1 - x0) : x0 + clamp01((lg(r) - lg(lo)) / (lg(threshold) - lg(lo) || 1)) * (x1 - x0);
    const i = p.ana.index;
    const [y0, y1] = i === null ? [UNTESTED_LINE + PAD, BOTTOM - DOT] : i >= OFFICE_CONFIRMED ? [TOP + LABEL + DOT, MID_Y - PAD] : [MID_Y + LABEL + DOT, UNTESTED_LINE - PAD];
    const y =
      i === null
        ? y0
        : i >= OFFICE_CONFIRMED
          ? y1 - clamp01((Math.log(i) - Math.log(OFFICE_CONFIRMED)) / (Math.log(3) - Math.log(OFFICE_CONFIRMED))) * (y1 - y0)
          : y0 + clamp01((Math.log(OFFICE_CONFIRMED) - Math.log(Math.max(i, 0.05))) / (Math.log(OFFICE_CONFIRMED) - Math.log(0.3))) * (y1 - y0);
    const free = (cx: number, cy: number) => [...out.values()].every((o) => Math.hypot(o.x - cx, o.y - cy) >= STEP);
    const spot = NUDGES.map(([dx, dy]) => [x + dx, y + dy] as const).find(([cx, cy]) => cx >= x0 - PAD + DOT && cx <= x1 + PAD - DOT && cy >= y0 && cy <= y1 && free(cx, cy));
    out.set(p.id, spot ? { x: spot[0], y: spot[1] } : { x, y });
  }
  return out;
}

function Cover({ post, onPost, label }: { post: WorldPost; onPost: (id: string) => void; label: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <button type="button" className={styles.cover} onClick={() => onPost(post.id)} aria-label={label}>
      {/* Meta's CDN picture as it is (no Next image optimisation of a third-party URL) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {post.cover && !broken ? <img src={post.cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} /> : <span aria-hidden="true">▶</span>}
    </button>
  );
}

/** Where each topic sits inside its quadrant (0..1 from the left and from the bottom), for the board in the room. */
export function boardDots(points: readonly OfficePoint[], pos: ReadonlyMap<string, { x: number; y: number }>): BoardDot[] {
  return points.map((p) => {
    const at = pos.get(p.id) ?? { x: MID_X, y: MID_Y };
    const [x0, x1] = p.outside.high ? [MID_X, R] : [L, MID_X];
    const [y0, y1] = p.quadrant === "starter" || p.quadrant === "niche" ? [TOP, MID_Y] : [MID_Y, BOTTOM];
    return { n: p.n, quadrant: p.quadrant, tested: p.ana.index !== null, x: Math.max(0, Math.min(1, (at.x - x0) / (x1 - x0))), y: Math.max(0, Math.min(1, (y1 - at.y) / (y1 - y0))) };
  });
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const SPOT_ICON: Record<RoomSpot, string> = { board: "📋", computer: "💻", lamp: "💡" };

/**
 * Ana's office: a small 3D room you walk into from the world (the hut at Ana's place, or the button in her panel).
 * The board on the wall holds the topics for Substack, the computer is where Claude will answer later, the lamp just
 * switches. Everything is reachable with the buttons that float over the things too (keyboard, screen readers), and
 * without WebGL the board opens directly.
 */
export function OfficeRoom({ world, posts, t, locale, onClose, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: string; onClose: () => void; onPost: (id: string) => void }) {
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const labelRefs = useRef<Partial<Record<RoomSpot, HTMLButtonElement | null>>>({});
  const [gl, setGl] = useState<"loading" | "ok" | "unsupported">("loading");
  const [spot, setSpot] = useState<RoomSpot | null>(null);
  const spotRef = useRef<RoomSpot | null>(null);
  const [lamp, setLamp] = useState(true);
  const [hover, setHover] = useState<RoomSpot | null>(null);
  const reader = world.post_topics.state === "on";
  const view = useMemo(() => officeView(OFFICE_TOPICS, posts, reader ? world.post_topics.topics : null), [posts, reader, world.post_topics.topics]);
  const dots = useMemo(() => boardDots(view.points, layout(view.points, view.threshold)), [view]);

  const use = useCallback((s: RoomSpot) => {
    if (s === "lamp") {
      setLamp((on) => !on);
      return;
    }
    spotRef.current = s;
    setSpot(s);
    sceneRef.current?.focus(s);
  }, []);
  const back = useCallback(() => {
    spotRef.current = null;
    setSpot(null);
    sceneRef.current?.focus(null);
    requestAnimationFrame(() => labelRefs.current.board?.focus());
  }, []);

  // focus moves into the room and back to where it came from (or to the office button when that is gone).
  // Escape steps back (board → room → world) and Tab stays inside, wherever focus happens to be;
  // only another dialog on top keeps its own keys
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const room = dialogRef.current;
      if (!room) return;
      const at = document.activeElement;
      const otherDialog = at instanceof Element && !room.contains(at) && at.closest("[role='dialog']") !== null;
      if (otherDialog) return;
      if (e.key === "Escape") {
        if (spotRef.current) back();
        else onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...room.querySelectorAll<HTMLElement>("button, a[href], summary, [tabindex='0']")].filter((el) => el.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (!at || !room.contains(at)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = before && before !== document.body && before.isConnected ? before : document.querySelector<HTMLElement>('[data-testid="office-open"]');
      target?.focus?.();
    };
  }, [onClose, back]);

  // the 3D room: loaded lazily, never on the server; the floating buttons follow their things every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!supportsWebGL()) {
      void Promise.resolve().then(() => setGl("unsupported"));
      return;
    }
    let disposed = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    import("./scene/officeRoom")
      .then((mod) => {
        if (disposed) return;
        const scene = mod.createRoomScene(canvas, { reducedMotion: reduced, ana: PEOPLE.ana.avatar, onPick: use, onHover: setHover });
        sceneRef.current = scene;
        ro = new ResizeObserver(() => scene.resize());
        ro.observe(canvas);
        const follow = () => {
          const at = scene.anchors();
          for (const s of ROOM_SPOTS) {
            const el = labelRefs.current[s];
            const a = at[s];
            if (!el) continue;
            el.style.visibility = a ? "visible" : "hidden";
            // the computer's sign leans left, the lamp's right: they stand close together on the desk
            if (a) el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(${s === "computer" ? "-88%" : s === "lamp" ? "-12%" : "-50%"}, -125%)`;
          }
          raf = requestAnimationFrame(follow);
        };
        raf = requestAnimationFrame(follow);
        setGl("ok");
      })
      .catch(() => {
        if (!disposed) setGl("unsupported");
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [reduced, use]);

  useEffect(() => {
    if (gl === "ok") sceneRef.current?.setBoard(dots);
  }, [gl, dots]);
  useEffect(() => {
    sceneRef.current?.setLamp(lamp);
  }, [lamp, gl]);

  // without WebGL the board is what the room is for: it opens right away
  const shown: RoomSpot | null = gl === "unsupported" ? "board" : spot;

  const room = (
    <div className={styles.officeBackdrop} data-testid="office-backdrop">
      <div ref={dialogRef} className={styles.officeRoom} role="dialog" aria-modal="true" aria-labelledby="office-title" data-testid="office" data-spot={shown ?? "room"} data-gl={gl}>
        <header className={styles.officeBar}>
          <div>
            <h2 id="office-title">
              <span aria-hidden="true">🏠 </span>
              {t("world.office.title")}
            </h2>
            <p>{gl === "unsupported" ? t("world.office.noWebgl") : t("world.office.hint")}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.officeExit} onClick={onClose} data-testid="office-close">
            <span aria-hidden="true">🌍 </span>
            {t("world.office.exit")}
          </button>
        </header>
        <div className={styles.officeStage}>
          <canvas ref={canvasRef} className={styles.officeCanvas} role="img" aria-label={t("world.office.roomLabel")} data-testid="office-canvas" hidden={gl === "unsupported"} />
          <div className={styles.officeSpots} hidden={gl !== "ok"}>
            {ROOM_SPOTS.map((s) => (
              <button
                key={s}
                ref={(el) => {
                  labelRefs.current[s] = el;
                }}
                type="button"
                className={styles.officeSpot}
                data-active={shown === s || (s === "lamp" && lamp) || hover === s}
                aria-pressed={s === "lamp" ? lamp : undefined}
                onClick={() => use(s)}
                data-testid={`office-spot-${s}`}
              >
                <span aria-hidden="true">{SPOT_ICON[s]} </span>
                {s === "lamp" ? t(lamp ? "world.office.spots.lampOn" : "world.office.spots.lampOff") : t(`world.office.spots.${s}`)}
              </button>
            ))}
          </div>
          {shown === "board" || shown === "computer" ? (
            <aside className={styles.officeDrawer} aria-labelledby="office-drawer-title" data-testid="office-drawer">
              <div className={styles.officeDrawerHead}>
                <h3 id="office-drawer-title">
                  <span aria-hidden="true">{SPOT_ICON[shown]} </span>
                  {t(`world.office.spots.${shown}`)}
                </h3>
                {gl === "ok" ? (
                  <button type="button" className={styles.officeBack} onClick={back} data-testid="office-back">
                    ← {t("world.office.back")}
                  </button>
                ) : null}
              </div>
              {shown === "board" ? (
                <OfficeBoard world={world} posts={posts} t={t} locale={locale} onPost={onPost} />
              ) : (
                <div className={styles.officeComputer} data-testid="office-computer">
                  <p>{t("world.office.computerBody")}</p>
                  <p className={styles.note}>{t("world.office.computerNote")}</p>
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(room, document.body);
}

/** The topic board: the matrix and the topics for Substack with their evidence (what the board in the room opens). */
export function OfficeBoard({ world, posts, t, locale, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: string; onPost: (id: string) => void }) {
  const reader = world.post_topics.state === "on";
  const view = useMemo(() => officeView(OFFICE_TOPICS, posts, reader ? world.post_topics.topics : null), [posts, reader, world.post_topics.topics]);
  const pos = useMemo(() => layout(view.points, view.threshold), [view]);
  const [picked, setPicked] = useState<string | null>(null);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const nf1 = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);
  const asOf = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${OFFICE_AS_OF}T12:00:00Z`)), [locale]);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  const pick = (id: string) => {
    setPicked(id);
    document.getElementById(`office-topic-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const anaLine = (p: OfficePoint) =>
    p.ana.index !== null
      ? t("world.office.anaIndex", { n: p.ana.n, index: nf1.format(p.ana.index) })
      : p.ana.n === 0
        ? t("world.office.anaNone")
        : p.ana.n >= OFFICE_MIN_N
          ? t("world.office.anaNoBase", { n: p.ana.n })
          : t("world.office.anaFew", { n: p.ana.n, min: OFFICE_MIN_N });
  // the posts actually in the Instagram snapshot (the live pulse adds a few without numbers, never read for topics)
  const snapshot = world.instagram.ok ? world.instagram.snapshot.posts.map((x) => x.media_id) : null;
  const total = snapshot ? snapshot.length : posts.length;
  const read = snapshot ? snapshot.filter((id) => Object.hasOwn(world.post_topics.topics, id)).length : view.read;

  return (
    <div className={styles.officeBoard} data-testid="office-board">
        <p className={styles.officeLead}>{t("world.office.lead")}</p>
        <p className={styles.muted} data-testid="office-asof">
          {reader ? t("world.office.asOf", { source: OFFICE_SOURCE, date: asOf, read, total }) : t("world.office.readerOff")}
          {reader && world.post_topics.failing > 0 ? ` ${t("world.office.failing", { n: world.post_topics.failing })}` : ""}
        </p>
        <div className={styles.officeBody}>
          <figure className={styles.officeMatrix}>
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("world.office.matrixLabel")} data-testid="office-matrix">
              <rect x={MID_X} y={TOP} width={R - MID_X} height={MID_Y - TOP} className={styles.qStarter} />
              <rect x={L} y={TOP} width={MID_X - L} height={MID_Y - TOP} className={styles.qNiche} />
              <rect x={MID_X} y={MID_Y} width={R - MID_X} height={BOTTOM - MID_Y} className={styles.qTest} />
              <rect x={L} y={MID_Y} width={MID_X - L} height={BOTTOM - MID_Y} className={styles.qSkip} />
              <line x1={L} x2={R} y1={UNTESTED_LINE} y2={UNTESTED_LINE} className={styles.qSplit} />
              <text x={L + 6} y={UNTESTED_LINE - 4} className={styles.qUntested}>
                {t("world.office.untested")} ↓
              </text>
              <text x={R - 6} y={TOP + 14} textAnchor="end" className={styles.qLabel}>{t("world.office.quadrant.starter")}</text>
              <text x={L + 6} y={TOP + 14} className={styles.qLabel}>{t("world.office.quadrant.niche")}</text>
              <text x={R - 6} y={MID_Y + 14} textAnchor="end" className={styles.qLabel}>{t("world.office.quadrant.test")}</text>
              <text x={L + 6} y={MID_Y + 14} className={styles.qLabel}>{t("world.office.quadrant.skip")}</text>
              <text x={(L + R) / 2} y={H - 12} textAnchor="middle" className={styles.qAxis}>{t("world.office.axisX")}</text>
              <text x={14} y={(TOP + BOTTOM) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(TOP + BOTTOM) / 2})`} className={styles.qAxis}>{t("world.office.axisY")}</text>
              {view.points.map((p) => {
                const at = pos.get(p.id) as { x: number; y: number };
                const label = `${p.n}. ${t(`world.office.topics.${p.id}` as never)} – ${t(`world.office.quadrant.${p.quadrant}`)}`;
                return (
                  <g
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={picked === p.id}
                    className={styles.qDot}
                    data-quadrant={p.quadrant}
                    data-tested={p.ana.index !== null}
                    data-testid={`office-dot-${p.id}`}
                    onClick={() => pick(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick(p.id);
                      }
                    }}
                  >
                    <title>{label}</title>
                    {picked === p.id ? <circle cx={at.x} cy={at.y} r={DOT + 5} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2.5 }} /> : null}
                    <circle cx={at.x} cy={at.y} r={DOT} />
                    <text x={at.x} y={at.y + 4} textAnchor="middle">{p.n}</text>
                  </g>
                );
              })}
            </svg>
          </figure>
          <section className={styles.officeList} aria-labelledby="office-list-title">
            <h3 id="office-list-title">{t("world.office.listTitle")}</h3>
            {QUADRANTS.map((q) => {
              const items = view.points.filter((p) => p.quadrant === q);
              if (!items.length) return null;
              return (
                <div key={q} className={styles.officeGroup} data-quadrant={q} data-testid={`office-group-${q}`}>
                  <h4>{t(`world.office.quadrant.${q}`)}</h4>
                  <p className={styles.muted}>{t(`world.office.quadrantHint.${q}`)}</p>
                  <ol className={styles.officeTopics}>
                    {items.map((p) => {
                      const topic = OFFICE_TOPICS.find((x) => x.id === p.id);
                      const mine = p.ana.posts.map((id) => byId.get(id)).filter((x): x is WorldPost => x !== undefined);
                      return (
                        <li key={p.id} id={`office-topic-${p.id}`} data-picked={picked === p.id} data-testid={`office-topic-${p.id}`}>
                          <span className={styles.officeNum} data-quadrant={p.quadrant} aria-hidden="true">{p.n}</span>
                          <div>
                            <b>{t(`world.office.topics.${p.id}` as never)}</b> <span className={styles.chip}>{t(`world.office.lane.${p.lane}`)}</span>
                            <p>{t("world.office.outside", { reactions: nf.format(p.outside.reactions), threads: p.outside.threads, forums: p.outside.forums.join(", ") })}</p>
                            <p>{anaLine(p)}</p>
                            {p.ana.state === "weak" ? <p className={styles.muted} data-testid={`office-weak-${p.id}`}>{t("world.office.anaWeak")}</p> : null}
                            <details className={styles.briefFacts} open={picked === p.id ? true : undefined}>
                              <summary>{t("world.office.why")}</summary>
                              <h5>{t("world.office.evidence")}</h5>
                              <ul>
                                {topic?.evidence.map((e) => (
                                  <li key={e.url}>
                                    <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a>
                                    <br />
                                    <span className={styles.muted}>
                                      {e.where} · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${e.date}T12:00:00Z`))} ·{" "}
                                      {t("world.office.reactionsShort", { up: nf.format(e.up), comments: nf.format(e.comments) })}
                                      {e.views !== undefined ? ` · ${t("world.office.viewsShort", { views: nf.format(e.views) })}` : ""}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {mine.length ? (
                                <>
                                  <h5>{t("world.office.posts")}</h5>
                                  <div className={styles.signalCovers}>
                                    {mine.slice(0, 6).map((m) => (
                                      <Cover key={m.id} post={m} onPost={onPost} label={t("world.simple.openPost")} />
                                    ))}
                                  </div>
                                </>
                              ) : null}
                            </details>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </section>
        </div>
        <footer className={styles.officeFoot}>
          <p>{t("world.office.hypothesis")}</p>
          <p className={styles.note}>{t("world.office.method")}</p>
          <p className={styles.note}>{t("world.office.next")}</p>
        </footer>
    </div>
  );
}
