"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/providers/I18nProvider";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { PEOPLE } from "@/features/world/people";
import worldStyles from "@/features/world/world.module.css";
import { officeApi, type TicketSummary } from "./api";
import { OfficeBoard } from "./OfficeBoard";
import { BERLIN_SPOTS, type BerlinScene, type BerlinSpot, type WallNote } from "./scene/berlinRoom";

const SPOT_ICON: Record<BerlinSpot, string> = { board: "📋", ben: "💻", vince: "📣" };
// the room re-reads the board this often while it is open, so new notes appear without a reload
const REFRESH_MS = 30_000;

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The ticket a person holds right now: their oldest-placed ticket in "doing". */
export function deskTicket(tickets: readonly TicketSummary[], person: "ben" | "vince"): TicketSummary | null {
  return tickets.filter((x) => x.column === "doing" && x.assignee === person).sort((a, b) => a.position - b.position)[0] ?? null;
}

export function wallNotes(tickets: readonly TicketSummary[]): WallNote[] {
  return [...tickets]
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map((x) => ({ id: x.id, title: x.title, column: x.column, assignee: x.assignee, question: x.openQuestions > 0 }));
}

/**
 * Office Berlin: a 3D room in the world (same comic kit as Ana's office) around the ticket board. The wall and the
 * desk notes are drawn from the same API as the board; the readable board opens as a drawer over the room. Without
 * WebGL, or when the room does not load within 8 s, the board opens right away, so the room is never an empty box.
 */
