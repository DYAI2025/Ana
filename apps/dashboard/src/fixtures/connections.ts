/**
 * PROTOTYPE FIXTURES — tools and data sources. Every source is honestly NOT connected:
 * the prototype shows no metric, count or activity for any of them.
 */
import { l, type Localized } from "@/lib/locale";

export type ConnectionState = "not-connected";

export interface Tool {
  id: string;
  name: string;
  purpose: Localized;
  howTo: Localized;
  /** null = link intentionally not configured in the prototype */
  url: null;
}

export const TOOLS: readonly Tool[] = [
  {
    id: "drive",
    name: "Google Drive",
    purpose: l("Shared files and source material.", "Geteilte Dateien und Quellmaterial.", "File condivisi e materiale di origine."),
    howTo: l(
      "Once a team folder is shared with ANA, it appears in the Vault. Only explicitly shared folders show up.",
      "Sobald ein Team-Ordner mit ANA geteilt ist, erscheint er in der Ablage. Nur ausdrücklich geteilte Ordner werden gezeigt.",
      "Quando una cartella del team è condivisa con ANA, compare nell'Archivio. Si vedono solo le cartelle condivise esplicitamente.",
    ),
    url: null,
  },
  {
    id: "meet",
    name: "Google Meet",
    purpose: l("Working sessions and workshops.", "Arbeitssessions und Workshops.", "Sessioni di lavoro e workshop."),
    howTo: l(
      "Use Meet for shared sessions. Recordings come into ANA only when a source is explicitly shared.",
      "Meet für gemeinsame Sessions nutzen. Aufnahmen kommen nur in ANA, wenn eine Quelle ausdrücklich geteilt ist.",
      "Usa Meet per le sessioni condivise. Le registrazioni entrano in ANA solo se una fonte è condivisa esplicitamente.",
    ),
    url: null,
  },
  {
    id: "jira",
    name: "Jira",
    purpose: l("The source of truth for active work.", "Die Quelle der Wahrheit für aktive Arbeit.", "La fonte di verità per il lavoro attivo."),
    howTo: l(
      "Create and move work in Jira. In production the ANA Board will be a calm view of Jira tasks.",
      "Arbeit in Jira anlegen und verschieben. Im Betrieb wird das ANA-Board eine ruhige Sicht auf Jira-Aufgaben.",
      "Crea e sposta il lavoro in Jira. In produzione il Board ANA sarà una vista tranquilla delle attività Jira.",
    ),
    url: null,
  },
  {
    id: "confluence",
    name: "Confluence",
    purpose: l("Curated decisions and reusable knowledge.", "Kuratierte Entscheidungen und wiederverwendbares Wissen.", "Decisioni curate e conoscenza riutilizzabile."),
    howTo: l(
      "Keep agreed operating knowledge in Confluence. Raw evidence stays separate from interpretation.",
      "Vereinbartes Arbeitswissen in Confluence halten. Rohe Belege bleiben von Interpretation getrennt.",
      "Tieni in Confluence la conoscenza operativa concordata. Le prove grezze restano separate dall'interpretazione.",
    ),
    url: null,
  },
  {
    id: "miro",
    name: "Miro",
    purpose: l("Workshop canvases and shared thinking.", "Workshop-Flächen und gemeinsames Denken.", "Lavagne per workshop e pensiero condiviso."),
    howTo: l(
      "Capture workshop thinking on a Miro board, then link the relevant source from ANA.",
      "Workshop-Denken auf einem Miro-Board festhalten und die relevante Quelle aus ANA verlinken.",
      "Raccogli il pensiero del workshop su una lavagna Miro, poi collega la fonte rilevante da ANA.",
    ),
    url: null,
  },
  {
    id: "assistant",
    name: "AI assistant",
    purpose: l("Drafting, synthesis and exploration.", "Entwürfe, Synthese und Erkundung.", "Bozze, sintesi ed esplorazione."),
    howTo: l(
      "A project tool, not a source of truth. Keep evidence and decisions linked to their original sources.",
      "Ein Projektwerkzeug, keine Quelle der Wahrheit. Belege und Entscheidungen mit ihren Originalquellen verknüpft halten.",
      "Uno strumento di progetto, non una fonte di verità. Mantieni prove e decisioni collegate alle fonti originali.",
    ),
    url: null,
  },
];

export interface SourceGroup {
  id: "community" | "sales" | "inbox" | "drive";
  sources: readonly string[];
  state: ConnectionState;
}

export const SOURCE_GROUPS: readonly SourceGroup[] = [
  { id: "community", sources: ["Instagram", "TikTok", "YouTube", "Facebook"], state: "not-connected" },
  { id: "sales", sources: ["Shop", "Partnerships", "Affiliates"], state: "not-connected" },
  { id: "inbox", sources: ["Business inbox"], state: "not-connected" },
  { id: "drive", sources: ["Shared Drive"], state: "not-connected" },
];

export const FOCUS = {
  statement: l(
    "See what already works, then close one meaningful loop.",
    "Sehen, was schon funktioniert, und dann einen sinnvollen Kreislauf schließen.",
    "Vedere cosa funziona già, poi chiudere un ciclo significativo.",
  ),
  stage: "reality" as const,
};

export const STAGES = ["reality", "choose", "act", "close"] as const;
export type Stage = (typeof STAGES)[number];

export const RECENT_KNOWLEDGE: readonly { id: string; label: Localized; type: "decision" | "session" | "goal" }[] = [
  { id: "focus", label: l("Current focus", "Aktueller Fokus", "Focus attuale"), type: "goal" },
  { id: "jira-work", label: l("Jira holds work", "Jira enthält die Arbeit", "Jira contiene il lavoro"), type: "decision" },
  { id: "session-01", label: l("Working session · 03 Oct", "Arbeitssession · 03. Okt.", "Sessione di lavoro · 03 ott"), type: "session" },
];
