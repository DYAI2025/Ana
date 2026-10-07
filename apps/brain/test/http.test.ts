import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardToken, KeyStore } from "../src/auth/keys.js";
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
    const r1 = await ben.callTool({ name: "brain_create_note", arguments: { id: "kn-by-ben", title: "Ben", type: "concept", status: "DERIVED", body: "Synthetic.", created_by: "ana" } });
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
    expect(await form.text()).toContain('name="access_key"');
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
});