export function BerlinRoom({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BerlinScene | null>(null);
  const labelRefs = useRef<Partial<Record<BerlinSpot, HTMLButtonElement | null>>>({});
  const lastSpot = useRef<BerlinSpot>("board");
  const spotRef = useRef<BerlinSpot | null>(null);
  const ticketsRef = useRef<TicketSummary[] | null>(null);
  const [gl, setGl] = useState<"loading" | "ok" | "unsupported" | "failed">("loading");
  const [spot, setSpot] = useState<BerlinSpot | null>(null);
  const [hover, setHover] = useState<BerlinSpot | null>(null);

  const paint = useCallback(
    (tickets: TicketSummary[]) => {
      ticketsRef.current = tickets;
      const scene = sceneRef.current;
      if (!scene) return;
      scene.setWall(wallNotes(tickets), {
        columns: { todo: t("officeBoard.columns.todo"), doing: t("officeBoard.columns.doing"), done: t("officeBoard.columns.done") },
        more: (n) => t("officeBoard.room.more", { n }),
      });
      for (const p of ["ben", "vince"] as const) scene.setDesk(p, deskTicket(tickets, p)?.title ?? null, t("officeBoard.room.idle"));
    },
    [t],
  );

  const use = useCallback((s: BerlinSpot) => {
    spotRef.current = s;
    lastSpot.current = s;
    setSpot(s);
    sceneRef.current?.focus(s);
  }, []);
  const back = useCallback(() => {
    spotRef.current = null;
    setSpot(null);
    sceneRef.current?.focus(null);
    requestAnimationFrame(() => requestAnimationFrame(() => labelRefs.current[lastSpot.current]?.focus()));
  }, []);

  // focus into the room and back; Escape steps back (drawer, then room); Tab stays inside. A dialog on top
  // (an open ticket, a picture) keeps its own keys.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const room = dialogRef.current;
      if (!room) return;
      if (document.querySelector("[data-testid='berlin-ticket'], [data-office-lightbox]")) return;
      if (e.key === "Escape") {
        if (spotRef.current) back();
        else onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const at = document.activeElement;
      const items = [...room.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex='0']")].filter((el) => el.getClientRects().length > 0);
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
      const target = before && before !== document.body && before.isConnected ? before : document.querySelector<HTMLElement>('[data-testid="berlin-open"]');
      target?.focus?.();
    };
  }, [onClose, back]);

  // the 3D room: loaded lazily, never on the server
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
    let gaveUp = false;
    const slow = setTimeout(() => {
      if (!disposed && !sceneRef.current) {
        gaveUp = true;
        setGl("failed");
      }
    }, 8_000);
    import("./scene/berlinRoom")
      .then((mod) => {
        if (disposed || gaveUp || !canvas.isConnected) return;
        clearTimeout(slow);
        const scene = mod.createBerlinScene(canvas, { reducedMotion: reducedRef.current, ben: PEOPLE.ben.avatar, vince: PEOPLE.vince.avatar, onPick: use, onHover: setHover });
        sceneRef.current = scene;
        if (ticketsRef.current) paint(ticketsRef.current);
        ro = new ResizeObserver(() => scene.resize());
        ro.observe(canvas);
        const follow = () => {
          const at = scene.anchors();
          for (const s of BERLIN_SPOTS) {
            const el = labelRefs.current[s];
            const a = at[s];
            if (!el) continue;
            el.style.visibility = a ? "visible" : "hidden";
            if (a) el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -125%)`;
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
  }, [use, paint]);

  // the wall follows the board: on open and every 30 s
  useEffect(() => {
    let alive = true;
    const pull = () =>
      officeApi.list().then(
        (d) => alive && paint(d.tickets),
        () => undefined,
      );
    void pull();
    const timer = setInterval(() => void pull(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [paint]);

  useEffect(() => {
    if (spot) document.getElementById("berlin-board-title")?.focus();
  }, [spot]);

  const flat = gl === "unsupported" || gl === "failed";
  const shown: BerlinSpot | null = flat ? "board" : spot;
  const s = worldStyles;

  const room = (
    <div className={s.officeBackdrop} data-testid="berlin-backdrop">
      <div ref={dialogRef} className={s.officeRoom} role="dialog" aria-modal="true" aria-labelledby="berlin-title" data-testid="berlin-room" data-spot={shown ?? "room"} data-gl={gl}>
        <header className={s.officeBar}>
          <div>
            <h2 id="berlin-title">
              <span aria-hidden="true">🏢 </span>
              {t("officeBoard.room.title")}
            </h2>
            <p>{gl === "unsupported" ? t("officeBoard.room.noWebgl") : gl === "failed" ? t("officeBoard.room.loadFailed") : t("officeBoard.room.hint")}</p>
          </div>
          <button ref={closeRef} type="button" className={s.officeExit} onClick={onClose} data-testid="berlin-close">
            <span aria-hidden="true">🌍 </span>
            {t("officeBoard.room.exit")}
          </button>
        </header>
        <div className={s.officeStage}>
          <canvas ref={canvasRef} className={s.officeCanvas} role="img" aria-label={t("officeBoard.room.roomLabel")} data-testid="berlin-canvas" hidden={flat} />
          <div className={s.officeSpots} hidden={gl !== "ok"}>
            {BERLIN_SPOTS.map((x) => (
              <button
                key={x}
                ref={(el) => {
                  labelRefs.current[x] = el;
                }}
                type="button"
                className={s.officeSpot}
                data-active={shown === x || hover === x}
                onClick={() => use(x)}
                data-testid={`berlin-spot-${x}`}
              >
                <span aria-hidden="true">{SPOT_ICON[x]} </span>
                {t(`officeBoard.room.spots.${x}`)}
              </button>
            ))}
          </div>
          {shown ? (
            <aside className={s.officeDrawer} aria-labelledby="berlin-board-title" data-testid="berlin-drawer">
              {gl === "ok" ? (
                <div className={s.officeDrawerHead}>
                  <span />
                  <button type="button" className={s.officeBack} onClick={back} data-testid="berlin-back">
                    ← {t("officeBoard.room.back")}
                  </button>
                </div>
              ) : null}
              <OfficeBoard embedded person={shown === "board" ? undefined : shown} onLoaded={paint} />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(room, document.body);
}
