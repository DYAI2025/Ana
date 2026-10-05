/**
 * HTTP wrapper around the fake Jira core for Playwright. Binds to 127.0.0.1 only. Never use against real data.
 *
 *   node e2e/fake-jira/server.mjs            (port FAKE_JIRA_PORT, default 3199)
 *
 * Control endpoints for tests: POST /__fake/reset · /__fake/fault · /__fake/board · /__fake/search-lag ·
 * /__fake/status  and  GET /__fake/state · /__fake/health
 */
import http from "node:http";
import { createFakeJira } from "./core.mjs";

const port = Number(process.env.FAKE_JIRA_PORT ?? 3199);
const fake = createFakeJira();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === null || body === undefined ? "" : JSON.stringify(body));
}

function control(method, path, body, res) {
  if (method === "GET" && path === "/__fake/health") return send(res, 200, { ok: true });
  if (method === "GET" && path === "/__fake/state") return send(res, 200, fake.summary());
  if (method !== "POST") return send(res, 405, { error: "method" });
  switch (path) {
    case "/__fake/reset":
      fake.reset();
      return send(res, 200, { ok: true });
    case "/__fake/fault":
      fake.addFault(body);
      return send(res, 200, { ok: true });
    case "/__fake/board":
      fake.setBoard(body);
      return send(res, 200, { ok: true });
    case "/__fake/search-lag":
      fake.setSearchLag(Number(body?.ms ?? 0));
      return send(res, 200, { ok: true });
    case "/__fake/status":
      return send(res, fake.setStatus(body?.key, body?.statusId) ? 200 : 404, { ok: true });
    default:
      return send(res, 404, { error: `no control route ${path}` });
  }
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    return send(res, 400, { errorMessages: ["invalid JSON"] });
  }
  const url = req.url ?? "/";
  if (url.startsWith("/__fake/")) return control(req.method, new URL(url, "http://x").pathname, body, res);

  const result = fake.handle(req.method ?? "GET", url, req.headers, body);
  if (result.network) {
    req.socket.destroy();
    return;
  }
  if (result.delayMs) await sleep(result.delayMs);
  if (res.destroyed) return;
  if (result.hang) return send(res, 503, { errorMessages: ["slow"] });
  send(res, result.status, result.body);
});

server.listen(port, "127.0.0.1", () => console.log(`fake Jira listening on http://127.0.0.1:${port}`));
