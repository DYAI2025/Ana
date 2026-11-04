import "server-only";
import type { BrainReason, BrainState } from "@/features/world/analystTypes";
import type { BrainResult } from "@/features/brain/types";
import { THEMES } from "@/features/world/postTags";
import { MIN_N } from "@/features/world/pulse";
import { BrainToolError, createBrainMcp, type BrainMcpConfig } from "@/server/brain/mcpClient";

/**
 * Bounded, read-only Brain context for the World analyst (Jira ANAK-3 AC-06, PO decision 2026-11-04).
 *
 * The Brain's agent key can read every note and can also write; there is no read scope and no per-note ACL. So:
 * - this module holds a typed reader with search and get only, never the generic call of the MCP client. That guards the
 *   code paths of this dashboard; it is not a boundary against a compromised server (residual risk, put to the PO).
 * - it is the release boundary. Fail-closed: a note goes to a provider only when it is one of the dashboard's own week
 *   notes, written entirely by the dashboard, its sources released for the selected provider, nothing retired. Even
 *   then only segments of its current block that match an exact grammar leave the server: no country, age, gender,
 *   follower or single-post segment, and no free text. Everything else is a count, without id, title or score.
 *
 * Known limit: a note that grew since the last index run is not visible here (the projection counts only notes without
 * an embedding). Text always comes from brain_get, so what is shown is current; whether the hit's ranking is, the
 * dashboard cannot prove. Every hit says so.
 */
export const DASHBOARD_ACTOR = "agent:lumen";
const RELEASED_CLASSES: ReadonlySet<string> = new Set(["G0", "G1"]);
const RELEASED_ACCESS: ReadonlySet<string> = new Set(["internal", "public"]);
const NOTE_ID = /^kn-world-pulse-\d{4}-w\d{2}$/;

export const MAX_NOTES = 3;
export const MAX_NOTE_CHARS = 600;
export const MAX_TOTAL_CHARS = 1500;
/** the Brain's limit; withheld hits must not crowd released ones out */
const SEARCH_LIMIT = 25;
/**
 * Cosine score on real BGE-M3 below which a hit is not a match. Measured 2026-11-04 by analyst.real.test.ts on a
 * disposable synthetic vault: 8 off-topic questions at most 0.399, 6 on-topic wordings at least 0.495, so the middle.
 * A note scores higher on any German question than an empty vault suggests, so this floor is what keeps unrelated
 * questions out. It says nothing about the production vault: measure there before relying on it.
 */
export const SCORE_FLOOR = 0.45;

export interface SearchHit {
  id: string;
  score: number;
}

export interface NoteFrontmatter {
  type?: string;
  status?: string;
  created_by?: string;
  superseded_by?: string | null;
  source_refs?: Array<{ source: string; locator?: string }>;
  source?: { access?: string; data_class?: string };
}

export interface BrainNote {
  frontmatter: NoteFrontmatter;
  body: string;
}

/** The only way this slice reaches the Brain. Deliberately no way to name a tool or pass other arguments. */
export interface BrainReader {
  search(query: string, limit: number): Promise<SearchHit[]>;
  get(id: string): Promise<BrainNote>;
}

export function createBrainReader(config: BrainMcpConfig, fetchImpl: typeof fetch = fetch): BrainReader {
  const mcp = createBrainMcp(config, fetchImpl);
  return {
    async search(query, limit) {
      const found = JSON.parse(await mcp.call("brain_search", { query, limit })) as { results: Array<{ id: string; score: number }> };
      return found.results.map((r) => ({ id: r.id, score: r.score }));
    },
    async get(id) {
      const note = JSON.parse(await mcp.call("brain_get", { id })) as { frontmatter: NoteFrontmatter; body: string };
      return { frontmatter: note.frontmatter, body: note.body };
    },
  };
}

export interface ParsedBlock {
  at: string;
  by: string;
  status: string | null;
  corrects: string | null;
  text: string;
  block: string;
}

const LINE = /^- (\S+) · (\S+) · (?:([A-Z]+) · )?(?:corrects \^(obs-[a-z0-9-]+) · )?(.*) \^(obs-[a-z0-9-]+)\s*$/;

