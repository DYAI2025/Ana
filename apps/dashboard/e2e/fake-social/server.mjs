/**
 * HTTP wrapper around the fake Instagram worker for Playwright (ANA-38). Binds to 127.0.0.1 only; synthetic data only.
 *
 *   node e2e/fake-social/server.mjs     (port FAKE_SOCIAL_PORT, default 3198; key FAKE_SOCIAL_KEY)
 *
 * Control: POST /__fake/reset · POST /__fake/fault {status,error}|{hang}|{network}|{invalid}|{empty}|{observedAt} · GET /__fake/state · GET /__fake/health
 */
import http from "node:http";
import { createFakeSocial } from "./core.mjs";

const port = Number(process.env.FAKE_SOCIAL_PORT ?? 3198);
const key = process.env.FAKE_SOCIAL_KEY ?? "e2e-fake-social-key";
const fake = createFakeSocial();

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const url = req.url ?? "/";
  const path = new URL(url, "http://x").pathname;
  if (path === "/__fake/health") return send(res, 200, { ok: true });
  if (path === "/__fake/state") return send(res, 200, fake.summary());
  if (path === "/__fake/reset" && req.method === "POST") {
    fake.reset();
    return send(res, 200, { ok: true });
  }
  if (path === "/__fake/fault" && req.method === "POST") {
    fake.setFault(raw ? JSON.parse(raw) : null);
    return send(res, 200, { ok: true });
  }
  const result = fake.handle(req.method ?? "GET", url, req.headers, key);
  if (result.network) return req.socket.destroy();
  if (result.hang) return; // never answers: the dashboard's timeout must fire
  send(res, result.status, result.body);
});

server.listen(port, "127.0.0.1", () => console.log(`fake Instagram worker listening on http://127.0.0.1:${port}`));
