#!/usr/bin/env node
/**
 * Real-boundary smoke for the ANA Brain MCP service. Prints a JSON evidence record; never prints keys or note bodies.
 *
 *   SMOKE_URL=https://mcp.ana.dyai.cloud            (or http://127.0.0.1:8790 on the server)
 *   SMOKE_KEY_FILES=/root/ana-brain-keys/ana.key,/root/ana-brain-keys/ben.key   (>= 2 distinct callers, required)
 *   SMOKE_REVOKED_KEY_FILES=/root/ana-brain-keys/vince.key   keys revoked with `brain.sh revoke-key` before the run:
 *                                                            each must now get the wrong-key 401
 *   SMOKE_QUERY="cut brief hook"   SMOKE_ANCHOR=ws-05-1-video-director
 *   SMOKE_AUDIT_FILE=<vault>/.ana/audit.jsonl   optional: refusals must append exactly their audit lines (read only)
 *   SMOKE_WRITES=1   only against a DISPOSABLE instance (a copy of the vault): exercises the write tools
 *
 * A refusal passes only with the server's own error text and an unchanged target, never on isError alone. Every
 * check records its tool, arguments and result text; a step that throws is recorded as a failed check.
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:8790";
const list = (v) => (v ?? "").split(",").filter(Boolean);
const keyFiles = list(process.env.SMOKE_KEY_FILES);
const revokedFiles = list(process.env.SMOKE_REVOKED_KEY_FILES);
const query = process.env.SMOKE_QUERY ?? "cut brief hook";
const anchor = process.env.SMOKE_ANCHOR ?? "ws-05-1-video-director";
const auditFile = process.env.SMOKE_AUDIT_FILE;
const writes = process.env.SMOKE_WRITES === "1";
const evidence = { at: new Date().toISOString(), base, writes, checks: [] };
const check = (name, pass, detail = {}) => evidence.checks.push({ name, at: new Date().toISOString(), pass: Boolean(pass), ...detail });
const step = async (name, fn) => {
  try { await fn(); } catch (e) { check(name, false, { threw: String(e?.message ?? e).slice(0, 300) }); }
};

// the bounded tool set (apps/brain/src/mcp/tools.ts TOOL_NAMES)
const TOOLS = ["brain_search", "brain_get", "brain_context", "brain_related", "brain_create_note", "brain_register_source",
  "brain_add_relation", "brain_append_observation", "brain_read_source"].sort();

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
  return { isError: Boolean(r.isError), data, text: r.isError ? text.slice(0, 300) : undefined };
};
// what a check records about a call: never a note body
const seen = (name, args, r) => ({ tool: name, args, isError: r.isError, text: r.text });
// a note as it is stored: frontmatter + body, to prove a refusal changed nothing
const snapshot = async (client, id) => {
  const g = await call(client, "brain_get", { id });
  return g.isError ? `error: ${g.text}` : JSON.stringify([g.data?.frontmatter, g.data?.body]);
};
const auditLines = () => (auditFile && existsSync(auditFile) ? readFileSync(auditFile, "utf8").split("\n").filter(Boolean) : []);
// the audit lines a refusal must leave behind, compared on action/target/result (actor/method/at vary)
const auditDelta = (before) => auditLines().slice(before).map((l) => { const a = JSON.parse(l); return `${a.action} ${a.target} ${a.result}`; });

// refused before any tool runs: the SDK bearer guard and the key check (src/auth/oauth.ts)
const raw401 = async (label, headers, description) => {
  const res = await fetch(new URL("/mcp", base), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  let body = {};
  try { body = await res.json(); } catch { /* not json */ }
  const www = res.headers.get("www-authenticate") ?? "";
  check(`${label} -> 401 ${description}`,
    res.status === 401 && body.error === "invalid_token" && body.error_description === description
      && /error="invalid_token"/.test(www) && /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/.test(www),
    { status: res.status, error: body.error, error_description: body.error_description, www_authenticate: www.slice(0, 200) });
};

