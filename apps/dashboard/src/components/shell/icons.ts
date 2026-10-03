import { Activity, Brain, CalendarDays, Columns3, FolderOpen, House, StickyNote, Video, Wrench, type LucideIcon } from "lucide-react";
import type { PrimaryViewId } from "@/lib/views";

/** Distinct, literal icons per module (C4 confused Sessions/Pulse glyphs). */
export const VIEW_ICONS: Readonly<Record<PrimaryViewId, LucideIcon>> = {
  now: House,
  board: Columns3,
  sessions: Video,
  brain: Brain,
  whiteboard: StickyNote,
  calendar: CalendarDays,
  pulse: Activity,
  vault: FolderOpen,
  toolbox: Wrench,
};
