import type { Session } from "@/fixtures/sessions";
import { TEAM } from "@/fixtures/team";
import { pick, type Locale } from "@/lib/locale";

/** The structured session export shown in the JSON tab. Prototype-flagged; evidence is honestly not connected. */
export function sessionExport(session: Session, locale: Locale) {
  return {
    session_id: session.id,
    prototype: true,
    fictional: true,
    kind: pick(session.kind, locale),
    title: pick(session.title, locale),
    date: session.date,
    time: session.start ? `${session.start}-${session.end}` : null,
    participants: session.participants.map((p) => TEAM[p].name),
    key_points: session.keyPoints.map((k) => pick(k, locale)),
    decisions: session.decisions.map((d) => pick(d, locale)),
    actions: session.actions.map((a) => ({ owner: TEAM[a.owner].name, task: pick(a.task, locale) })),
    evidence_refs: [{ type: "drive", status: "not_connected", label: "Shared Drive source" }],
  };
}