await step("unauthenticated requests", async () => {
  await raw401("no key", {}, "Missing Authorization header");
  await raw401("wrong key", { authorization: "Bearer not-a-real-key" }, "invalid or expired token");
});
for (const file of revokedFiles) {
  await step(`[${file.split("/").pop()}] revoked key`, async () => {
    const key = readFileSync(file, "utf8").trim();
    await raw401(`[${file.split("/").pop()}] revoked key`, { authorization: `Bearer ${key}` }, "invalid or expired token");
  });
}
await step("projection", async () => {
  const projection = await fetch(new URL("/projection", base));
  let body = {};
  try { body = await projection.json(); } catch { /* not json */ }
  check("projection without dashboard token -> 401 unauthorized", projection.status === 401 && body.error === "unauthorized", { status: projection.status, error: body.error });
  const meta = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base));
  check("OAuth protected-resource metadata", meta.ok, { status: meta.status });
});
check("at least two distinct caller keys given", keyFiles.length >= 2 && new Set(keyFiles).size === keyFiles.length, { keys: keyFiles.length });

const actors = [];
for (const file of keyFiles) {
  const who = file.split("/").pop();
  let client;
  await step(`[${who}] connect`, async () => { client = await connect(readFileSync(file, "utf8").trim()); });
  if (!client) continue;
  await step(`[${who}] projection with an MCP key`, async () => {
    const res = await fetch(new URL("/projection", base), { headers: { authorization: `Bearer ${readFileSync(file, "utf8").trim()}` } });
    check(`[${who}] projection with an MCP key -> 401`, res.status === 401, { status: res.status });
  });
  await step(`[${who}] reads`, async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    check(`[${who}] tools are exactly the bounded set`, JSON.stringify(tools) === JSON.stringify(TOOLS), { tools });
    const s = await call(client, "brain_search", { query, limit: 5 });
    const hits = s.data?.results ?? [];
    check(`[${who}] semantic search returns provenance-bearing notes`, !s.isError && hits.length > 0, { ...seen("brain_search", { query, limit: 5 }, s), top: hits.slice(0, 5).map((h) => ({ id: h.id ?? h.note_id, status: h.status, score: h.score })) });
    const ctx = await call(client, "brain_context", { id: anchor, budget_chars: 8000 });
    check(`[${who}] bounded workshop context`, !ctx.isError && ctx.data?.budget_chars === 8000, { ...seen("brain_context", { id: anchor, budget_chars: 8000 }, ctx), notes: ctx.data?.notes?.length, total_linked: ctx.data?.total_linked, truncated: ctx.data?.truncated });
    const rel = await call(client, "brain_related", { id: anchor });
    check(`[${who}] explicit relations/backlinks`, !rel.isError, { ...seen("brain_related", { id: anchor }, rel), relations: rel.data?.relations?.length, backlinks: rel.data?.backlinks?.length });
    const first = hits[0]?.id ?? hits[0]?.note_id;
    if (first) {
      const g = await call(client, "brain_get", { id: first });
      check(`[${who}] get note with provenance`, !g.isError && Boolean(g.data?.frontmatter?.provenance) && Array.isArray(g.data?.frontmatter?.source_refs), { ...seen("brain_get", { id: first }, g), status: g.data?.frontmatter?.status, source_refs: g.data?.frontmatter?.source_refs?.length });
    }
  });

  await step(`[${who}] refusals`, async () => {
    const before = await snapshot(client, anchor);
    check(`[${who}] anchor note readable`, !before.startsWith("error:"), { id: anchor, text: before.startsWith("error:") ? before : undefined });
    const audit0 = auditLines().length;
    // id schema (zod) layer: refused before the handler, so the vault's own path guard is covered by unit tests
    const trav = await call(client, "brain_get", { id: "../../etc/passwd" });
    check(`[${who}] path traversal id rejected by the id schema`, trav.isError && trav.text === "MCP error -32602: Input validation error: Invalid arguments for tool brain_get: invalid id at id", seen("brain_get", { id: "../../etc/passwd" }, trav));
    const del = await call(client, "brain_delete", { id: anchor });
    check(`[${who}] delete is not available`, del.isError && del.text === "MCP error -32602: Tool brain_delete not found", seen("brain_delete", { id: anchor }, del));
    // CANDIDATE needs no source, so only the existing-id gate can refuse this
    const overArgs = { id: anchor, title: "overwrite attempt", type: "concept", status: "CANDIDATE", body: "x" };
    const over = await call(client, "brain_create_note", overArgs);
    check(`[${who}] overwrite of an existing note refused`, over.isError && over.text === `exists: note already exists: ${anchor}`, seen("brain_create_note", { ...overArgs, body: "(redacted)" }, over));
    const after = await snapshot(client, anchor);
    check(`[${who}] anchor note unchanged after the refusals`, after === before, { id: anchor });
    if (auditFile) {
      const delta = auditDelta(audit0);
      check(`[${who}] refusals audited exactly`, JSON.stringify(delta) === JSON.stringify([`create_note ${anchor} rejected:exists`]), { audit: delta });
    }
  });

  if (writes) {
    await step(`[${who}] writes`, async () => {
      const tag = who.replace(/\W.*/, "");
      const id = `kn-smoke-${tag}-${Date.now().toString(36)}`;
      const c = await call(client, "brain_create_note", { id, title: `Smoke note (${tag})`, type: "concept", status: "CANDIDATE", body: "Disposable smoke-test note.", workshops: [anchor] });
      const got = await call(client, "brain_get", { id });
      actors.push(got.data?.frontmatter?.created_by);
      check(`[${tag}] create derived note attributed to the caller`, !c.isError && got.data?.frontmatter?.created_by === tag, { ...seen("brain_create_note", { id }, c), created_by: got.data?.frontmatter?.created_by });
      if (c.isError) return; // every later write check needs this note; a missing note would refuse them for the wrong reason
      const audit0 = auditLines().length;
      const conf = await call(client, "brain_create_note", { id: `${id}-c`, title: "x", type: "concept", status: "CONFIRMED", body: "x" });
      check(`[${tag}] CONFIRMED without explicit confirm refused`, conf.isError && conf.text === "forbidden: CONFIRMED requires a human caller (ana|ben|vince) and an explicit confirm flag", seen("brain_create_note", { id: `${id}-c`, status: "CONFIRMED" }, conf));
      const confGet = await call(client, "brain_get", { id: `${id}-c` });
      check(`[${tag}] refused CONFIRMED note was not written`, confGet.isError && confGet.text === `not_found: note not found: ${id}-c`, seen("brain_get", { id: `${id}-c` }, confGet));
      const relr = await call(client, "brain_add_relation", { from: id, type: "relates_to", to: anchor });
      check(`[${tag}] add typed relation`, !relr.isError, seen("brain_add_relation", { from: id, type: "relates_to", to: anchor }, relr));
      const rel1 = JSON.stringify((await call(client, "brain_related", { id })).data?.relations ?? null);
      const audit1 = auditLines().length;
      const bad = await call(client, "brain_add_relation", { from: id, type: "relates_to", to: "kn-does-not-exist" });
      check(`[${tag}] relation to a missing note refused`, bad.isError && bad.text === "not_found: note not found: kn-does-not-exist", seen("brain_add_relation", { from: id, type: "relates_to", to: "kn-does-not-exist" }, bad));
      const rel2 = JSON.stringify((await call(client, "brain_related", { id })).data?.relations ?? null);
      check(`[${tag}] relations unchanged after the refused relation`, rel1 === rel2 && rel1 !== "null", { id });
      if (auditFile) {
        const delta = auditDelta(audit0);
        check(`[${tag}] write refusals audited exactly`,
          delta[0] === `create_note ${id}-c rejected:forbidden` && delta.slice(audit1 - audit0).join("|") === `add_relation ${id} rejected:not_found`,
          { audit: delta });
      }
      const obs = await call(client, "brain_append_observation", { id, text: "Smoke observation.", status: "CANDIDATE" });
      check(`[${tag}] append observation`, !obs.isError, seen("brain_append_observation", { id }, obs));
      const srcId = `src-smoke-${tag}-${Date.now().toString(36)}`;
      const src = await call(client, "brain_register_source", { id: srcId, title: "Smoke source", description: "Locator only.", source: { kind: "url", locator: "https://example.org/smoke", original_title: "Smoke", access: "public", data_class: "G0" } });
      check(`[${tag}] register source record`, !src.isError, seen("brain_register_source", { id: srcId }, src));
    });
  }
  await client.close();
}
if (writes) check("distinct caller identities recorded", new Set(actors).size === actors.length && actors.length >= 2, { actors });

evidence.pass = evidence.checks.length > 0 && evidence.checks.every((c) => c.pass);
console.log(JSON.stringify(evidence, null, 2));
process.exit(evidence.pass ? 0 : 1);
