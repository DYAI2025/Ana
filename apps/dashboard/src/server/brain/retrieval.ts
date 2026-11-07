import "server-only";
import { SOURCE_ID as PULSE_SOURCE_ID } from "@/server/world/brainWriter";
import { SOURCE_ID as INSIGHT_SOURCE_ID } from "./instagramInsight";
import { BrainToolError, type BrainMcp } from "./mcpClient";

/**
 * Semantic retrieval through the Brain's protected /mcp interface (BGE-M3 and Qdrant live behind brain_search). A search
 * hit names no sources, so each hit is read with brain_get: what comes back always carries sources and status, and the
 * correction history stays visible.
 *
 * The Brain's agent key can read every note, and the Brain has no read scope and no class on a note. So this module is the
 * access boundary of the dashboard: it hands out only what the dashboard itself wrote from its own G0/G1 sources (see
 * isReleased), and everything else stays out, whatever the key could read. Fail-closed: what cannot be shown to be
 * released is withheld. A withheld note leaves no id, title or score in the answer, only a count.
 */

/** the Brain identity of the dashboard's key (brain.sh issue-key agent:lumen); a key of another identity releases nothing */
export const DASHBOARD_ACTOR = "agent:lumen";
const RELEASED_SOURCES: ReadonlySet<string> = new Set([INSIGHT_SOURCE_ID, PULSE_SOURCE_ID]);
const RELEASED_CLASSES: ReadonlySet<string> = new Set(["G0", "G1"]);
/** the Brain's limit is 25; withheld hits must not crowd released ones out of a small limit */
const MAX_SEARCH = 25;
const SEARCH_FACTOR = 5;

export interface BrainBlock {
  at: string;
  /** null: a hand-written correction may name no status */
  status: string | null;
  corrects: string | null;
  text: string;
  block: string;
  /** who appended it; the Brain lets any key holder append to any note */
  by: string;
}

export interface ContextItem {
  id: string;
  title: string;
  type: string;
  /** the note's status in the Brain */
  status: string;
  /** what the current block itself says (SOURCE/DERIVED/UNKNOWN); UNKNOWN when it does not say */
  epistemic: "SOURCE" | "DERIVED" | "UNKNOWN";
  score: number;
  updated: string | null;
  sources: Array<{ source: string; locator: string }>;
  /** the newest block nothing corrected; null when the note has none */
  current: BrainBlock | null;
  /** how many blocks exist, including corrected ones */
  history: number;
  /** blocks a later correction replaced; they stay in the note */
  corrected: string[];
  excerpt: string;
}

export type ContextResult = { ok: true; results: ContextItem[]; /** hits the caller may not see; never which */ withheld: number } | { ok: false; reason: "brain-failed" | "brain-unreachable" };

interface NoteFrontmatter {
  type?: string;
  status: string;
  created_by?: string;
  updated?: string;
  source_refs?: Array<{ source: string; locator: string }>;
  source?: { access?: string; data_class?: string };
}

const LINE = /^- (\S+) · (\S+) · (?:([A-Z]+) · )?(?:corrects \^(obs-[a-z0-9-]+) · )?(.*) \^(obs-[a-z0-9-]+)\s*$/;
const HEADER = /^IG-INSIGHT tag=\S+ v=\d+ status=(SOURCE|DERIVED|UNKNOWN)\b/;
const EXCERPT = 600;

