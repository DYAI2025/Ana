"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useI18n } from "@/components/providers/I18nProvider";
import type { WorldPost } from "./model";
import { OFFICE_AS_OF, OFFICE_CONFIRMED, OFFICE_MIN_N, OFFICE_SOURCE, OFFICE_TOPICS, officeView, type OfficePoint, type OfficeQuadrant } from "./office";
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

/**
 * Ana's office: the topic matrix (outside talk × Ana's save+share) and the topics for Substack with their evidence.
 * Opens over the world as a dialog when Ana is picked; every topic is a hypothesis until a real post tests it.
 */
export function OfficeRoom({ world, posts, t, locale, onClose, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: string; onClose: () => void; onPost: (id: string) => void }) {
  const reader = world.post_topics.state === "on";
  const view = useMemo(() => officeView(OFFICE_TOPICS, posts, reader ? world.post_topics.topics : null), [posts, reader, world.post_topics.topics]);
  const pos = useMemo(() => layout(view.points, view.threshold), [view]);
  const [picked, setPicked] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const nf1 = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);
  const asOf = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${OFFICE_AS_OF}T12:00:00Z`)), [locale]);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  // focus moves into the room and back to where it came from (or to the office button when that is gone).
  // Escape closes and Tab stays inside the room, wherever focus happens to be (also when it fell to the page body);
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
        onClose();
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
  }, [onClose]);

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

  const room = (
    <div className={styles.officeBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="office-backdrop">
      <div ref={dialogRef} className={styles.office} role="dialog" aria-modal="true" aria-labelledby="office-title" data-testid="office">
        <header className={styles.officeHead}>
          <div>
            <h2 id="office-title">
              <span aria-hidden="true">🗂️ </span>
              {t("world.office.title")}
            </h2>
            <p>{t("world.office.subtitle")}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.officeClose} onClick={onClose} aria-label={t("world.office.close")} data-testid="office-close">
            ✕
          </button>
        </header>
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
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(room, document.body);
}
