import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NOTE_TYPES, RELATION_TYPES, STATUSES, zId, zSourceBlock, zSourceRef } from "../contract/schema.js";
import { search } from "../index/indexer.js";
import type { Embedder } from "../index/ollama.js";
import type { VectorStore } from "../index/qdrant.js";
import { VaultError, type Vault } from "../vault/vault.js";

export interface BrainDeps { vault: Vault; embedder: Embedder; store: VectorStore }

export const TOOL_NAMES = [
  "brain_search", "brain_get", "brain_context", "brain_related",
  "brain_create_note", "brain_register_source", "brain_add_relation", "brain_append_observation",
] as const;

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> });
const fail = (e: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: e instanceof VaultError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : "error" }],
});

type Extra = { authInfo?: { extra?: Record<string, unknown> } };
const actorOf = (extra: Extra): string => {
  const a = extra.authInfo?.extra?.actor;
  if (typeof a !== "string") throw new VaultError("unauthenticated", "forbidden");
  return a;
};

const STATUS_RANK: Record<string, number> = { CONFIRMED: 0, DERIVED: 1, SOURCE: 2, CANDIDATE: 3, SUPERSEDED: 4 };

/** Build an MCP server exposing exactly the Brain tools. Caller identity comes only from authInfo. */
export function createMcpServer({ vault, embedder, store }: BrainDeps): McpServer {
  const server = new McpServer({ name: "ana-brain", version: "1.0.0" });
  const wrap = <A>(fn: (args: A, actor: string) => Promise<unknown> | unknown) => async (args: A, extra: Extra) => {
    try {
      const actor = actorOf(extra);
      vault.reload();
      return ok(await fn(args, actor));
    } catch (e) {
      return fail(e);
    }
  };

  server.registerTool("brain_search", {
    description: "Semantic search over the ANA Brain with optional metadata filters. Retired (superseded) notes are excluded unless include_retired is true.",
    inputSchema: {
      query: z.string().min(1).max(1000), limit: z.number().int().min(1).max(25).optional(),
      type: z.enum(NOTE_TYPES).optional(), status: z.enum(STATUSES).optional(), topic: zId.optional(), workshop: zId.optional(),
      include_retired: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: { query: string; limit?: number; type?: string; status?: string; topic?: string; workshop?: string; include_retired?: boolean }) => ({
    results: await search(vault, embedder, store, a.query, { limit: a.limit, type: a.type, status: a.status, topic: a.topic, workshop: a.workshop, includeRetired: a.include_retired }),
  })));

  server.registerTool("brain_get", {
    description: "Get one note by id: frontmatter (status, provenance, relations, source record) and Markdown body.",
    inputSchema: { id: zId },
    annotations: { readOnlyHint: true },
  }, wrap((a: { id: string }) => {
    const n = vault.require(a.id);
    return { frontmatter: n.fm, body: n.body, backlinks: vault.backlinks(a.id) };
  }));

  server.registerTool("brain_context", {
    description: "Bounded context bundle for a workshop or topic id: the anchor note plus linked notes (summaries, status, sources) within a character budget.",
    inputSchema: { id: zId, budget_chars: z.number().int().min(1000).max(48000).optional() },
    annotations: { readOnlyHint: true },
  }, wrap((a: { id: string; budget_chars?: number }) => {
    const anchor = vault.require(a.id);
    const budget = a.budget_chars ?? 12000;
    const linked = new Set<string>([...anchor.fm.relations.map((r) => r.target), ...vault.backlinks(a.id).map((b) => b.from)]);
    const members = vault.all().filter((n) => n.fm.id !== a.id && (n.fm.workshops.includes(a.id) || n.fm.topics.includes(a.id) || linked.has(n.fm.id)));
    members.sort((x, y) => (STATUS_RANK[x.fm.status] ?? 9) - (STATUS_RANK[y.fm.status] ?? 9) || y.fm.updated.localeCompare(x.fm.updated) || x.fm.id.localeCompare(y.fm.id));
    let used = 0;
    const anchorBody = anchor.body.slice(0, Math.floor(budget / 3));
    used += anchorBody.length;
    const items = [];
    let truncated = anchorBody.length < anchor.body.length;
    for (const n of members) {
      const item = { id: n.fm.id, title: n.fm.title, type: n.fm.type, status: n.fm.status, summary: vault.summary(n.fm.id), source_refs: n.fm.source_refs, superseded_by: n.fm.superseded_by };
      const size = JSON.stringify(item).length;
      if (used + size > budget) {
        truncated = true;
        break;
      }
      used += size;
      items.push(item);
    }
    return { anchor: { frontmatter: anchor.fm, body: anchorBody }, notes: items, total_linked: members.length, truncated, budget_chars: budget };
  }));

  server.registerTool("brain_related", {
    description: "Explicit typed relations of a note and its backlinks. Never similarity-based.",
    inputSchema: { id: zId },
    annotations: { readOnlyHint: true },
  }, wrap((a: { id: string }) => {
    const n = vault.require(a.id);
    const title = (id: string) => vault.get(id)?.fm.title ?? null;
    return {
      id: a.id,
      relations: n.fm.relations.map((r) => ({ ...r, title: title(r.target) })),
      backlinks: vault.backlinks(a.id).map((b) => ({ ...b, title: title(b.from) })),
      superseded_by: n.fm.superseded_by,
    };
  }));

  server.registerTool("brain_create_note", {
    description: "Create a new schema-validated note (not a source). Refuses existing ids. Status CONFIRMED only for a human caller with confirm=true.",
    inputSchema: {
      id: zId, title: z.string().min(1).max(300), type: z.enum(NOTE_TYPES).exclude(["source"]),
      status: z.enum(["DERIVED", "CANDIDATE", "CONFIRMED"]), body: z.string().max(20000),
      topics: z.array(zId).max(50).optional(), workshops: z.array(zId).max(50).optional(), source_refs: z.array(zSourceRef).max(100).optional(),
      confirm: z.boolean().optional(), provenance_note: z.string().max(1000).optional(),
    },
  }, wrap(async (a: Parameters<Vault["createNote"]>[1], actor) => ({ created: await vault.createNote(actor, a) })));

  server.registerTool("brain_register_source", {
    description: "Register a source record (metadata + locator, short description). Never paste raw evidence or transcripts.",
    inputSchema: {
      id: zId, title: z.string().min(1).max(300), source: zSourceBlock, description: z.string().max(4000),
      topics: z.array(zId).max(50).optional(), workshops: z.array(zId).max(50).optional(), provenance_note: z.string().max(1000).optional(),
    },
  }, wrap(async (a: Parameters<Vault["registerSource"]>[1], actor) => ({ created: await vault.registerSource(actor, a) })));

  server.registerTool("brain_add_relation", {
    description: "Append a typed relation from one existing note to another. 'supersedes' marks the target SUPERSEDED (kept, not deleted). Idempotent.",
    inputSchema: { from: zId, type: z.enum(RELATION_TYPES), to: zId },
  }, wrap(async (a: { from: string; type: (typeof RELATION_TYPES)[number]; to: string }, actor) => vault.addRelation(actor, a.from, a.type, a.to)));

  server.registerTool("brain_append_observation", {
    description: "Append a timestamped observation (or, with corrects=<block id>, a correction) to a note. Append-only.",
    inputSchema: {
      id: zId, text: z.string().min(1).max(2000), status: z.enum(["CANDIDATE", "DERIVED", "CONFIRMED"]).optional(),
      corrects: z.string().max(100).optional(), confirm: z.boolean().optional(),
    },
  }, wrap(async (a: { id: string; text: string; status?: "CANDIDATE" | "DERIVED" | "CONFIRMED"; corrects?: string; confirm?: boolean }, actor) => vault.appendObservation(actor, a.id, a)));

  return server;
}
