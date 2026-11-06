"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useI18n } from "@/components/providers/I18nProvider";
import { formatAmount, registerDisplay, type RateCard } from "@/features/kit/rateCard";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import type { WorldPost } from "./model";
import { OFFICE_AS_OF, OFFICE_CONFIRMED, OFFICE_MIN_N, OFFICE_SOURCE, OFFICE_TOPICS, officePosts, officeView, ROOM_SPOTS, type BoardDot, type OfficePoint, type OfficeQuadrant, type RoomSpot } from "./office";
import { NEWSLETTER_CHECK_MIN, NEWSLETTER_FEEDS, NEWSLETTERS_PICKED, feedName } from "./newsletters";
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

function Cover({ post, onPost, label, olderLabel }: { post: WorldPost; onPost: (id: string) => void; label: string; olderLabel?: string }) {
  const [broken, setBroken] = useState(false);
  // Meta's CDN picture as it is (no Next image optimisation of a third-party URL)
  // eslint-disable-next-line @next/next/no-img-element
  const picture = post.cover && !broken ? <img src={post.cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} /> : <span aria-hidden="true">▶</span>;
  // an older post is not in the world view: shown, not opened
  if (post.history) {
    return (
      <span className={`${styles.cover} ${styles.coverStatic}`} role="img" aria-label={olderLabel ?? label} data-testid="office-older-cover">
        {picture}
      </span>
    );
  }
  return (
    <button type="button" className={styles.cover} onClick={() => onPost(post.id)} aria-label={label}>
      {picture}
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

/** Whether WebGL is there; the probe's context is released at once (each open of the office probes again). */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2") ?? c.getContext("webgl");
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(ctx);
  } catch {
    return false;
  }
}

const SPOT_ICON: Record<RoomSpot, string> = { board: "📋", computer: "💻", register: "🧾", lamp: "💡" };

/** Ana's rate card as GET /api/rate-card answers it (read when the office opens; never part of the media kit). */
type RateCardState = { state: "loading" } | { state: "ok"; card: RateCard; fileError: boolean } | { state: "failed" };

function useRateCard(): RateCardState {
  const [rc, setRc] = useState<RateCardState>({ state: "loading" });
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/rate-card", { cache: "no-store", signal: ctl.signal })
      .then(async (r) => {
        const body = (await r.json()) as { ok?: boolean; card?: RateCard; error?: boolean };
        setRc(r.ok && body.ok && body.card ? { state: "ok", card: body.card, fileError: body.error === true } : { state: "failed" });
      })
      .catch(() => {
        if (!ctl.signal.aborted) setRc({ state: "failed" });
      });
    return () => ctl.abort();
  }, []);
  return rc;
}

/**
 * Ana's office: a small 3D room you walk into from the world (the hut at Ana's place, or the button in her panel).
 * The board on the wall holds the topics for Substack, the computer shows Ana's media kit (ANA-59), the register on
 * the desk holds her internal rate card (what we quote, the lowest we accept), the lamp just switches. Everything is reachable with the buttons that float over the things too (keyboard, screen readers), and
 * without WebGL the board opens directly.
 */