/** The blocks as the Brain defines them: lines under the two headings; only under Corrections does "corrects" count. */
export function parseBlocks(body: string): BrainBlock[] {
  const blocks: BrainBlock[] = [];
  let section: "observations" | "corrections" | null = null;
  for (const line of body.split("\n")) {
    if (/^#{1,6} /.test(line)) section = line.startsWith("## Observations") ? "observations" : line.startsWith("## Corrections") ? "corrections" : null;
    const m = section ? LINE.exec(line) : null;
    if (!m) continue;
    const corrects = section === "corrections" ? (m[4] ?? null) : null;
    const text = section === "observations" && m[4] ? `corrects ^${m[4]} · ${m[5]}` : (m[5] as string);
    blocks.push({ at: m[1] as string, by: m[2] as string, status: m[3] ?? null, corrects, text, block: m[6] as string });
  }
  // sort is stable: blocks of one instant keep the note's order
  return blocks.sort((a, b) => a.at.localeCompare(b.at));
}

/** A correction stands where the block it replaces stood: correcting last week's block does not make it this week's reading. */
function currentBlock(blocks: readonly BrainBlock[], corrected: readonly string[]): BrainBlock | null {
  const byId = new Map(blocks.map((b) => [b.block, b]));
  const place = (b: BrainBlock): string => {
    const seen = new Set<string>();
    let at = b;
    while (at.corrects && !seen.has(at.block)) {
      seen.add(at.block);
      const earlier = byId.get(at.corrects);
      if (!earlier) break;
      at = earlier;
    }
    return at.at;
  };
  let best: BrainBlock | null = null;
  for (const b of blocks) {
    if (corrected.includes(b.block)) continue;
    if (!best || place(b) >= place(best)) best = b;
  }
  return best;
}

const bodyBefore = (body: string) => body.split(/^## (?:Observations|Corrections)\s*$/m)[0]?.trim() ?? "";

const parseNote = (text: string) => JSON.parse(text) as { frontmatter: NoteFrontmatter; body: string };

/** The source record behind a note, if it is one of the dashboard's own, written by it, and neither restricted nor above G1. */
async function sourceReleased(mcp: BrainMcp, id: string, known: Map<string, boolean>): Promise<boolean> {
  const seen = known.get(id);
  if (seen !== undefined) return seen;
  let released = false;
  if (RELEASED_SOURCES.has(id)) {
    try {
      const { frontmatter: fm } = parseNote(await mcp.call("brain_get", { id }));
      released = fm.type === "source" && fm.created_by === DASHBOARD_ACTOR && fm.source?.access !== "restricted" && fm.source?.access !== undefined && RELEASED_CLASSES.has(fm.source?.data_class ?? "");
    } catch (e) {
      // a missing or refused source releases nothing; an unreachable Brain is a failure, not a verdict
      if (e instanceof BrainToolError && e.kind === "unreachable") throw e;
    }
  }
  known.set(id, released);
  return released;
}

/** A note is released only if the dashboard wrote it and all of it, every source and every block, is the dashboard's. */
async function isReleased(mcp: BrainMcp, id: string, fm: NoteFrontmatter, blocks: readonly BrainBlock[], known: Map<string, boolean>): Promise<boolean> {
  if (fm.created_by !== DASHBOARD_ACTOR) return false;
  if (blocks.some((b) => b.by !== DASHBOARD_ACTOR)) return false;
  const sources = fm.type === "source" ? [id] : (fm.source_refs ?? []).map((r) => r.source);
  if (sources.length === 0) return false;
  for (const source of sources) if (!(await sourceReleased(mcp, source, known))) return false;
  return true;
}

export async function retrieveContext(mcp: BrainMcp, query: string, limit: number): Promise<ContextResult> {
  try {
    const found = JSON.parse(await mcp.call("brain_search", { query, limit: Math.min(MAX_SEARCH, limit * SEARCH_FACTOR) })) as { results: Array<{ id: string; title: string; type: string; score: number }> };
    const known = new Map<string, boolean>();
    const results: ContextItem[] = [];
    let withheld = 0;
    for (const hit of found.results) {
      if (results.length === limit) break;
      const note = parseNote(await mcp.call("brain_get", { id: hit.id }));
      const blocks = parseBlocks(note.body);
      if (!(await isReleased(mcp, hit.id, note.frontmatter, blocks, known))) {
        withheld++;
        continue;
      }
      const corrected = blocks.flatMap((b) => b.corrects ?? []);
      const current = currentBlock(blocks, corrected);
      const said = current ? HEADER.exec(current.text)?.[1] : undefined;
      results.push({
        id: hit.id,
        title: hit.title,
        type: hit.type,
        status: note.frontmatter.status,
        epistemic: (said ?? "UNKNOWN") as ContextItem["epistemic"],
        score: hit.score,
        updated: note.frontmatter.updated ?? null,
        sources: note.frontmatter.source_refs ?? [],
        current,
        history: blocks.length,
        corrected,
        excerpt: bodyBefore(note.body).slice(0, EXCERPT),
      });
    }
    return { ok: true, results, withheld };
  } catch (e) {
    return { ok: false, reason: e instanceof BrainToolError && e.kind === "unreachable" ? "brain-unreachable" : "brain-failed" };
  }
}
