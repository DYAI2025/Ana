import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardToken, KeyStore, sha256hex } from "../src/auth/keys.js";
import { revokeActor } from "../src/auth/oauth.js";
import { createApp } from "../src/http/app.js";
import { Indexer } from "../src/index/indexer.js";
import { OllamaEmbedder } from "../src/index/ollama.js";
import { TOOL_NAMES } from "../src/mcp/tools.js";
import { Vault } from "../src/vault/vault.js";
import { fakeOllama, listen, MemoryStore, syntheticVault, tmpDir } from "./helpers.js";

let server: Server;
let base: string;
let root: string;
let stateDir: string;
let keys: { ben: string; vince: string };
let dashToken: string;
let ollama: Awaited<ReturnType<typeof fakeOllama>>;

beforeAll(async () => {
  ollama = await fakeOllama();
  root = syntheticVault();
  stateDir = tmpDir("state-");
  const ks = new KeyStore(stateDir);
  keys = { ben: ks.issue("ben"), vince: ks.issue("vince") };
  dashToken = new DashboardToken(stateDir).issue();
  const vault = new Vault(root);
  const embedder = new OllamaEmbedder(ollama.url);
  const store = new MemoryStore();
  await new Indexer(vault, embedder, store).run();
  server = createServer();
  base = await listen(server);
  server.on("request", createApp({ vault, embedder, store, stateDir, publicUrl: base }));
});
afterAll(() => {
  server.close();
  ollama.close();
});

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");
const audit = () => readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string>);

/** Authorization code + PKCE with a personal key; returns the token pair and the client id. */
async function oauthLogin(accessKey: string): Promise<{ access_token: string; refresh_token: string; client_id: string }> {
  const redirect = "http://127.0.0.1:9/callback";
  const reg = (await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect], client_name: "Test", token_endpoint_auth_method: "none" }) })).json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const params = { client_id: reg.client_id, redirect_uri: redirect, response_type: "code", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" };
  const ok = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...params, access_key: accessKey }) });
  expect(ok.status).toBe(302);
  const code = new URL(ok.headers.get("location")!).searchParams.get("code")!;
  const tok = (await (await fetch(`${base}/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect }) })).json()) as { access_token: string; refresh_token: string };
  return { ...tok, client_id: reg.client_id };
}
const refresh = (refreshToken: string, clientId: string) =>
  fetch(`${base}/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }) });