export function OfficeRoom({ world, posts, t, locale, onClose, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: string; onClose: () => void; onPost: (id: string) => void }) {
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const labelRefs = useRef<Partial<Record<RoomSpot, HTMLButtonElement | null>>>({});
  const [gl, setGl] = useState<"loading" | "ok" | "unsupported" | "failed">("loading");
  // read once when the room is built: the scene is never rebuilt on the same canvas (its context is released on close)
  const reducedRef = useRef(reduced);
  const lastSpot = useRef<RoomSpot>("board");
  const [spot, setSpot] = useState<RoomSpot | null>(null);
  const spotRef = useRef<RoomSpot | null>(null);
  const [lamp, setLamp] = useState(true);
  const [hover, setHover] = useState<RoomSpot | null>(null);
  const rateCard = useRateCard();
  const reader = world.post_topics.state === "on";
  const all = useMemo(() => officePosts(posts, world.post_history), [posts, world.post_history]);
  const view = useMemo(() => officeView(OFFICE_TOPICS, all, reader ? world.post_topics.topics : null), [all, reader, world.post_topics.topics]);
  const dots = useMemo(() => boardDots(view.points, layout(view.points, view.threshold)), [view]);

  const use = useCallback((s: RoomSpot) => {
    if (s === "lamp") {
      setLamp((on) => !on);
      return;
    }
    spotRef.current = s;
    lastSpot.current = s;
    setSpot(s);
    sceneRef.current?.focus(s);
  }, []);
  const back = useCallback(() => {
    spotRef.current = null;
    setSpot(null);
    sceneRef.current?.focus(null);
    // back to the thing you came from, once its button floats again (the follow loop shows it on its next frame)
    requestAnimationFrame(() => requestAnimationFrame(() => labelRefs.current[lastSpot.current]?.focus()));
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
      // the media kit's frame counts as one stop; the guard after it is not a stop (it sends focus back to the start)
      const items = [...room.querySelectorAll<HTMLElement>("button, a[href], summary, iframe, [tabindex='0']")].filter((el) => el.getClientRects().length > 0 && !el.hasAttribute("data-focus-guard"));
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
    // a room that does not load within 8 s gives way to the board, so the office is never an empty box
    let gaveUp = false;
    const slow = setTimeout(() => {
      if (!disposed && !sceneRef.current) {
        gaveUp = true;
        setGl("failed");
      }
    }, 8_000);
    import("./scene/officeRoom")
      .then((mod) => {
        // too late: the board is already open in its place
        if (disposed || gaveUp || !canvas.isConnected) return;
        clearTimeout(slow);
        const scene = mod.createRoomScene(canvas, { reducedMotion: reducedRef.current, ana: PEOPLE.ana.avatar, onPick: use, onHover: setHover });
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
            if (a) el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(${s === "computer" || s === "register" ? "-88%" : s === "lamp" ? "-12%" : "-50%"}, -125%)`;
          }
          raf = requestAnimationFrame(follow);
        };
        raf = requestAnimationFrame(follow);
        setGl("ok");
      })
      .catch(() => {
        if (!disposed) setGl("failed");
      });
    return () => {
      disposed = true;
      clearTimeout(slow);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [use]);

  useEffect(() => {
    if (gl === "ok") sceneRef.current?.setBoard(dots);
  }, [gl, dots]);
  // the register's display: what a Reel costs, once the card is read
  useEffect(() => {
    if (gl === "ok") sceneRef.current?.setRegister(rateCard.state === "ok" ? registerDisplay(rateCard.card) : null);
  }, [gl, rateCard]);
  // opening the board, the computer or the register takes keyboard focus into its drawer
  useEffect(() => {
    if (spot && spot !== "lamp") document.getElementById("office-drawer-title")?.focus();
  }, [spot]);
  useEffect(() => {
    sceneRef.current?.setLamp(lamp);
  }, [lamp, gl]);

  // without WebGL the board is what the room is for: it opens right away
  const flat = gl === "unsupported" || gl === "failed";
  const shown: RoomSpot | null = flat ? "board" : spot;

  const room = (
    <div className={styles.officeBackdrop} data-testid="office-backdrop">
      <div ref={dialogRef} className={styles.officeRoom} role="dialog" aria-modal="true" aria-labelledby="office-title" data-testid="office" data-spot={shown ?? "room"} data-gl={gl}>
        <header className={styles.officeBar}>
          <div>
            <h2 id="office-title">
              <span aria-hidden="true">🏠 </span>
              {t("world.office.title")}
            </h2>
            <p>{gl === "unsupported" ? t("world.office.noWebgl") : gl === "failed" ? t("world.office.loadFailed") : t("world.office.hint")}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.officeExit} onClick={onClose} data-testid="office-close">
            <span aria-hidden="true">🌍 </span>
            {t("world.office.exit")}
          </button>
        </header>
        <div className={styles.officeStage}>
          <canvas ref={canvasRef} className={styles.officeCanvas} role="img" aria-label={t("world.office.roomLabel")} data-testid="office-canvas" hidden={flat} />
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
          {shown === "board" || shown === "computer" || shown === "register" ? (
            <aside className={`${styles.officeDrawer} ${shown === "computer" ? styles.officeDrawerWide : ""}`} aria-labelledby="office-drawer-title" data-testid="office-drawer">
              <div className={styles.officeDrawerHead}>
                <h3 id="office-drawer-title" tabIndex={-1}>
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
              ) : shown === "register" ? (
                <OfficeRateCard rc={rateCard} t={t} />
              ) : (
                // Ana's media kit on her screen (ANA-59): the same page brands will see, with its preview bar
                <OfficeKit t={t} onEscape={back} firstFocus={() => closeRef.current?.focus()} />
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(room, document.body);
}

/**
 * The computer's screen: the media kit page in a frame (same origin, behind the same access gate). Escape inside the
 * kit steps back to the room like everywhere else in the office, Tab past the kit's last link comes back to the start
 * of the room (the guard), and "Open full size" opens the kit with the preset picked in the frame.
 */
function OfficeKit({ t, onEscape, firstFocus }: { t: T; onEscape: () => void; firstFocus: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  }, [onEscape]);
  const onLoad = useCallback(() => {
    try {
      frameRef.current?.contentDocument?.addEventListener("keydown", (e) => {
        if (e.key === "Escape") escRef.current();
      });
    } catch {
      // not the same origin (e.g. a login page in the frame): its own keys stay its own
    }
  }, []);
  const openFull = (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const loc = frameRef.current?.contentWindow?.location;
      if (loc && loc.pathname === "/kit") e.currentTarget.href = `/kit${loc.search}`;
    } catch {
      // keep the plain link
    }
  };
  return (
    <div className={styles.officeComputer} data-testid="office-computer">
      <p className={styles.note}>
        {t("world.office.computerBody")}{" "}
        <a href="/kit" target="_blank" rel="noopener" onClick={openFull} data-testid="office-kit-open">
          {t("world.office.computerOpen")} ↗
        </a>
      </p>
      <iframe ref={frameRef} className={styles.officeKit} src="/kit" title={t("world.office.computerFrame")} onLoad={onLoad} data-testid="office-kit" />
      <span tabIndex={0} data-focus-guard="" onFocus={firstFocus} className={styles.focusGuard} aria-hidden="true" />
    </div>
  );
}

/**
 * The register's drawer: Ana's internal rate card. What we name first (the quote), the lowest we accept where one is
 * set, what each format includes, the add-ons by duration and the team's tips. Brands never see this: their kit names
 * the formats and says "Rates on request".
 */
export function OfficeRateCard({ rc, t }: { rc: RateCardState; t: T }) {
  if (rc.state === "loading") return <p className={styles.note} data-testid="office-rates-loading">{t("world.office.rates.loading")}</p>;
  if (rc.state === "failed") return <p className={styles.note} data-testid="office-rates-failed">{t("world.office.rates.failed")}</p>;
  const { card, fileError } = rc;
  if (!card.rates.length && !card.addons.length) {
    return (
      <p className={styles.note} data-testid="office-rates-empty">
        {t(fileError ? "world.office.rates.unreadable" : "world.office.rates.empty")}
      </p>
    );
  }
  const money = (v: number) => formatAmount(v, card.currency);
  return (
    <div className={styles.rateCard} data-testid="office-rates">
      <p className={styles.note}>{t("world.office.rates.lead")}</p>
      {card.rates.length ? (
        <ul className={styles.rateList} aria-label={t("world.office.rates.formats")}>
          {card.rates.map((r) => (
            <li key={r.id} className={styles.rate} data-testid={`office-rate-${r.id}`}>
              <div className={styles.rateHead}>
                <h4>{r.name}</h4>
                <p className={styles.rateQuote}>
                  <span>{t("world.office.rates.quote")}</span> <strong data-testid={`office-rate-${r.id}-quote`}>{money(r.quote)}</strong>
                </p>
              </div>
              {r.minimum !== null ? (
                <p className={styles.rateMin} data-testid={`office-rate-${r.id}-minimum`}>
                  {t("world.office.rates.minimum")} <strong>{money(r.minimum)}</strong>
                </p>
              ) : null}
              {r.includes.length ? (
                <ul className={styles.rateIncludes}>
                  {r.includes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
              {r.note ? <p className={styles.rateNote}>{r.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {card.addons.length ? (
        <section className={styles.rateAddons} aria-labelledby="office-rates-addons" data-testid="office-rate-addons">
          <h4 id="office-rates-addons">{t("world.office.rates.addons")}</h4>
          <ul>
            {card.addons.map((a) => (
              <li key={a.name}>
                <span className={styles.rateAddonName}>{a.name}</span>
                {a.tiers.length ? (
                  <span className={styles.rateTiers}>
                    {a.tiers.map((x) => (
                      <span key={x.label}>
                        {x.label} <strong>{x.value}</strong>
                      </span>
                    ))}
                  </span>
                ) : null}
                {a.note ? <small>{a.note}</small> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {card.tips.length ? (
        <aside className={styles.rateTips} aria-label={t("world.office.rates.tips")} data-testid="office-rate-tips">
          {card.tips.map((x) => (
            <p key={x}>
              <span aria-hidden="true">💡 </span>
              {x}
            </p>
          ))}
        </aside>
      ) : null}
      <p className={styles.note}>{t("world.office.rates.private")}</p>
    </div>
  );
}

/** The topic board: the matrix and the topics for Substack with their evidence (what the board in the room opens). */
export function OfficeBoard({ world, posts, t, locale, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: string; onPost: (id: string) => void }) {
  const reader = world.post_topics.state === "on";
  const all = useMemo(() => officePosts(posts, world.post_history), [posts, world.post_history]);
  const view = useMemo(() => officeView(OFFICE_TOPICS, all, reader ? world.post_topics.topics : null), [all, reader, world.post_topics.topics]);
  const pos = useMemo(() => layout(view.points, view.threshold), [view]);
  const [picked, setPicked] = useState<string | null>(null);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const nf1 = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);
  const asOf = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${OFFICE_AS_OF}T12:00:00Z`)), [locale]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const asOfPicked = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${NEWSLETTERS_PICKED}T12:00:00Z`)), [locale]);

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
  // the posts read for topics: the Instagram snapshot (the live pulse adds a few without numbers, never read) and the
  // older posts of the history list
  const snapshot = world.instagram.ok ? world.instagram.snapshot.posts.map((x) => x.media_id) : null;
  // without the snapshot (Instagram down) the posts in view are what the board reads
  const readable = snapshot ? [...new Set([...snapshot, ...world.post_history.posts.map((h) => h.id)])] : all.filter((p) => !p.fresh).map((p) => p.id);
  const total = readable.length;
  const read = readable.filter((id) => Object.hasOwn(world.post_topics.topics, id)).length;
  const ph = world.post_history;
  const historyLine =
    ph.state !== "on"
      ? null
      : ph.store_error
        ? t("world.office.historyStoreError")
        : ph.total === 0
          ? ph.list_failing
            ? t("world.office.historyFailing")
            : t("world.office.historyWaiting")
          : [
              t("world.office.history", { n: ph.total, date: ph.oldest ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(ph.oldest)) : "?" }),
              ph.waiting > 0 ? t("world.office.historyNumbersWaiting", { n: ph.waiting }) : "",
              ph.list_failing ? t("world.office.historyFailing") : "",
              ph.numbers_failing ? t("world.office.historyNumbersFailing") : "",
            ]
              .filter(Boolean)
              .join(" ");
  const nl = world.newsletters;
  const day = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const berlinDay = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));
  // per topic only once posts were checked; "none" only when every post is checked and no feed is failing
  const nlTopics = nl.state === "on" && nl.feeds_read > 0 && nl.checked > 0;
  const span = nl.since ? t("world.office.spanSince", { date: day(nl.since) }) : t("world.office.spanDays");
  const nlLine = (id: string) => {
    const topic = nl.topics[id];
    if (topic && topic.feeds.length > 0) return t("world.office.newsletters", { k: topic.feeds.length, n: nl.feeds_read, span, posts: topic.posts, names: topic.feeds.map(feedName).join(", ") });
    return nl.complete ? t("world.office.newslettersNone", { n: nl.feeds_read, span }) : t("world.office.newslettersSoFar", { checked: nl.checked, posts: nl.posts });
  };
  const nlAsOf = (() => {
    if (nl.state !== "on") return t("world.office.newslettersOff");
    if (nl.store_error) return t("world.office.newslettersStoreError");
    if (nl.read_at === null) return nl.feeds_failing > 0 ? t("world.office.newslettersNeverRead", { n: nl.feeds_failing }) : t("world.office.newslettersWaiting");
    const parts = [t("world.office.newslettersAsOf", { read: nl.feeds_read, feeds: nl.feeds, date: berlinDay(nl.read_at), checked: nl.checked, posts: nl.posts })];
    if (nl.feeds_failing > 0) parts.push(t("world.office.newslettersFeedsFailing", { n: nl.feeds_failing }));
    if (nl.unreadable > 0) parts.push(t("world.office.newslettersUnreadable", { n: nl.unreadable }));
    return parts.join(" ");
  })();
  const pct = (x: { checked: number; matched: number }) => Math.round((100 * x.matched) / x.checked);
  const nlCheck =
    nl.state === "on" && nl.check.core.checked >= NEWSLETTER_CHECK_MIN && nl.check.control.checked >= NEWSLETTER_CHECK_MIN
      ? t("world.office.newsletterCheck", { core: nl.check.core.feeds, control: nl.check.control.feeds, a: pct(nl.check.core), b: pct(nl.check.control) })
      : null;

  return (
    <div className={styles.officeBoard} data-testid="office-board">
        <p className={styles.officeLead}>{t("world.office.lead")}</p>
        <p className={styles.muted} data-testid="office-asof">
          {reader ? t("world.office.asOf", { source: OFFICE_SOURCE, date: asOf, read, total }) : t("world.office.readerOff")}
          {reader && world.post_topics.failing > 0 ? ` ${t("world.office.failing", { n: world.post_topics.failing })}` : ""}
        </p>
        {historyLine ? <p className={styles.muted} data-testid="office-history">{historyLine}</p> : null}
        <p className={styles.muted} data-testid="office-newsletters-asof">{nlAsOf}</p>
        {nlCheck ? <p className={styles.muted} data-testid="office-newsletters-check">{nlCheck}</p> : null}
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
                      const hits = nlTopics ? (nl.topics[p.id]?.hits ?? []) : [];
                      return (
                        <li key={p.id} id={`office-topic-${p.id}`} data-picked={picked === p.id} data-testid={`office-topic-${p.id}`}>
                          <span className={styles.officeNum} data-quadrant={p.quadrant} aria-hidden="true">{p.n}</span>
                          <div>
                            <b>{t(`world.office.topics.${p.id}` as never)}</b> <span className={styles.chip}>{t(`world.office.lane.${p.lane}`)}</span>
                            <p>{t("world.office.outside", { reactions: nf.format(p.outside.reactions), threads: p.outside.threads, forums: p.outside.forums.join(", ") })}</p>
                            {nlTopics ? <p data-testid={`office-newsletters-${p.id}`}>{nlLine(p.id)}</p> : null}
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
                              {hits.length ? (
                                <>
                                  <h5>{t("world.office.newsletterEvidence")}</h5>
                                  <ul>
                                    {hits.slice(0, 5).map((h) => (
                                      <li key={h.url}>
                                        <a href={h.url} target="_blank" rel="noreferrer noopener">{h.title}</a>
                                        <br />
                                        <span className={styles.muted}>
                                          {feedName(h.feed)} · {day(h.date)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              ) : null}
                              {mine.length ? (
                                <>
                                  <h5>{t("world.office.posts")}</h5>
                                  <div className={styles.signalCovers}>
                                    {mine.slice(0, 6).map((m) => (
                                      <Cover key={m.id} post={m} onPost={onPost} label={t("world.simple.openPost")} olderLabel={t("world.office.olderPost")} />
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
          {nl.state === "on" ? (
            <p className={styles.note}>
              {t("world.office.newsletterMethod", { feeds: NEWSLETTER_FEEDS.length, core: nl.feeds, control: NEWSLETTER_FEEDS.length - nl.feeds, date: asOfPicked })}
            </p>
          ) : null}
          <p className={styles.note}>{t("world.office.next")}</p>
        </footer>
    </div>
  );
}