/** The blocks as the Brain defines them: lines under the two headings; only under Corrections does "corrects" count. Ported from PR #39. */
export function parseBlocks(body: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let section: "observations" | "corrections" | null = null;
  for (const line of body.split("\n")) {
    if (/^#{1,6} /.test(line)) section = line.startsWith("## Observations") ? "observations" : line.startsWith("## Corrections") ? "corrections" : null;
    const m = section ? LINE.exec(line) : null;
    if (!m) continue;
    const corrects = section === "corrections" ? (m[4] ?? null) : null;
    const text = section === "observations" && m[4] ? `corrects ^${m[4]} · ${m[5]}` : (m[5] as string);
    blocks.push({ at: m[1] as string, by: m[2] as string, status: m[3] ?? null, corrects, text, block: m[6] as string });
  }
  return blocks.sort((a, b) => a.at.localeCompare(b.at));
}

/** A correction stands where the block it replaces stood. Ported from PR #39. */
function currentBlock(blocks: readonly ParsedBlock[]): ParsedBlock | null {
  const corrected = new Set(blocks.flatMap((b) => b.corrects ?? []));
  const byId = new Map(blocks.map((b) => [b.block, b]));
  const place = (b: ParsedBlock): string => {
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
  let best: ParsedBlock | null = null;
  for (const b of blocks) {
    if (corrected.has(b.block)) continue;
    if (!best || place(b) >= place(best)) best = b;
  }
  return best;
}

const THEME = THEMES.join("|");
const ER = String.raw`\d+\.\d %`;
const SSR = String.raw`\d+\.\d{2} %`;
const themeRows = (pct: string) => String.raw`(?:${THEME}) ${pct} \(n \d+\)(?:, (?:${THEME}) ${pct} \(n \d+\))*`;
const SEGMENTS: readonly RegExp[] = [
  /^Puls \d{4}-\d{2}-\d{2} \(Instagram, aggregiert, gemessen; Kategorien von Claude Haiku gelesen, \d+ Posts\)\.$/,
  new RegExp(String.raw`^Median aller Posts: ER (?:${ER}|—), Save\+Share (?:${SSR}|—)\.$`),
  new RegExp(String.raw`^Themen nach ER \(n ≥ \d+\): ${themeRows(ER)}\.$`),
  new RegExp(String.raw`^Themen nach Save\+Share \(Substack-Hinweis\): ${themeRows(SSR)}\.$`),
  /^Nur Korrelation: Meta sagt nicht, welche Person auf welchen Post reagiert hat\.$/,
];
const BRAND = new RegExp(String.raw`^Marken-Posts: (\d+) mit ER-Median (?:${ER}|—), übrige (\d+) mit (?:${ER}|—)\.$`);

/** What of a block may leave the server: only parts that match their grammar exactly. A small brand group can name one post's value. */
export function releasedSegments(blockText: string): string[] {
  return blockText
    .split(" ¦ ")
    .map((s) => s.trim())
    .filter((part) => {
      if (SEGMENTS.some((re) => re.test(part))) return true;
      const brand = BRAND.exec(part);
      return brand !== null && Number(brand[1]) >= MIN_N && Number(brand[2]) >= MIN_N;
    });
}

export interface ReleasedItem {
  ref: string;
  note_id: string;
  source_ids: string[];
  status: string;
  origin: string;
  block: string;
  at: string;
  text: string;
  score: number;
}

export interface BrainContext {
  state: BrainState;
  reason: BrainReason | null;
  items: ReleasedItem[];
  withheld: number;
}

const blocked = (state: "blocked" | "unknown", reason: BrainReason): BrainContext => ({ state, reason, items: [], withheld: 0 });

function sourceReleased(fm: NoteFrontmatter): boolean {
  return fm.type === "source" && fm.created_by === DASHBOARD_ACTOR && fm.superseded_by === null && RELEASED_ACCESS.has(fm.source?.access ?? "") && RELEASED_CLASSES.has(fm.source?.data_class ?? "");
}

const unreachable = (e: unknown) => e instanceof BrainToolError && e.kind === "unreachable";

/** Reads a note and its sources and applies the whole release rule. Null: withheld. A missing or refused note withholds; an unreachable Brain throws. */
async function readReleased(reader: BrainReader, id: string, sources: ReadonlySet<string>): Promise<Omit<ReleasedItem, "ref" | "score"> | null> {
  if (!NOTE_ID.test(id)) return null;
  let note: BrainNote;
  try {
    note = await reader.get(id);
  } catch (e) {
    if (unreachable(e)) throw e;
    return null;
  }
  const fm = note.frontmatter;
  if (fm?.created_by !== DASHBOARD_ACTOR || fm.status !== "DERIVED" || fm.superseded_by !== null) return null;
  const blocks = parseBlocks(note.body);
  if (blocks.length === 0 || blocks.some((b) => b.by !== DASHBOARD_ACTOR)) return null;
  const sourceIds = [...new Set((fm.source_refs ?? []).map((r) => r.source))];
  if (sourceIds.length === 0 || sourceIds.some((s) => !sources.has(s))) return null;
  for (const sourceId of sourceIds) {
    let source: BrainNote;
    try {
      source = await reader.get(sourceId);
    } catch (e) {
      if (unreachable(e)) throw e;
      return null;
    }
    if (!sourceReleased(source.frontmatter)) return null;
  }
  const current = currentBlock(blocks);
  if (!current) return null;
  const kept: string[] = [];
  let length = 0;
  for (const part of releasedSegments(current.text)) {
    if (length + part.length + 3 > MAX_NOTE_CHARS) break;
    kept.push(part);
    length += part.length + 3;
  }
  if (kept.length === 0) return null;
  return { note_id: id, source_ids: sourceIds, status: fm.status, origin: fm.created_by, block: current.block, at: current.at, text: kept.join(" ¦ ") };
}

export interface RetrieveDeps {
  reader: BrainReader | null;
  sources: ReadonlySet<string>;
  projection: () => Promise<BrainResult>;
  ref: () => string;
}

/** The context for one question. Whatever goes wrong here leaves the Instagram answer standing, with no note text. */
export async function retrieveBrainContext(question: string, deps: RetrieveDeps): Promise<BrainContext> {
  if (deps.sources.size === 0) return blocked("blocked", "no_release");
  if (!deps.reader) return blocked("blocked", "not_configured");
  try {
    const projection = await deps.projection();
    if (!projection.ok) return blocked("unknown", "projection_unreadable");
    if (projection.projection.unindexed > 0) return blocked("blocked", "stale_index");
    const hits = await deps.reader.search(question, SEARCH_LIMIT);
    const items: ReleasedItem[] = [];
    let withheld = 0;
    let total = 0;
    for (const hit of hits) {
      if (hit.score < SCORE_FLOOR) continue;
      if (items.length === MAX_NOTES) {
        withheld++;
        continue;
      }
      const released = await readReleased(deps.reader, hit.id, deps.sources);
      if (!released || total + released.text.length > MAX_TOTAL_CHARS) {
        withheld++;
        continue;
      }
      total += released.text.length;
      items.push({ ...released, ref: deps.ref(), score: hit.score });
    }
    return { state: items.length ? "ok" : "none", reason: null, items, withheld };
  } catch {
    return blocked("unknown", "brain_failed");
  }
}

/** Reads again before anything is shown: what the Brain says now must still pass the rule and still be the same text. */
export async function verifyBeforeOutput(reader: BrainReader, items: readonly ReleasedItem[], sources: ReadonlySet<string>): Promise<{ items: ReleasedItem[]; dropped: number }> {
  const kept: ReleasedItem[] = [];
  let dropped = 0;
  for (const item of items) {
    let again: Awaited<ReturnType<typeof readReleased>> = null;
    try {
      again = await readReleased(reader, item.note_id, sources);
    } catch {
      again = null;
    }
    if (again && again.block === item.block && again.text === item.text) kept.push(item);
    else dropped++;
  }
  return { items: kept, dropped };
}
