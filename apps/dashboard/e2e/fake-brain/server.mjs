/**
 * Fake Brain service for Playwright. Binds to 127.0.0.1 only and serves synthetic data only. Never use against real data.
 *
 *   node e2e/fake-brain/server.mjs            (port FAKE_BRAIN_PORT, default 3198; token FAKE_BRAIN_TOKEN)
 *
 * GET /projection (Bearer token) · control: POST /__fake/reset · POST /__fake/mode {mode} · GET /__fake/health
 * Modes: ok · mirrored (positions changed) · empty · down (socket destroyed) · unauthorized · invalid · slow
 */
import http from "node:http";
import { baseProjection, mirrored } from "./data.mjs";

const port = Number(process.env.FAKE_BRAIN_PORT ?? 3198);
const token = process.env.FAKE_BRAIN_TOKEN ?? "e2e-fake-brain-token";
const MODES = new Set(["ok", "mirrored", "empty", "down", "unauthorized", "invalid", "slow"]);
let mode = "ok";

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
  return send(res, 200, mode === "mirrored" ? mirrored(projection) : projection);
});

server.listen(port, "127.0.0.1", () => console.log(`fake Brain listening on http://127.0.0.1:${port}`));
