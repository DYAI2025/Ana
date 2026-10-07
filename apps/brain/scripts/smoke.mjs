#!/usr/bin/env node
/**
 * Real-boundary smoke for the ANA Brain MCP service. Prints a JSON evidence record; never prints keys or note bodies.
 *
 *   SMOKE_URL=https://mcp.ana.dyai.cloud            (or http://127.0.0.1:8790 on the server)
 *   SMOKE_KEY_FILES=/root/ana-brain-keys/ana.key,/root/ana-brain-keys/ben.key   (>= 2 distinct callers)
 *   SMOKE_QUERY="cut brief hook"   SMOKE_ANCHOR=ws-05-1-video-director
 *   SMOKE_WRITES=1   only against a DISPOSABLE instance (a copy of the vault): exercises the write tools
 */
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:8790";
const keyFiles = (process.env.SMOKE_KEY_FILES ?? "").split(",").filter(Boolean);
const query = process.env.SMOKE_QUERY ?? "cut brief hook";
const anchor = process.env.SMOKE_ANCHOR ?? "ws-05-1-video-director";
const writes = process.env.SMOKE_WRITES === "1";
const evidence = { at: new Date().toISOString(), base, checks: [] };
const check = (name, pass, detail = {}) => evidence.checks.push({ name, pass: Boolean(pass), ...detail });

async function connect(key) {
  const client = new Client({ name: "ana-brain-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", base), { requestInit: { headers: { authorization: `Bearer ${key}` } } });
  await client.connect(transport);
  return client;
}
const call = async (client, name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  let data = null;
  try { data = JSON.parse(text); } catch { /* error text */ }
  return { isError: Boolean(r.isError), data, text: r.isError ? text.slice(0, 200) : undefined };
};

// unauthenticated and wrong-key requests are refused
for (const [label, headers] of [["no key", {}], ["wrong key", { authorization: "Bearer not-a-real-key" }]]) {
  const res = await fetch(new URL("/mcp", base), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(`unauthenticated (${label}) -> 401`, res.status === 401, { status: res.status, www_authenticate: Boolean(res.headers.get("www-authenticate")) });
}
const projection = await fetch(new URL("/projection", base));
check("projection without dashboard token -> refused", projection.status === 401 || projection.status === 403, { status: projection.status });
const meta = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base));
check("OAuth protected-resource metadata", meta.ok, { status: meta.status });

const actors = [];
for (const file of keyFiles) {
  const key = readFileSync(file, "utf8").trim();
  const client = await connect(key);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check(`[${file.split("/").pop()}] tools are exactly the bounded set`, tools.length === 9 && !tools.some((t) => /delete|remove|overwrite|update_body|write_file/.test(t)), { tools });
  const s = await call(client, "brain_search", { query, limit: 5 });
  const hits = s.data?.results ?? [];
  check(`[${file.split("/").pop()}] semantic search returns provenance-bearing notes`, !s.isError && hits.length > 0, { top: hits.slice(0, 5).map((h) => ({ id: h.id ?? h.note_id, status: h.status, score: h.score })) });
  const ctx = await call(client, "brain_context", { id: anchor, budget_chars: 8000 });
  check(`[${file.split("/").pop()}] bounded workshop context`, !ctx.isError && ctx.data?.budget_chars === 8000, { notes: ctx.data?.notes?.length, total_linked: ctx.data?.total_linked, truncated: ctx.data?.truncated });
  const rel = await call(client, "brain_related", { id: anchor });
  check(`[${file.split("/").pop()}] explicit relations/backlinks`, !rel.isError, { relations: rel.data?.relations?.length, backlinks: rel.data?.backlinks?.length });
  const first = hits[0]?.id ?? hits[0]?.note_id;
  if (first) {
    const g = await call(client, "brain_get", { id: first });
    check(`[${file.split("/").pop()}] get note with provenance`, !g.isError && Boolean(g.data?.frontmatter?.provenance) && Array.isArray(g.data?.frontmatter?.source_refs), { id: first, status: g.data?.frontmatter?.status, source_refs: g.data?.frontmatter?.source_refs?.length });
  }
  const trav = await call(client, "brain_get", { id: "../../etc/passwd" });
  check(`[${file.split("/").pop()}] path traversal id rejected`, trav.isError, {});
  let unknownTool = false;
  try { const r = await client.callTool({ name: "brain_delete", arguments: { id: anchor } }); unknownTool = Boolean(r.isError); } catch { unknownTool = true; }
  check(`[${file.split("/").pop()}] delete is not available`, unknownTool, {});
  const over = await call(client, "brain_create_note", { id: anchor, title: "overwrite attempt", type: "concept", status: "DERIVED", body: "x" });
  check(`[${file.split("/").pop()}] overwrite of an existing note refused`, over.isError, {});

  if (writes) {
    const tag = file.split("/").pop().replace(/\W.*/, "");
    const id = `kn-smoke-${tag}-${Date.now().toString(36)}`;
    const c = await call(client, "brain_create_note", { id, title: `Smoke note (${tag})`, type: "concept", status: "CANDIDATE", body: "Disposable smoke-test note.", workshops: [anchor] });
    const got = await call(client, "brain_get", { id });
    actors.push(got.data?.frontmatter?.created_by);
    check(`[${tag}] create derived note attributed to the caller`, !c.isError && got.data?.frontmatter?.created_by === tag, { created_by: got.data?.frontmatter?.created_by });
    const conf = await call(client, "brain_create_note", { id: `${id}-c`, title: "x", type: "concept", status: "CONFIRMED", body: "x" });
    check(`[${tag}] CONFIRMED without explicit confirm refused`, conf.isError, {});
    const relr = await call(client, "brain_add_relation", { from: id, type: "relates_to", to: anchor });
    check(`[${tag}] add typed relation`, !relr.isError, {});
    const bad = await call(client, "brain_add_relation", { from: id, type: "relates_to", to: "kn-does-not-exist" });
    check(`[${tag}] relation to a missing note refused`, bad.isError, {});
    const obs = await call(client, "brain_append_observation", { id, text: "Smoke observation.", status: "CANDIDATE" });
    check(`[${tag}] append observation`, !obs.isError, {});
    const src = await call(client, "brain_register_source", { id: `src-smoke-${tag}-${Date.now().toString(36)}`, title: "Smoke source", description: "Locator only.", source: { kind: "url", locator: "https://example.org/smoke", original_title: "Smoke", access: "public", data_class: "G0" } });
    check(`[${tag}] register source record`, !src.isError, {});
  }
  await client.close();
}
if (writes) check("distinct caller identities recorded", new Set(actors).size === actors.length && actors.length >= 2, { actors });

evidence.pass = evidence.checks.every((c) => c.pass);
console.log(JSON.stringify(evidence, null, 2));
process.exit(evidence.pass ? 0 : 1);
