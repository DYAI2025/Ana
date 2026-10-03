/** PROTOTYPE FIXTURES — fictional local calendar events; no external calendar is read. */
import { l, type Localized } from "@/lib/locale";
import type { PersonId } from "./team";

export const EVENT_TYPES = ["session", "workshop", "focus", "personal"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface CalendarEvent {
  id: string;
  title: Localized | string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24h */
  start: string;
  end: string;
  type: EventType;
  createdBy: PersonId;
  local?: boolean;
}

/** The calendar opens on the month that holds the fixture events so the prototype is deterministic. */
export const PROTOTYPE_MONTH = { year: 2026, month: 10 } as const;

export const EVENTS: readonly CalendarEvent[] = [
  { id: "e-working-session", title: l("Working session", "Arbeitssession", "Sessione di lavoro"), date: "2026-10-06", start: "16:00", end: "17:00", type: "session", createdBy: "ben" },
  { id: "e-focus-block", title: l("Focus block: resource map", "Fokuszeit: Ressourcenkarte", "Tempo di focus: mappa risorse"), date: "2026-10-09", start: "10:00", end: "11:30", type: "focus", createdBy: "ana" },
  { id: "e-workshop-02", title: l("Workshop 02", "Workshop 02", "Workshop 02"), date: "2026-10-14", start: "10:00", end: "13:00", type: "workshop", createdBy: "ben" },
  { id: "e-loop-review", title: l("Loop review", "Kreislauf-Rückblick", "Revisione del ciclo"), date: "2026-10-21", start: "16:00", end: "17:00", type: "session", createdBy: "vince" },
];
