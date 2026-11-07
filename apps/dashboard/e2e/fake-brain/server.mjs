/**
 * Fake Brain service for Playwright. Binds to 127.0.0.1 only and serves synthetic data only. Never use against real data.
 *
 *   node e2e/fake-brain/server.mjs            (port FAKE_BRAIN_PORT, default 3197; token FAKE_BRAIN_TOKEN)
 *
 * GET /projection (Bearer token) · POST /mcp (agent key, JSON-RPC tools/call, recorded) · control: POST /__fake/reset
 * · POST /__fake/mode {mode} · GET /__fake/health · GET /__fake/mcp-calls · GET /__fake/search-calls
 * The World analyst's reads (brain_search and brain_get of the fixed notes below) go to search-calls, not mcp-calls,
 * which holds what the writer did. Their notes have the real Brain's shape {frontmatter, body, backlinks}.
 * Modes: ok · mirrored (positions changed) · empty · unindexed (2 notes not placed yet) · pending (nothing placed, 5 waiting)
 *   · down (socket destroyed) · unauthorized · invalid · slow · search-down (only brain_search fails)
 */
import http from "node:http";
import { baseProjection, mirrored } from "./data.mjs";

const port = Number(process.env.FAKE_BRAIN_PORT ?? 3197);
const token = process.env.FAKE_BRAIN_TOKEN ?? "e2e-fake-brain-token";
const MODES = new Set(["ok", "mirrored", "empty", "unindexed", "pending", "down", "unauthorized", "invalid", "slow", "search-down"]);
const agentKey = process.env.FAKE_BRAIN_AGENT_KEY ?? "anab_e2e-fake-agent-key-000000";
let mode = "ok";
/** tool calls the dashboard's Brain writer made (name + arguments) */
let mcpCalls = [];
const madeIds = new Set();
/** observations appended per note id, so brain_get can show them like the real Brain */
const observations = new Map();
/** the analyst's reads */
let searchCalls = [];
const WEEK_NOTE = "kn-world-pulse-2026-w01";
const FOREIGN_NOTE = "top-substack-signals";
const LOW_SCORING_NOTE = "kn-world-pulse-2025-w50";
const SOURCE = "src-ana-world-pulse";
const DIGEST = [
  "Puls 2026-01-05 (Instagram, aggregiert, gemessen; Kategorien von Claude Haiku gelesen, 6 Posts).",
  "Median aller Posts: ER 3.1 %, Save+Share 1.20 %.",
  "Engagement 7 T nach Land: GEOGRAPHY-CANARY 41 %.",
  "Follower FOLLOWER-CANARY.",
  "Themen nach ER (n ≥ 3): beach 5.2 % (n 5).",
  "Nur Korrelation: Meta sagt nicht, welche Person auf welchen Post reagiert hat.",
].join(" ¦ ");
const NOTES = new Map([
  [
    WEEK_NOTE,
    {
      frontmatter: { id: WEEK_NOTE, type: "observation", status: "DERIVED", created_by: "agent:lumen", updated: "2026-01-05T06:00:00Z", superseded_by: null, source_refs: [{ source: SOURCE, locator: "/world" }] },
      body: `Tägliche Messwerte.\n\n## Observations\n- 2026-01-05T06:00:00Z · agent:lumen · DERIVED · ${DIGEST} ^obs-e2e00001\n`,
      backlinks: ["kn-backlink-canary"],
    },
  ],
  [FOREIGN_NOTE, { frontmatter: { id: FOREIGN_NOTE, type: "observation", status: "DERIVED", created_by: "ana", superseded_by: null, source_refs: [{ source: SOURCE }] }, body: "FOREIGN-NOTE-CANARY", backlinks: [] }],
  [SOURCE, { frontmatter: { id: SOURCE, type: "source", status: "SOURCE", created_by: "agent:lumen", superseded_by: null, source: { kind: "url", locator: "/world", access: "internal", data_class: "G1" } }, body: "", backlinks: [] }],
]);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const path = new URL(req.url ?? "/", "http://x").pathname;

  if (path === "/__fake/health") return send(res, 200, { ok: true });
  if (path === "/__fake/mcp-calls") return send(res, 200, { calls: mcpCalls });
  if (path === "/__fake/search-calls") return send(res, 200, { calls: searchCalls });
  if (path === "/mcp" && req.method === "POST") {
    if (req.headers.authorization !== `Bearer ${agentKey}`) return send(res, 401, { error: "unauthorized" });
    const rpc = JSON.parse(raw);
    const { name, arguments: args } = rpc.params ?? {};
    // the low-scoring hit is logged too: a read of it would mean the score floor did not hold
    if (name === "brain_get" && args?.id === LOW_SCORING_NOTE) searchCalls.push({ name, args });
    if (name === "brain_search" || (name === "brain_get" && NOTES.has(args?.id))) {
      searchCalls.push({ name, args });
      if (name === "brain_search" && mode === "search-down") return req.socket.destroy();
      const content = name === "brain_search" ? { results: [{ id: WEEK_NOTE, title: "Was läuft", type: "observation", score: 0.91 }, { id: FOREIGN_NOTE, title: "Fremd", type: "observation", score: 0.88 }, { id: "kn-world-pulse-2025-w50", title: "Fern", type: "observation", score: 0.12 }] } : NOTES.get(args.id);
      return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(content) }] } });
    }
    mcpCalls.push({ name, args });
    // like the real Brain: an id that exists is refused with "exists:"
    if ((name === "brain_create_note" || name === "brain_register_source") && madeIds.has(args?.id)) {
      return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { isError: true, content: [{ type: "text", text: `exists: note already exists: ${args.id}` }] } });
    }
    if (name === "brain_get") {
      const body = (observations.get(args?.id) ?? []).map((t) => `- 2026-01-01T00:00:00Z · agent:lumen · DERIVED · ${t}`).join("\n");
      return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify({ id: args?.id, body }) }] } });
    }
    if (name === "brain_append_observation") observations.set(args.id, [...(observations.get(args.id) ?? []), String(args.text)]);
    if (args?.id && name !== "brain_append_observation") madeIds.add(args.id);
    return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: "{}" }] } });
  }
  if (path === "/__fake/reset" && req.method === "POST") {
    mode = "ok";
    searchCalls = [];
    return send(res, 200, { ok: true });
  }
  if (path === "/__fake/mode" && req.method === "POST") {
    const next = raw ? JSON.parse(raw).mode : undefined;
    if (!MODES.has(next)) return send(res, 400, { error: `unknown mode ${next}` });
    mode = next;
    return send(res, 200, { ok: true });
  }

  if (path !== "/projection" || req.method !== "GET") return send(res, 404, { error: "not found" });
  if (mode === "down") return req.socket.destroy();
  if (mode === "unauthorized" || req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "unauthorized" });
  if (mode === "invalid") return send(res, 200, { version: 2, nodes: "nope" });
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 5_000));
  const projection = baseProjection();
  if (mode === "empty") return send(res, 200, { ...projection, clusters: [], nodes: [], edges: [] });
  if (mode === "unindexed") return send(res, 200, { ...projection, unindexed: 2 });
  if (mode === "pending") return send(res, 200, { ...projection, clusters: [], nodes: [], edges: [], unindexed: 5 });
  return send(res, 200, mode === "mirrored" ? mirrored(projection) : projection);
});

server.listen(port, "127.0.0.1", () => console.log(`fake Brain listening on http://127.0.0.1:${port}`));
