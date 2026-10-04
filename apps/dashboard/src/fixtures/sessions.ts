/**
 * PROTOTYPE FIXTURES — fictional sessions. The transcript is invented placeholder
 * dialogue about using the tool; it is not a recording or quotation of anyone.
 */
import { l, type Localized } from "@/lib/locale";
import type { PersonId } from "./team";

export interface TranscriptLine {
  time: string;
  speaker: PersonId;
  text: Localized;
}

export interface Session {
  id: string;
  kind: Localized;
  title: Localized;
  /** ISO date or null for undated prototype placeholders */
  date: string | null;
  start?: string;
  end?: string;
  durationSeconds?: number;
  participants: readonly PersonId[];
  /** scheduled but not held yet (shown as "planned") */
  planned?: boolean;
  attached: boolean;
  keyPoints: readonly Localized[];
  decisions: readonly Localized[];
  actions: readonly { owner: PersonId; task: Localized }[];
  transcript: readonly TranscriptLine[];
}

export const SESSIONS: readonly Session[] = [
  {
    id: "working-session-01",
    kind: l("Working session", "Arbeitssession", "Sessione di lavoro"),
    title: l("Current focus and first loop", "Aktueller Fokus und erster Kreislauf", "Focus attuale e primo ciclo"),
    date: "2026-10-03",
    start: "16:00",
    end: "17:12",
    durationSeconds: 4320,
    participants: ["ana", "ben", "vince"],
    attached: true,
    keyPoints: [
      l("Start from what already exists before adding new ideas.", "Bei dem anfangen, was schon da ist, bevor neue Ideen dazukommen.", "Partire da ciò che esiste già prima di aggiungere nuove idee."),
      l("Keep active experiments deliberately few.", "Aktive Experimente bewusst wenige halten.", "Mantenere volutamente pochi esperimenti attivi."),
      l("Keep raw evidence separate from interpretation.", "Rohe Belege von Interpretation getrennt halten.", "Tenere le prove grezze separate dall'interpretazione."),
    ],
    decisions: [
      l("Jira stays the source of truth for work.", "Jira bleibt die Quelle der Wahrheit für Arbeit.", "Jira resta la fonte di verità per il lavoro."),
      l("Confluence holds curated knowledge.", "Confluence enthält kuratiertes Wissen.", "Confluence contiene la conoscenza curata."),
    ],
    actions: [
      { owner: "ana", task: l("Choose one loop to close this week", "Einen Kreislauf für diese Woche wählen", "Scegliere un ciclo da chiudere questa settimana") },
      { owner: "ben", task: l("Draft the next working session agenda", "Agenda der nächsten Session entwerfen", "Preparare l'agenda della prossima sessione") },
      { owner: "vince", task: l("Collect approved source links", "Freigegebene Quellen-Links sammeln", "Raccogliere i link alle fonti approvate") },
    ],
    transcript: [
      { time: "16:02", speaker: "ben", text: l("[Fictional] Let's look at what is already in place first.", "[Fiktiv] Schauen wir zuerst, was schon da ist.", "[Fittizio] Guardiamo prima cosa c'è già.") },
      { time: "16:06", speaker: "ana", text: l("[Fictional] I'd like one clear focus for the week.", "[Fiktiv] Ich hätte gern einen klaren Fokus für die Woche.", "[Fittizio] Vorrei un focus chiaro per la settimana.") },
      { time: "16:11", speaker: "vince", text: l("[Fictional] I can gather the approved links in one place.", "[Fiktiv] Ich kann die freigegebenen Links an einem Ort sammeln.", "[Fittizio] Posso raccogliere i link approvati in un unico posto.") },
      { time: "16:24", speaker: "ben", text: l("[Fictional] Then the board shows who is moving what.", "[Fiktiv] Dann zeigt das Board, wer was bewegt.", "[Fittizio] Così il board mostra chi sta muovendo cosa.") },
      { time: "16:40", speaker: "ana", text: l("[Fictional] Good — one loop, then we look again.", "[Fiktiv] Gut — ein Kreislauf, dann schauen wir wieder.", "[Fittizio] Bene — un ciclo, poi riguardiamo.") },
      { time: "17:05", speaker: "vince", text: l("[Fictional] I'll note what is still missing.", "[Fiktiv] Ich notiere, was noch fehlt.", "[Fittizio] Annoto cosa manca ancora.") },
    ],
  },
  {
    id: "workshop-01",
    kind: l("Workshop 01", "Workshop 01", "Workshop 01"),
    title: l("Resources and existing assets", "Ressourcen und bestehende Werte", "Risorse e beni esistenti"),
    date: null,
    participants: ["ana", "ben", "vince"],
    attached: false,
    keyPoints: [],
    decisions: [],
    actions: [],
    transcript: [],
  },
  {
    id: "workshop-02",
    kind: l("Workshop 02", "Workshop 02", "Workshop 02"),
    title: l("Friction and what can be removed", "Reibung und was wegfallen kann", "Attriti e cosa si può eliminare"),
    // planned (also in the calendar on the same date); nothing recorded yet
    planned: true,
    date: "2026-10-14",
    start: "10:00",
    end: "13:00",
    participants: ["ana", "ben", "vince"],
    attached: false,
    keyPoints: [],
    decisions: [],
    actions: [],
    transcript: [],
  },
];

export const LAST_SESSION_ID = "working-session-01";

export function getSession(id: string): Session | undefined {
  return SESSIONS.find((session) => session.id === id);
}
