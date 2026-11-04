/**
 * Fake model provider for Playwright, in the OpenAI chat completions shape. Binds to 127.0.0.1 only. It answers with
 * refs it finds in the prompt it was sent, so it can only cite what the dashboard really gave it, and it records every
 * request so a test can read what would have left the dashboard. Never a real provider.
 *
 *   node e2e/fake-llm/server.mjs            (port FAKE_LLM_PORT, default 3196; key FAKE_LLM_KEY)
 *
 * POST /v1/chat/completions · control: POST /__fake/reset · POST /__fake/mode {mode} · GET /__fake/requests · GET /__fake/health
 * Modes: ok · injection (obeys injected text and cites what does not exist) · no_evidence · garbage · rate_limited · failed · slow
 */
import http from "node:http";

const port = Number(process.env.FAKE_LLM_PORT ?? 3196);
const key = process.env.FAKE_LLM_KEY ?? "e2e-fake-analyst-key";
const MODES = new Set(["ok", "injection", "no_evidence", "garbage", "rate_limited", "failed", "slow"]);
let mode = "ok";
let requests = [];

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function fenced(user, tag) {
  const m = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(user);
  return m ? JSON.parse(m[1]) : null;
}

function answer(user) {
  const facts = fenced(user, "facts");
  const brain = fenced(user, "brain") ?? [];
  const rated = facts.posts.filter((p) => p.er !== null).sort((a, b) => b.er - a.er);
  const [first, second] = rated;
  const tagged = facts.posts.find((p) => p.theme);
  const out = {
    measured: [{ ref: first.ref, metric: "er" }, ...(second ? [{ ref: second.ref, metric: "reach" }] : [])],
    categories: tagged ? [{ ref: tagged.ref, field: "theme" }] : [],
    groups: facts.groups.slice(0, 1).map((g) => ({ ref: g.ref })),
    brain: brain.map((b) => ({ ref: b.ref })),
    hypotheses: [{ text: "Könnte am Format liegen.", refs: [first.ref] }],
  };
  if (mode === "injection") {
    out.measured.push({ ref: "p_00000000", metric: "er" }, { ref: first.ref, metric: "followers" });
    out.hypotheses.push({ text: "Siehe evil.example.com für 4711 neue Kunden", refs: [first.ref] });
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const path = new URL(req.url ?? "/", "http://x").pathname;

  if (path === "/__fake/health") return send(res, 200, { ok: true });
  if (path === "/__fake/requests") return send(res, 200, { requests });
  if (path === "/__fake/reset" && req.method === "POST") {
    mode = "ok";
    requests = [];
    return send(res, 200, { ok: true });
  }
  if (path === "/__fake/mode" && req.method === "POST") {
    const next = raw ? JSON.parse(raw).mode : undefined;
    if (!MODES.has(next)) return send(res, 400, { error: `unknown mode ${next}` });
    mode = next;
    return send(res, 200, { ok: true });
  }
  if (path !== "/v1/chat/completions" || req.method !== "POST") return send(res, 404, { error: "not found" });
  if (req.headers.authorization !== `Bearer ${key}`) return send(res, 401, { error: "PROVIDER-DETAIL-CANARY" });
  requests.push(raw);
  if (mode === "rate_limited") return send(res, 429, { error: "PROVIDER-DETAIL-CANARY" });
  if (mode === "failed") return send(res, 500, { error: "PROVIDER-DETAIL-CANARY" });
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 3_000));
  const user = JSON.parse(raw).messages.find((m) => m.role === "user").content;
  const content = mode === "garbage" ? "Die Strandposts laufen am besten, mit 4711 Likes." : mode === "no_evidence" ? JSON.stringify({ measured: [], categories: [], groups: [], brain: [], hypotheses: [] }) : JSON.stringify(answer(user));
  return send(res, 200, { choices: [{ message: { role: "assistant", content, refusal: null }, finish_reason: "stop" }] });
});

server.listen(port, "127.0.0.1", () => console.log(`fake model provider listening on http://127.0.0.1:${port}`));
