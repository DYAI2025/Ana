/** PROTOTYPE FIXTURES — fictional tickets and backlog; not read from Jira. */
import { l, type Localized } from "@/lib/locale";
import type { PersonId } from "./team";

export const COLUMNS = ["next", "doing", "review", "done"] as const;
export type ColumnId = (typeof COLUMNS)[number];

export interface Ticket {
  id: string;
  key: string;
  column: ColumnId;
  owner: PersonId;
  category: Localized;
  title: Localized;
}

export interface BacklogItem {
  id: string;
  title: Localized | string;
  owner?: PersonId;
  kind: "backlog" | "idea";
  /** true for items created in this browser session */
  local?: boolean;
}

export const TICKETS: readonly Ticket[] = [
  {
    id: "t-resource-map",
    key: "PROTO-1",
    column: "next",
    owner: "ana",
    category: l("Resources", "Ressourcen", "Risorse"),
    title: l(
      "Map existing assets before adding new ones",
      "Bestehende Ressourcen erfassen, bevor Neues dazukommt",
      "Mappare le risorse esistenti prima di aggiungerne di nuove",
    ),
  },
  {
    id: "t-workshop-02",
    key: "PROTO-2",
    column: "next",
    owner: "ben",
    category: l("Workshop", "Workshop", "Workshop"),
    title: l("Prepare Workshop 02 materials", "Material für Workshop 02 vorbereiten", "Preparare i materiali del Workshop 02"),
  },
  {
    id: "t-community-plan",
    key: "PROTO-3",
    column: "next",
    owner: "vince",
    category: l("Community", "Community", "Community"),
    title: l("Outline a community listening plan", "Plan zum Zuhören in der Community skizzieren", "Abbozzare un piano di ascolto della community"),
  },
  {
    id: "t-choose-loop",
    key: "PROTO-4",
    column: "doing",
    owner: "ana",
    category: l("Focus", "Fokus", "Focus"),
    title: l(
      "Choose one loop to close this week",
      "Einen Kreislauf wählen, der diese Woche geschlossen wird",
      "Scegliere un ciclo da chiudere questa settimana",
    ),
  },
  {
    id: "t-source-links",
    key: "PROTO-5",
    column: "doing",
    owner: "vince",
    category: l("Sources", "Quellen", "Fonti"),
    title: l("Collect approved source links", "Freigegebene Quellen-Links sammeln", "Raccogliere i link alle fonti approvate"),
  },
  {
    id: "t-session-agenda",
    key: "PROTO-6",
    column: "review",
    owner: "ben",
    category: l("Session", "Session", "Sessione"),
    title: l("Draft the next working session agenda", "Agenda der nächsten Arbeitssession entwerfen", "Preparare l'agenda della prossima sessione"),
  },
  {
    id: "t-foundation",
    key: "PROTO-7",
    column: "done",
    owner: "ben",
    category: l("System", "System", "Sistema"),
    title: l("Set up the ANA project foundation", "ANA-Projektgrundlage aufsetzen", "Impostare le basi del progetto ANA"),
  },
];

export const BACKLOG: readonly BacklogItem[] = [
  { id: "b-community-source", kind: "backlog", title: l("Connect a community analytics source", "Community-Analysequelle verbinden", "Collegare una fonte di analisi della community") },
  { id: "b-inbox", kind: "backlog", title: l("Connect the business inbox", "Business-Posteingang verbinden", "Collegare la posta di lavoro") },
  { id: "b-transcripts", kind: "backlog", title: l("Automate meeting transcript import", "Import von Meeting-Transkripten automatisieren", "Automatizzare l'importazione delle trascrizioni") },
  { id: "b-media", kind: "backlog", title: l("Create a workshop media pipeline", "Medien-Ablauf für Workshops aufbauen", "Creare un flusso per i media dei workshop") },
  { id: "b-sales", kind: "backlog", title: l("Connect a sales source", "Verkaufsquelle verbinden", "Collegare una fonte di vendite") },
  { id: "b-drive-sync", kind: "backlog", title: l("Add Drive folder references", "Drive-Ordner-Verweise hinzufügen", "Aggiungere riferimenti alle cartelle Drive") },
];
