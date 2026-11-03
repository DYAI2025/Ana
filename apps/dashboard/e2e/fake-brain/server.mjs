/**
 * Fake Brain service for Playwright. Binds to 127.0.0.1 only and serves synthetic data only. Never use against real data.
 *
 *   node e2e/fake-brain/server.mjs            (port FAKE_BRAIN_PORT, default 3197; token FAKE_BRAIN_TOKEN)
 *
 * GET /projection (Bearer token) · POST /mcp (agent key, JSON-RPC tools/call, recorded) · control: POST /__fake/reset
 * · POST /__fake/mode {mode} · GET /__fake/health · GET /__fake/mcp-calls
 * Modes: ok · mirrored (positions changed) · empty · unindexed (2 notes not placed yet) · pending (nothing placed, 5 waiting)
 *   · down (socket destroyed) · unauthorized · invalid · slow
 */
import http from "node:http";
import { baseProjection, mirrored } from "./data.mjs";

const port = Number(process.env.FAKE_BRAIN_PORT ?? 3197);
const token = process.env.FAKE_BRAIN_TOKEN ?? "e2e-fake-brain-token";
const MODES = new Set(["ok", "mirrored", "empty", "unindexed", "pending", "down", "unauthorized", "invalid", "slow"]);
const agentKey = process.env.FAKE_BRAIN_AGENT_KEY ?? "anab_e2e-fake-agent-key-000000";
let mode = "ok";
/** tool calls the dashboard's Brain writer made (name + arguments) */
let mcpCalls = [];
const madeIds = new Set();

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
  if (path === "/mcp" && req.method === "POST") {
    if (req.headers.authorization !== `Bearer ${agentKey}`) return send(res, 401, { error: "unauthorized" });
    const rpc = JSON.parse(raw);
    const { name, arguments: args } = rpc.params ?? {};
    mcpCalls.push({ name, args });
    // like the real Brain: an id that exists is refused with "exists:"
    if ((name === "brain_create_note" || name === "brain_register_source") && madeIds.has(args?.id)) {
      return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { isError: true, content: [{ type: "text", text: `exists: note already exists: ${args.id}` }] } });
    }
    if (args?.id && name !== "brain_append_observation") madeIds.add(args.id);
    return send(res, 200, { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: "{}" }] } });
  }
  if (path === "/__fake/reset" && req.method === "POST") {
    mode = "ok";
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
