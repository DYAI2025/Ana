"use client";

import { Plus, Type } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { NOTE_GRAB_MARGIN, type Bounds, type NoteColor, type WhiteboardNote } from "@/state/prototype";
import styles from "./whiteboard.module.css";

const COLORS: readonly NoteColor[] = ["blush", "lilac", "sand"];
const NUDGE = 8;
const NUDGE_FAST = 32;

export function WhiteboardView() {
  const { t, text } = useI18n();
  const { state, dispatch } = usePrototype();
  const { notify } = useToast();
  const [color, setColor] = useState<NoteColor>("blush");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Notes keep their stored position; they are only *drawn* inside the current board, so a temporary
  // shrink never rearranges the board, and widening it again restores the layout.
  const [size, setSize] = useState<Bounds | null>(null);
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const drawn = (value: number, extent: number | undefined) => (extent ? Math.min(value, Math.max(0, extent - NOTE_GRAB_MARGIN)) : value);

  const bounds = (): Bounds => ({ width: board.current?.clientWidth ?? 1000, height: board.current?.clientHeight ?? 600 });
  const focusNote = (id: string) => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-note-id="${id}"]`)?.focus());

  const add = (kind: "sticky" | "text") => {
    const b = bounds();
    const offset = (state.notes.length % 5) * 26;
    const id = `note-${state.seq + 1}`;
    dispatch({
      type: "addNote",
      kind,
      color: kind === "sticky" ? color : "sand",
      text: kind === "sticky" ? t("whiteboard.newSticky") : t("whiteboard.newText"),
      x: Math.round(b.width / 2 - 90 + offset),
      y: Math.round(b.height / 2 - 60 + offset),
    });
    notify(t("whiteboard.added"));
    focusNote(id);
  };

  const startEdit = (note: WhiteboardNote) => {
    setEditing(note.id);
    setDraft(text(note.text));
  };

  /** refocus only for keyboard commits; a blur caused by clicking elsewhere must not steal focus back */
  const commitEdit = (id: string, refocus: boolean) => {
    if (draft.trim()) dispatch({ type: "editNote", id, text: draft.trim() });
    setEditing(null);
    if (refocus) focusNote(id);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, note: WhiteboardNote) => {
    if (editing === note.id || event.button !== 0) return;
    // offset from where the note is drawn (not its stored, possibly off-board position)
    const noteRect = event.currentTarget.getBoundingClientRect();
    drag.current = { id: note.id, dx: event.clientX - noteRect.left, dy: event.clientY - noteRect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(note.id);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const rect = board.current!.getBoundingClientRect();
    dispatch({ type: "moveNote", id: d.id, x: event.clientX - rect.left - d.dx, y: event.clientY - rect.top - d.dy, bounds: bounds() });
  };

  const endDrag = () => {
    drag.current = null;
    setDraggingId(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, note: WhiteboardNote) => {
    if (editing === note.id) return;
    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      dispatch({ type: "nudgeNote", id: note.id, dx: move[0], dy: move[1], bounds: bounds() });
    } else if (event.key === "Enter") {
      event.preventDefault();
      startEdit(note);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const index = state.notes.findIndex((n) => n.id === note.id);
      const neighbour = state.notes[index + 1] ?? state.notes[index - 1];
      dispatch({ type: "removeNote", id: note.id });
      notify(t("whiteboard.removed"));
      if (neighbour) focusNote(neighbour.id);
      else window.requestAnimationFrame(() => addRef.current?.focus());
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("whiteboard.title")}
        subtitle={t("whiteboard.subtitle")}
        actions={
          <>
            <fieldset className={styles.colors}>
              <legend className="visually-hidden">{t("whiteboard.colorLabel")}</legend>
              {COLORS.map((c) => (
                <label key={c} className={`${styles.color} ${styles[`color_${c}`]}`} title={t(`whiteboard.colors.${c}`)}>
                  <input type="radio" name="sticky-colour" value={c} checked={color === c} onChange={() => setColor(c)} className="visually-hidden" />
                  <span className="visually-hidden">{t(`whiteboard.colors.${c}`)}</span>
                </label>
              ))}
            </fieldset>
            <Button ref={addRef} variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => add("sticky")} data-testid="wb-add-sticky">
              {t("whiteboard.addSticky")}
            </Button>
            <Button icon={<Type size={15} aria-hidden="true" />} onClick={() => add("text")} data-testid="wb-add-text">
              {t("whiteboard.addText")}
            </Button>
          </>
        }
      />
      <p className={styles.meta}>
        <StatusChip tone="local">{t("common.localOnly")}</StatusChip>
        <span>{t("whiteboard.editHint")}</span>
      </p>
      <div ref={board} className={`glass ${styles.board}`} role="region" aria-label={t("whiteboard.boardLabel")} tabIndex={-1} data-testid="whiteboard">
        {state.notes.map((note) => {
          const label = text(note.text);
          const kindLabel = note.kind === "sticky" ? t("whiteboard.kindSticky") : t("whiteboard.kindText");
          return (
            <div
              key={note.id}
              className={`${styles.note} ${styles[`note_${note.kind}`]} ${note.kind === "sticky" ? styles[`color_${note.color}`] : ""}`}
              style={{ left: drawn(note.x, size?.width), top: drawn(note.y, size?.height) }}
              tabIndex={0}
              role="group"
              aria-roledescription={kindLabel}
              aria-label={t("whiteboard.noteLabel", { kind: kindLabel, text: label })}
              data-note-id={note.id}
              data-dragging={draggingId === note.id ? "true" : undefined}
              onPointerDown={(e) => onPointerDown(e, note)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={() => startEdit(note)}
              onKeyDown={(e) => onKeyDown(e, note)}
              data-testid="wb-note"
            >
              {editing === note.id ? (
                <textarea
                  className={styles.editor}
                  value={draft}
                  autoFocus
                  aria-label={kindLabel}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(note.id, false)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                      e.preventDefault();
                      commitEdit(note.id, true);
                    }
                  }}
                />
              ) : (
                <span className={styles.noteText}>{label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