const mcpStatus = async (token: string) =>
  (await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status;

describe("http + mcp", () => {
  it("healthz is public and data-free", async () => {
    const r = await fetch(`${base}/healthz`);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("rejects unauthenticated and bad-key MCP requests with 401 + resource metadata", async () => {
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer not-a-real-key-at-all" }]) {
      const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    }
  });

  it("exposes exactly the brain tools and no delete/overwrite tool", async () => {
    const c = await connect(keys.ben);
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(names.some((n) => /delete|remove|overwrite|update|replace/.test(n))).toBe(false);
    await c.close();
  });

  it("records distinct caller identities from auth, never from input", async () => {
    const ben = await connect(keys.ben);
    const vince = await connect(keys.vince);
    const r1 = await ben.callTool({ name: "brain_create_note", arguments: { id: "kn-by-ben", title: "Ben", type: "concept", status: "DERIVED", body: "Synthetic.", source_refs: [{ source: "src-synthetic-report", locator: "UNKNOWN" }], created_by: "ana" } });
    expect(r1.isError).toBeFalsy();
    const r2 = await vince.callTool({ name: "brain_append_observation", arguments: { id: "kn-by-ben", text: "Synthetic observation." } });
    expect(r2.isError).toBeFalsy();
    const got = JSON.parse(text(await ben.callTool({ name: "brain_get", arguments: { id: "kn-by-ben" } })));
    expect(got.frontmatter.created_by).toBe("ben");
    expect(got.frontmatter.provenance.actor).toBe("ben");
    expect(got.body).toMatch(/· vince · CANDIDATE · Synthetic observation\./);
    const a = audit();
    expect(a).toContainEqual(expect.objectContaining({ actor: "ben", action: "create_note", target: "kn-by-ben", result: "ok" }));
    expect(a).toContainEqual(expect.objectContaining({ actor: "vince", action: "append_observation", target: "kn-by-ben", result: "ok" }));
    expect(JSON.stringify(a)).not.toContain("Synthetic");
    await ben.close();
    await vince.close();
  });

  it("rejects path traversal ids, unsafe CONFIRMED and supports reads", async () => {
    const c = await connect(keys.ben);
    const bad = await c.callTool({ name: "brain_get", arguments: { id: "../../etc/passwd" } });
    expect(bad.isError).toBe(true);
    const bad2 = await c.callTool({ name: "brain_create_note", arguments: { id: "kn-../../x", title: "t", type: "concept", status: "DERIVED", body: "b" } });
    expect(bad2.isError).toBe(true);
    const conf = await c.callTool({ name: "brain_create_note", arguments: { id: "kn-unconfirmed", title: "t", type: "preference", status: "CONFIRMED", body: "b" } });
    expect(conf.isError).toBe(true);
    const search = JSON.parse(text(await c.callTool({ name: "brain_search", arguments: { query: "hook opening shot" } })));
    expect(search.results[0].id).toMatch(/^kn-hook/);
    const ctx = JSON.parse(text(await c.callTool({ name: "brain_context", arguments: { id: "ws-01-intro", budget_chars: 2000 } })));
    expect(ctx.notes.map((n: { id: string }) => n.id)).toContain("kn-hook-first");
    const rel = await c.callTool({ name: "brain_add_relation", arguments: { from: "kn-hook-variant", type: "supports", to: "kn-hook-first" } });
    expect(rel.isError).toBeFalsy();
    const missing = await c.callTool({ name: "brain_add_relation", arguments: { from: "kn-hook-variant", type: "supports", to: "kn-does-not-exist" } });
    expect(missing.isError).toBe(true);
    const related = JSON.parse(text(await c.callTool({ name: "brain_related", arguments: { id: "kn-hook-first" } })));
    expect(related.backlinks).toContainEqual(expect.objectContaining({ from: "kn-hook-variant", type: "supports" }));
    const src = await c.callTool({ name: "brain_register_source", arguments: { id: "src-syn-mcp", title: "S", description: "Short.", source: { kind: "url", locator: "https://example.org", original_title: "Ex", access: "public", data_class: "G0" } } });
    expect(src.isError).toBeFalsy();
    await c.close();
  });

  it("serves /projection only with the dashboard token", async () => {
    expect((await fetch(`${base}/projection`)).status).toBe(401);
    expect((await fetch(`${base}/projection`, { headers: { authorization: `Bearer ${keys.ben}` } })).status).toBe(401);
    const r = await fetch(`${base}/projection`, { headers: { authorization: `Bearer ${dashToken}` } });
    expect(r.status).toBe(200);
    const p = (await r.json()) as { version: number; nodes: unknown[] };
    expect(p.version).toBe(1);
    expect(p.nodes.length).toBeGreaterThan(0);
  });

  it("publishes OAuth metadata and completes authorization code + PKCE with a personal key", async () => {
    const as = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(as.registration_endpoint).toBe(`${base}/register`);
    expect(as.code_challenge_methods_supported).toContain("S256");
    const prm = (await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>;
    expect(prm.resource).toBe(`${base}/mcp`);

    const redirect = "http://127.0.0.1:9/callback";
    const reg = (await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect], client_name: "Test", token_endpoint_auth_method: "none" }) })).json()) as { client_id: string };
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const params = { client_id: reg.client_id, redirect_uri: redirect, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };
    const form = await fetch(`${base}/authorize?${new URLSearchParams(params)}`);
    expect(form.status).toBe(200);
    const page = await form.text();
    expect(page).toContain('name="access_key"');
    // the form's POST answers with a 302 to the client: form-action must allow that origin or the browser blocks it
    expect(form.headers.get("content-security-policy")).toMatch(/form-action 'self' http:\/\/127\.0\.0\.1:9(;|$)/);
    // the person sees where the code goes, not only the name the registrant chose (the hidden field alone shows nothing)
    expect(page).toContain("access is handed to <strong>127.0.0.1:9</strong>");
    const wrong = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...params, access_key: "wrong-key-wrong-key" }) });
    expect(wrong.status).toBe(401);
    const ok = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...params, access_key: keys.vince }) });
    expect(ok.status).toBe(302);
    const loc = new URL(ok.headers.get("location")!);
    expect(loc.searchParams.get("state")).toBe("xyz");
    const tok = (await (await fetch(`${base}/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: loc.searchParams.get("code")!, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect }) })).json()) as { access_token: string };
    expect(tok.access_token).toBeTruthy();
    const c = await connect(tok.access_token);
    await c.callTool({ name: "brain_append_observation", arguments: { id: "kn-hook-variant", text: "Via OAuth." } });
    expect(audit().at(-1)).toMatchObject({ actor: "vince", target: "kn-hook-variant", result: "ok" });
    await c.close();
    const oauthFile = readFileSync(path.join(stateDir, "oauth.json"), "utf8");
    expect(oauthFile).not.toContain(tok.access_token);
    expect(readFileSync(path.join(stateDir, "keys.json"), "utf8")).not.toContain(keys.vince);
  });

  it("the consent page's form-action names every redirect a client can register, also an IPv6 loopback (RFC 8252)", async () => {
    // CSP host-source has no IPv6 literal: Chromium ignores `http://[::1]:8123` as an invalid source and blocks the 302
    const csp = async (redirect: string) => {
      const reg = (await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect], client_name: "Test", token_endpoint_auth_method: "none" }) })).json()) as { client_id: string };
      const q = new URLSearchParams({ client_id: reg.client_id, redirect_uri: redirect, response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256" });
      const page = await fetch(`${base}/authorize?${q}`);
      expect(page.status).toBe(200);
      return page.headers.get("content-security-policy")!.split("; ").find((d) => d.startsWith("form-action"));
    };
    expect(await csp("http://[::1]:8123/callback")).toBe("form-action 'self' http:");
    expect(await csp("https://claude.ai/api/mcp/auth_callback")).toBe("form-action 'self' https://claude.ai");
    expect(await csp("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("form-action 'self' cursor:");
  });

  it("OAuth tokens die with the key that authorized them, even when it is removed by hand (B-7)", async () => {
    const ks = new KeyStore(stateDir);
    const anaKey = ks.issue("ana");
    const t1 = await oauthLogin(anaKey);
    expect(await mcpStatus(t1.access_token)).toBe(200);
    const r1 = await refresh(t1.refresh_token, t1.client_id);
    expect(r1.status).toBe(200);
    const t2 = (await r1.json()) as { access_token: string; refresh_token: string };
    // hand-edit keys.json the old way: drop ana's key, leave oauth.json alone
    const file = path.join(stateDir, "keys.json");
    writeFileSync(file, JSON.stringify((JSON.parse(readFileSync(file, "utf8")) as { actor: string }[]).filter((r) => r.actor !== "ana")));
    const r2 = await refresh(t2.refresh_token, t1.client_id);
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { error: string }).error).toBe("invalid_grant");
    expect(await mcpStatus(t2.access_token)).toBe(401);
    expect(await mcpStatus(keys.vince)).toBe(200);
  });

  it("revoke-key removes every key and token of one person and nobody else's", async () => {
    const ks = new KeyStore(stateDir);
    const anaKey = ks.issue("ana");
    const t = await oauthLogin(anaKey);
    const other = await oauthLogin(keys.ben);
    expect(revokeActor(stateDir, "ana")).toEqual({ keys: 1, tokens: 2 });
    expect(ks.verify(anaKey)).toBeUndefined();
    expect(await mcpStatus(anaKey)).toBe(401);
    expect(await mcpStatus(t.access_token)).toBe(401);
    expect((await refresh(t.refresh_token, t.client_id)).status).toBe(400);
    expect(readFileSync(path.join(stateDir, "oauth.json"), "utf8")).not.toMatch(/"actor": "ana"/);
    expect(await mcpStatus(other.access_token)).toBe(200);
    expect(revokeActor(stateDir, "ana")).toEqual({ keys: 0, tokens: 0 });
    expect(revokeActor(stateDir, "agent:x")).toEqual({ keys: 0, tokens: 0 });
    expect(() => revokeActor(stateDir, "mallory")).toThrow(/ana, ben, vince/);
    expect(() => revokeActor(stateDir, "agent:")).toThrow(/agent:<name>/);
  });

  it("an agent key writes as that agent (agent-derived, never CONFIRMED), cannot log in via OAuth and is revocable", async () => {
    const ks = new KeyStore(stateDir);
    expect(() => ks.issue("agent:Bad Name")).toThrow(/agent:<name>/);
    expect(() => ks.issue("lumen")).toThrow();
    const agentKey = ks.issue("agent:lumen");
    expect(ks.verify(agentKey)).toBe("agent:lumen");
    const c = await connect(agentKey);
    const made = await c.callTool({ name: "brain_create_note", arguments: { id: "kn-by-lumen", title: "Lumen", type: "concept", status: "CANDIDATE", body: "Synthetic.", source_refs: [{ source: "src-synthetic-report", locator: "UNKNOWN" }], created_by: "ben" } });
    expect(made.isError).toBeFalsy();
    const got = JSON.parse(text(await c.callTool({ name: "brain_get", arguments: { id: "kn-by-lumen" } })));
    expect(got.frontmatter.created_by).toBe("agent:lumen");
    expect(got.frontmatter.provenance).toMatchObject({ actor: "agent:lumen", method: "agent-derived" });
    const conf = await c.callTool({ name: "brain_create_note", arguments: { id: "kn-lumen-confirmed", title: "t", type: "preference", status: "CONFIRMED", body: "b" } });
    expect(conf.isError).toBe(true);
    expect(audit()).toContainEqual(expect.objectContaining({ actor: "agent:lumen", action: "create_note", target: "kn-by-lumen", result: "ok" }));
    // agents add knowledge, they never retire it and never read Drive text
    const sup = await c.callTool({ name: "brain_add_relation", arguments: { from: "kn-by-lumen", type: "supersedes", to: "kn-hook-first" } });
    expect(sup.isError).toBe(true);
    expect(text(sup)).toMatch(/people only/);
    expect(JSON.parse(text(await c.callTool({ name: "brain_get", arguments: { id: "kn-hook-first" } }))).frontmatter.status).not.toBe("SUPERSEDED");
    expect((await c.callTool({ name: "brain_add_relation", arguments: { from: "kn-by-lumen", type: "relates_to", to: "kn-hook-first" } })).isError).toBeFalsy();
    expect((await c.callTool({ name: "brain_read_source", arguments: { id: "src-synthetic-report" } })).isError).toBe(true);
    const drive = await c.callTool({ name: "brain_register_source", arguments: { id: "src-lumen-drive", title: "D", description: "x", source: { kind: "drive_doc", locator: "abc", original_title: "D", access: "internal", data_class: "G1" } } });
    expect(drive.isError).toBe(true);
    const url = await c.callTool({ name: "brain_register_source", arguments: { id: "src-lumen-url", title: "U", description: "x", source: { kind: "url", locator: "https://example.org/w", original_title: "U", access: "internal", data_class: "G1" } } });
    expect(url.isError).toBeFalsy();
    await c.close();
    // the browser login is for people: an agent key gets no code
    const reg = (await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:9/callback"], client_name: "Test", token_endpoint_auth_method: "none" }) })).json()) as { client_id: string };
    const q = { client_id: reg.client_id, redirect_uri: "http://127.0.0.1:9/callback", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256" };
    const login = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...q, access_key: agentKey }) });
    expect(login.status).toBe(401);
    expect(revokeActor(stateDir, "agent:lumen")).toEqual({ keys: 1, tokens: 0 });
    expect(await mcpStatus(agentKey)).toBe(401);
    expect(await mcpStatus(keys.ben)).toBe(200);
  });

  it("refuses a stored token that is not bound to a key", async () => {
    const raw = randomBytes(32).toString("base64url");
    const file = path.join(stateDir, "oauth.json");
    const s = JSON.parse(readFileSync(file, "utf8")) as { tokens: Record<string, unknown> };
    s.tokens[sha256hex(raw)] = { kind: "access", actor: "vince", client_id: "legacy", scopes: [], expires_at: Math.floor(Date.now() / 1000) + 600 };
    writeFileSync(file, JSON.stringify(s));
    expect(await mcpStatus(raw)).toBe(401);
  });

  it("every path the shipped nginx configs proxy is served by the app", async () => {
    const dirs = [path.join(import.meta.dirname, "..", "deploy"), path.join(import.meta.dirname, "..", "..", "..", "deploy", "ana-brain")];
    // both kits must be found: the legacy one (apps/brain/deploy) and the Contabo one (deploy/ana-brain)
    const confs = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".conf")).map((f) => path.join(d, f)));
    for (const d of dirs) expect(confs.some((f) => path.dirname(f) === d), d).toBe(true);
    const paths = new Set(confs.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/location = (\/[a-z/._-]+)\s*\{\s*proxy_pass/g)].map((m) => m[1]!)));
    expect(paths).toContain("/mcp");
    for (const p of paths) expect((await fetch(`${base}${p}`)).status, p).not.toBe(404);
  });
});
