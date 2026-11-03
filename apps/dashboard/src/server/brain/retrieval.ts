import "server-only";
import { BrainToolError, type BrainMcp } from "./mcpClient";

/**
 * Semantic retrieval through the Brain's protected /mcp interface (BGE-M3 and Qdrant live behind brain_search). A search
 * hit names no sources, so each hit is read with brain_get: what comes back always carries sources and status, and the
 * correction history stays visible.
 */

export interface BrainBlock {
  at: string;
  /** null: a hand-written correction may name no status */
  status: string | null;
  corrects: string | null;
  text: string;
  block: string;
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

export type ContextResult = { ok: true; results: ContextItem[] } | { ok: false; reason: "brain-failed" | "brain-unreachable" };

const LINE = /^- (\S+) · \S+ · (?:([A-Z]+) · )?(?:corrects \^(obs-[a-z0-9-]+) · )?(.*) \^(obs-[a-z0-9-]+)\s*$/;
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
    const corrects = section === "corrections" ? (m[3] ?? null) : null;
    const text = section === "observations" && m[3] ? `corrects ^${m[3]} · ${m[4]}` : (m[4] as string);
    blocks.push({ at: m[1] as string, status: m[2] ?? null, corrects, text, block: m[5] as string });
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

export async function retrieveContext(mcp: BrainMcp, query: string, limit: number): Promise<ContextResult> {
  try {
    const found = JSON.parse(await mcp.call("brain_search", { query, limit })) as { results: Array<{ id: string; title: string; type: string; score: number }> };
    const results = await Promise.all(
      found.results.map(async (hit): Promise<ContextItem> => {
        const note = JSON.parse(await mcp.call("brain_get", { id: hit.id })) as { frontmatter: { status: string; updated?: string; source_refs?: Array<{ source: string; locator: string }> }; body: string };
        const blocks = parseBlocks(note.body);
        const corrected = blocks.flatMap((b) => b.corrects ?? []);
        const current = currentBlock(blocks, corrected);
        const said = current ? HEADER.exec(current.text)?.[1] : undefined;
        return {
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
        };
      }),
    );
    return { ok: true, results };
  } catch (e) {
    return { ok: false, reason: e instanceof BrainToolError && e.kind === "unreachable" ? "brain-unreachable" : "brain-failed" };
  }
}
