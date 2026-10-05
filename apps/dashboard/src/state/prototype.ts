/**
 * Local-only prototype state for Calendar and Whiteboard. Lives in memory for the browser tab and resets on
 * reload — deliberately no persistence and no network. Work (Board, Backlog, ideas) is not here: it is a
 * projection of Jira (src/features/work), so no local ticket or backlog copy can exist (ANA-5).
 */
import { EVENTS, type CalendarEvent, type EventType } from "@/fixtures/calendar";
import type { MessageKey } from "@/i18n/translate";
import { l } from "@/lib/locale";

export type NoteKind = "sticky" | "text";
export type NoteColor = "blush" | "lilac" | "sand";

export interface WhiteboardNote {
  id: string;
  kind: NoteKind;
  color: NoteColor;
  /** Fixture notes carry a localized seed; edited or new notes hold plain text. */
  text: string | ReturnType<typeof l>;
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export type EventDraft = Omit<CalendarEvent, "id" | "local" | "title"> & { title: string };

export interface PrototypeState {
  events: CalendarEvent[];
  notes: WhiteboardNote[];
  seq: number;
}

export type PrototypeAction =
  | { type: "addEvent"; event: EventDraft }
  | { type: "addNote"; kind: NoteKind; color: NoteColor; text: string; x: number; y: number }
  | { type: "moveNote"; id: string; x: number; y: number; bounds: Bounds }
  | { type: "nudgeNote"; id: string; dx: number; dy: number; bounds: Bounds }
  | { type: "editNote"; id: string; text: string }
  | { type: "removeNote"; id: string };

/** Notes keep this much of themselves inside the board so they can always be grabbed again. */
export const NOTE_GRAB_MARGIN = 48;

const INITIAL_NOTES: readonly WhiteboardNote[] = [
  { id: "n-assets", kind: "sticky", color: "blush", x: 72, y: 64, text: l("Assets we already have", "Was wir schon haben", "Cosa abbiamo già") },
  { id: "n-load", kind: "sticky", color: "lilac", x: 332, y: 132, text: l("What creates load?", "Was erzeugt Last?", "Cosa crea carico?") },
  { id: "n-heading", kind: "text", color: "sand", x: 600, y: 72, text: l("Workshop 02 · warm-up", "Workshop 02 · Einstieg", "Workshop 02 · riscaldamento") },
];

export function createInitialState(): PrototypeState {
  return {
    events: EVENTS.map((e) => ({ ...e })),
    notes: INITIAL_NOTES.map((n) => ({ ...n })),
    seq: 0,
  };
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

export function validateEvent(event: EventDraft): MessageKey | null {
  if (event.title.trim().length === 0) return "calendar.titleRequired";
  if (!isRealDate(event.date)) return "calendar.dateRequired";
  if (!/^\d{2}:\d{2}$/.test(event.start) || !/^\d{2}:\d{2}$/.test(event.end)) return "calendar.timeRequired";
  if (event.end <= event.start) return "calendar.endBeforeStart";
  return null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function placeNote(note: WhiteboardNote, x: number, y: number, bounds: Bounds): WhiteboardNote {
  return {
    ...note,
    x: Math.round(clamp(x, 0, Math.max(0, bounds.width - NOTE_GRAB_MARGIN))),
    y: Math.round(clamp(y, 0, Math.max(0, bounds.height - NOTE_GRAB_MARGIN))),
  };
}

export function prototypeReducer(state: PrototypeState, action: PrototypeAction): PrototypeState {
  switch (action.type) {
    case "addEvent": {
      if (validateEvent(action.event)) return state;
      const seq = state.seq + 1;
      const event: CalendarEvent = { ...action.event, title: action.event.title.trim(), id: `event-${seq}`, local: true };
      return { ...state, seq, events: [...state.events, event] };
    }
    case "addNote": {
      const seq = state.seq + 1;
      const note: WhiteboardNote = { id: `note-${seq}`, kind: action.kind, color: action.color, text: action.text, x: action.x, y: action.y };
      return { ...state, seq, notes: [...state.notes, note] };
    }
    case "moveNote":
    case "nudgeNote": {
      const note = state.notes.find((n) => n.id === action.id);
      if (!note) return state;
      // a nudge starts where the note is drawn (its clamped position), not from an off-board stored value
      const visible = placeNote(note, note.x, note.y, action.bounds);
      const x = action.type === "moveNote" ? action.x : visible.x + action.dx;
      const y = action.type === "moveNote" ? action.y : visible.y + action.dy;
      return { ...state, notes: state.notes.map((n) => (n.id === action.id ? placeNote(n, x, y, action.bounds) : n)) };
    }
    case "editNote":
      return { ...state, notes: state.notes.map((n) => (n.id === action.id ? { ...n, text: action.text } : n)) };
    case "removeNote":
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
  }
}

export type { EventType };
