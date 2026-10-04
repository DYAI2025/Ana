/**
 * PROTOTYPE FIXTURE — an illustrative concept map for the 3D Brain visual spike.
 * These nodes and links are hand-written examples. They are NOT derived from sources,
 * embeddings or any analysis, and they make no factual claim about anyone.
 */
import { l, type Localized } from "@/lib/locale";

export const NODE_TYPES = ["goal", "resource", "session", "workshop", "decision", "tool", "source", "hypothesis"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BrainNode {
  id: string;
  type: NodeType;
  label: Localized;
  summary: Localized;
  position: Vec3;
}

export interface BrainEdge {
  from: string;
  to: string;
}

type NodeSeed = Omit<BrainNode, "position">;

const SEEDS: readonly NodeSeed[] = [
  { id: "focus", type: "goal", label: l("Current focus", "Aktueller Fokus", "Focus attuale"), summary: l("The one shared focus shown first on Now.", "Der eine gemeinsame Fokus, der auf Jetzt zuerst erscheint.", "L'unico focus condiviso mostrato per primo in Ora.") },
  { id: "close-loop", type: "goal", label: l("Close one loop", "Einen Kreislauf schließen", "Chiudere un ciclo"), summary: l("Finish one meaningful thing before opening another.", "Eine sinnvolle Sache abschließen, bevor eine neue beginnt.", "Completare una cosa significativa prima di aprirne un'altra.") },
  { id: "assets", type: "resource", label: l("Existing assets", "Bestehende Ressourcen", "Risorse esistenti"), summary: l("What already exists and could be reused.", "Was schon existiert und wiederverwendet werden könnte.", "Ciò che esiste già e potrebbe essere riutilizzato.") },
  { id: "methods", type: "resource", label: l("Workshop methods", "Workshop-Methoden", "Metodi dei workshop"), summary: l("Reusable facilitation methods.", "Wiederverwendbare Moderationsmethoden.", "Metodi di facilitazione riutilizzabili.") },
  { id: "templates", type: "resource", label: l("Shared templates", "Gemeinsame Vorlagen", "Modelli condivisi"), summary: l("Templates the team can copy.", "Vorlagen, die das Team kopieren kann.", "Modelli che il team può copiare.") },
  { id: "session-01", type: "session", label: l("Working session · 03 Oct", "Arbeitssession · 03. Okt.", "Sessione di lavoro · 03 ott"), summary: l("The prototype's example session.", "Die Beispiel-Session des Prototyps.", "La sessione di esempio del prototipo.") },
  { id: "workshop-01", type: "workshop", label: l("Workshop 01", "Workshop 01", "Workshop 01"), summary: l("Resources and existing assets.", "Ressourcen und bestehende Werte.", "Risorse e beni esistenti.") },
  { id: "workshop-02", type: "workshop", label: l("Workshop 02", "Workshop 02", "Workshop 02"), summary: l("Friction and what can be removed.", "Reibung und was wegfallen kann.", "Attriti e cosa si può eliminare.") },
  { id: "jira-work", type: "decision", label: l("Jira holds work", "Jira enthält die Arbeit", "Jira contiene il lavoro"), summary: l("Work and backlog live in Jira.", "Arbeit und Backlog liegen in Jira.", "Lavoro e backlog stanno in Jira.") },
  { id: "confluence-knowledge", type: "decision", label: l("Confluence holds knowledge", "Confluence enthält Wissen", "Confluence contiene la conoscenza"), summary: l("Curated knowledge lives in Confluence.", "Kuratiertes Wissen liegt in Confluence.", "La conoscenza curata sta in Confluence.") },
  { id: "evidence-separate", type: "decision", label: l("Evidence stays separate", "Belege bleiben getrennt", "Le prove restano separate"), summary: l("Raw material is kept apart from interpretation.", "Rohmaterial bleibt getrennt von Interpretation.", "Il materiale grezzo resta separato dall'interpretazione.") },
  { id: "tool-jira", type: "tool", label: l("Jira", "Jira", "Jira"), summary: l("Work tracking tool.", "Werkzeug für Arbeitsplanung.", "Strumento per il lavoro.") },
  { id: "tool-confluence", type: "tool", label: l("Confluence", "Confluence", "Confluence"), summary: l("Knowledge pages.", "Wissensseiten.", "Pagine di conoscenza.") },
  { id: "tool-drive", type: "tool", label: l("Google Drive", "Google Drive", "Google Drive"), summary: l("Shared files.", "Geteilte Dateien.", "File condivisi.") },
  { id: "tool-meet", type: "tool", label: l("Google Meet", "Google Meet", "Google Meet"), summary: l("Calls and workshops.", "Calls und Workshops.", "Chiamate e workshop.") },
  { id: "tool-miro", type: "tool", label: l("Miro", "Miro", "Miro"), summary: l("Workshop canvases.", "Workshop-Flächen.", "Lavagne per workshop.") },
  { id: "source-links", type: "source", label: l("Approved source links", "Freigegebene Quellen-Links", "Link alle fonti approvate"), summary: l("References, not copies, of source material.", "Verweise auf Quellmaterial, keine Kopien.", "Riferimenti al materiale, non copie.") },
  { id: "transcripts", type: "source", label: l("Meeting transcripts", "Meeting-Transkripte", "Trascrizioni delle riunioni"), summary: l("Would be referenced once a source is connected.", "Würden verknüpft, sobald eine Quelle verbunden ist.", "Sarebbero collegate quando una fonte è connessa.") },
  { id: "h-fewer-experiments", type: "hypothesis", label: l("Fewer experiments, more closed loops", "Weniger Experimente, mehr geschlossene Kreisläufe", "Meno esperimenti, più cicli chiusi"), summary: l("An example hypothesis — not evaluated.", "Eine Beispiel-Hypothese — nicht geprüft.", "Un'ipotesi di esempio — non valutata.") },
  { id: "h-calm-overview", type: "hypothesis", label: l("A calm overview lowers friction", "Ein ruhiger Überblick senkt Reibung", "Una panoramica calma riduce gli attriti"), summary: l("An example hypothesis — not evaluated.", "Eine Beispiel-Hypothese — nicht geprüft.", "Un'ipotesi di esempio — non valutata.") },
];

/** Each type gets its own cluster centre on a Fibonacci sphere; members are spread deterministically around it. */
function layout(seeds: readonly NodeSeed[]): BrainNode[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const centre = (i: number, count: number) => {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    return { x: Math.cos(golden * i) * r, y, z: Math.sin(golden * i) * r };
  };
  const raw = seeds.map((seed) => {
    const siblings = seeds.filter((s) => s.type === seed.type);
    const order = siblings.indexOf(seed);
    if (seed.type === "goal") {
      return { ...seed, position: { x: (order - 0.5) * 0.36, y: 0.08 - order * 0.16, z: 0.12 } };
    }
    const c = centre(NODE_TYPES.indexOf(seed.type) - 1, NODE_TYPES.length - 1);
    const angle = (order / siblings.length) * Math.PI * 2 + NODE_TYPES.indexOf(seed.type);
    const spread = siblings.length > 1 ? 0.3 : 0;
    return {
      ...seed,
      position: { x: c.x + Math.cos(angle) * spread, y: c.y + Math.sin(angle) * spread * 0.8, z: c.z + Math.sin(angle + 1) * spread * 0.6 },
    };
  });
  // centre on the centroid and normalise to a unit sphere so the map sits in the middle of the view
  const n = raw.length;
  const c = raw.reduce((acc, node) => ({ x: acc.x + node.position.x / n, y: acc.y + node.position.y / n, z: acc.z + node.position.z / n }), { x: 0, y: 0, z: 0 });
  const max = Math.max(...raw.map((node) => Math.hypot(node.position.x - c.x, node.position.y - c.y, node.position.z - c.z)));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return raw.map((node) => ({
    ...node,
    position: { x: round((node.position.x - c.x) / max), y: round((node.position.y - c.y) / max), z: round((node.position.z - c.z) / max) },
  }));
}

export const BRAIN_NODES: readonly BrainNode[] = layout(SEEDS);

export const BRAIN_EDGES: readonly BrainEdge[] = [
  { from: "focus", to: "close-loop" },
  { from: "focus", to: "assets" },
  { from: "focus", to: "session-01" },
  { from: "close-loop", to: "h-fewer-experiments" },
  { from: "assets", to: "workshop-01" },
  { from: "assets", to: "templates" },
  { from: "methods", to: "workshop-01" },
  { from: "methods", to: "workshop-02" },
  { from: "workshop-02", to: "h-calm-overview" },
  { from: "session-01", to: "jira-work" },
  { from: "session-01", to: "confluence-knowledge" },
  { from: "session-01", to: "tool-meet" },
  { from: "jira-work", to: "tool-jira" },
  { from: "confluence-knowledge", to: "tool-confluence" },
  { from: "evidence-separate", to: "source-links" },
  { from: "evidence-separate", to: "transcripts" },
  { from: "source-links", to: "tool-drive" },
  { from: "workshop-01", to: "tool-miro" },
  { from: "transcripts", to: "tool-meet" },
];

export function neighbours(id: string): string[] {
  return BRAIN_EDGES.flatMap((edge) => (edge.from === id ? [edge.to] : edge.to === id ? [edge.from] : []));
}
