import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeyStore } from "../src/auth/keys.js";
import { DriveClient, OUTSIDE_ROOT } from "../src/drive/client.js";
import { runConsent } from "../src/drive/consent.js";
import { DRIVE_SCOPE, DriveTokenProvider, loadDriveCredentials } from "../src/drive/oauth.js";
import { registerDriveSource } from "../src/drive/register.js";
import { createApp } from "../src/http/app.js";
import { TOOL_NAMES } from "../src/mcp/tools.js";
import { Vault } from "../src/vault/vault.js";
import { listen, MemoryStore, syntheticVault, tmpDir } from "./helpers.js";

// ---------- fake Google token + Drive v3 server (127.0.0.1 only, fake credentials) ----------

const FAKE_CREDS = { client_id: "fake-client.apps.example", client_secret: "fake-secret-not-real", refresh_token: "fake-refresh-not-real" };
const DOC_TEXT = "SECRET-TRANSCRIPT-LINE alpha beta gamma. ".repeat(10);
const VTT_TEXT = "WEBVTT\n\n00:00.000 --> 00:01.000\nfake caption line\n";
const ROOT = "rootfolder1";

interface FakeFile { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean; size?: string; content?: string }
const files = new Map<string, FakeFile>();
const add = (f: FakeFile) => files.set(f.id, f);
add({ id: ROOT, name: "ANA Evidence Root", mimeType: "application/vnd.google-apps.folder" });
add({ id: "subfolder1", name: "Transcripts", mimeType: "application/vnd.google-apps.folder", parents: [ROOT] });
add({ id: "docfile001", name: "Workshop 1 transcript", mimeType: "application/vnd.google-apps.document", parents: ["subfolder1"], content: DOC_TEXT });
add({ id: "vttfile001", name: "captions.vtt", mimeType: "text/vtt", parents: [ROOT], size: String(VTT_TEXT.length), content: VTT_TEXT });
add({ id: "vidfile001", name: "recording.mp4", mimeType: "video/mp4", parents: [ROOT], size: "999999" });
add({ id: "trashfile1", name: "old.txt", mimeType: "text/plain", parents: [ROOT], trashed: true, content: "x" });
add({ id: "otherfold1", name: "Private", mimeType: "application/vnd.google-apps.folder" });
add({ id: "outfile001", name: "outside.txt", mimeType: "text/plain", parents: ["otherfold1"], content: "outside" });
for (let i = 1; i <= 13; i++) add({ id: `deepfold${i}`, name: `d${i}`, mimeType: "application/vnd.google-apps.folder", parents: [i === 1 ? ROOT : `deepfold${i - 1}`] });
add({ id: "deepfile01", name: "too deep.txt", mimeType: "text/plain", parents: ["deepfold13"], content: "deep" });
add({ id: "okdeepfile", name: "ok deep.txt", mimeType: "text/plain", parents: ["deepfold5"], content: "ok deep" });

const stats = { token: 0, meta: 0, lists: 0 };
let validToken = "";

function body(req: IncomingMessage): Promise<string> {
  return new Promise((r) => {
    let b = "";
    req.on("data", (c: Buffer) => (b += c.toString()));
    req.on("end", () => r(b));
  });
}
const json = (res: ServerResponse, status: number, data: unknown): void => void res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data));

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const u = new URL(req.url ?? "/", "http://127.0.0.1");
  if (u.pathname === "/token") {
    const p = new URLSearchParams(await body(req));
    if (p.get("grant_type") === "authorization_code") {
      if (p.get("code") !== "fake-code" || !p.get("code_verifier")) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, { access_token: "at-x", refresh_token: "fake-refresh-from-consent", scope: DRIVE_SCOPE, expires_in: 3600 });
    }
    if (p.get("refresh_token") !== FAKE_CREDS.refresh_token || p.get("client_secret") !== FAKE_CREDS.client_secret) return json(res, 400, { error: "invalid_grant" });
    stats.token++;
    validToken = `access-${stats.token}`;
    return json(res, 200, { access_token: validToken, expires_in: 3600, token_type: "Bearer" });
  }
  if (req.headers.authorization !== `Bearer ${validToken}`) return json(res, 401, { error: { code: 401 } });
  const m = /^\/drive\/v3\/files(?:\/([^/]+))?(\/export)?$/.exec(u.pathname);
  if (!m) return json(res, 404, {});
  const [, id, exp] = m;
  if (!id) {
    stats.lists++;
    const q = /^'([^']+)' in parents and trashed=false$/.exec(u.searchParams.get("q") ?? "");
    if (!q) return json(res, 400, {});
    const kids = [...files.values()].filter((f) => f.parents?.includes(q[1]!) && !f.trashed).map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size, modifiedTime: "2026-10-01T10:00:00Z" }));
    const start = Number(u.searchParams.get("pageToken") ?? 0);
    const page = kids.slice(start, start + 2);
    return json(res, 200, { files: page, ...(start + 2 < kids.length ? { nextPageToken: String(start + 2) } : {}) });
  }
  const f = files.get(id);
  if (!f) return json(res, 404, { error: { code: 404 } });
  if (exp) {
    if (f.mimeType !== "application/vnd.google-apps.document" || u.searchParams.get("mimeType") !== "text/plain") return json(res, 400, {});
    return void res.writeHead(200, { "content-type": "text/plain" }).end(f.content);
  }
  if (u.searchParams.get("alt") === "media") return void res.writeHead(200, { "content-type": f.mimeType }).end(f.content ?? "");
  stats.meta++;
  const meta: Partial<FakeFile> = { ...f };
  delete meta.content;
  return json(res, 200, { ...meta, trashed: Boolean(f.trashed), modifiedTime: "2026-10-01T10:00:00Z" });
}

let fake: Server;
let base: string;
beforeAll(async () => {
  fake = createServer((req, res) => void handle(req, res));
  base = await listen(fake);
});
afterAll(() => fake.close());

const newDrive = (root = ROOT) => {
  const tokens = new DriveTokenProvider(FAKE_CREDS, `${base}/token`);
  return { tokens, drive: new DriveClient(tokens, root, `${base}/drive/v3`) };
};

describe("drive oauth", () => {
  it("refreshes once and caches the access token until expiry - 60s", async () => {
    let t = 1_000_000;
    const tokens = new DriveTokenProvider(FAKE_CREDS, `${base}/token`, () => t);
    const before = stats.token;
    const a = await tokens.accessToken();
    expect(await tokens.accessToken()).toBe(a);
    expect(stats.token).toBe(before + 1);
    t += (3600 - 59) * 1000;
    expect(await tokens.accessToken()).not.toBe(a);
    expect(stats.token).toBe(before + 2);
  });

  it("never includes secrets in refresh errors", async () => {
    const tokens = new DriveTokenProvider({ ...FAKE_CREDS, refresh_token: "wrong-refresh-token-xyz" }, `${base}/token`);
    const err = await tokens.accessToken().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 400 \(invalid_grant\)/);
    expect((err as Error).message).not.toMatch(/wrong-refresh|fake-secret/);
  });

  it("loads the credentials file and rejects incomplete files without echoing content", () => {
    const dir = tmpDir("drv-");
    const good = path.join(dir, "c.json");
    writeFileSync(good, JSON.stringify(FAKE_CREDS));
    expect(loadDriveCredentials(good)).toEqual(FAKE_CREDS);
    const bad = path.join(dir, "b.json");
    writeFileSync(bad, JSON.stringify({ client_id: "x", client_secret: "fake-secret-not-real" }));
    expect(() => loadDriveCredentials(bad)).toThrow(/missing refresh_token/);
    expect(() => loadDriveCredentials(bad)).not.toThrow(/fake-secret/);
  });
});

describe("drive client + root guard", () => {
  it("accepts the root and nested files", async () => {
    const { drive } = newDrive();
    expect((await drive.get(ROOT)).id).toBe(ROOT);
    expect((await drive.get("docfile001")).name).toBe("Workshop 1 transcript");
    expect((await drive.get("okdeepfile")).id).toBe("okdeepfile");
  });

  it("refuses files outside the root, trashed, too deep, unknown and malformed ids", async () => {
    const { drive } = newDrive();
    for (const id of ["outfile001", "otherfold1", "trashfile1", "deepfile01", "missing0001"]) await expect(drive.get(id)).rejects.toThrow(OUTSIDE_ROOT);
    await expect(drive.get("../etc/passwd")).rejects.toThrow(/invalid Drive file id/);
    await expect(drive.list("otherfold1")).rejects.toThrow(OUTSIDE_ROOT);
    await expect(drive.readText("outfile001")).rejects.toThrow(OUTSIDE_ROOT);
  });

  it("caches ancestry per process", async () => {
    const { drive } = newDrive();
    await drive.get("docfile001");
    const before = stats.meta;
    await drive.get("docfile001");
    expect(stats.meta - before).toBe(1); // only the file itself, not its parent chain
  });

  it("lists the root with pagination and without trashed files", async () => {
    const { drive } = newDrive();
    const before = stats.lists;
    const items = await drive.list();
    expect(stats.lists - before).toBeGreaterThan(1);
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual(["deepfold1", "subfolder1", "vidfile001", "vttfile001"].sort());
    expect(Object.keys(items[0]!).sort()).toEqual(["id", "mimeType", "modifiedTime", "name", "size"]);
  });

  it("reads Docs via export and text files via media; refuses recordings; bounds bytes", async () => {
    const { drive } = newDrive();
    expect((await drive.readText("docfile001")).text).toBe(DOC_TEXT);
    expect((await drive.readText("vttfile001")).text).toBe(VTT_TEXT);
    await expect(drive.readText("vidfile001")).rejects.toThrow(/unsupported mime type.*video\/mp4/);
    const r = await drive.readText("docfile001", 10);
    expect(r.truncated).toBe(true);
    expect(r.text).toBe(DOC_TEXT.slice(0, 10));
  });
});

describe("drive-register", () => {
  it("creates a valid source record with checksum and without content", async () => {
    const root = syntheticVault();
    const vault = new Vault(root, { git: false });
    const { drive } = newDrive();
    const fm = await registerDriveSource(vault, drive, "ben", { fileId: "docfile001", id: "src-drive-ws1-transcript", title: "WS1 transcript", topics: ["top-alpha"] });
    expect(fm.source).toMatchObject({ kind: "drive_doc", locator: "docfile001", original_title: "Workshop 1 transcript", access: "restricted", data_class: "UNKNOWN" });
    expect(fm.source?.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    const raw = readFileSync(path.join(root, "sources", "src-drive-ws1-transcript.md"), "utf8");
    expect(raw).not.toContain("SECRET-TRANSCRIPT-LINE");
    expect(raw).toContain("application/vnd.google-apps.document");
    expect(readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8")).not.toContain("SECRET-TRANSCRIPT-LINE");
    new Vault(root, { git: false }).require("src-drive-ws1-transcript");

    const vid = await registerDriveSource(vault, drive, "ben", { fileId: "vidfile001", id: "src-drive-recording", title: "Recording" });
    expect(vid.source?.kind).toBe("drive_file");
    expect(vid.source?.checksum).toBeUndefined();
    await expect(registerDriveSource(vault, drive, "ben", { fileId: "outfile001", id: "src-drive-outside", title: "x" })).rejects.toThrow(OUTSIDE_ROOT);
    expect(existsSync(path.join(root, "sources", "src-drive-outside.md"))).toBe(false);
  });
});

describe("drive-auth consent", () => {
  it("runs the loopback PKCE flow and writes a 0600 credentials file; refuses overwrite", async () => {
    const dir = tmpDir("consent-");
    const clientFile = path.join(dir, "client_secret.json");
    writeFileSync(clientFile, JSON.stringify({ installed: { client_id: FAKE_CREDS.client_id, client_secret: FAKE_CREDS.client_secret } }));
    const out = path.join(dir, "drive-oauth.json");
    let seen: URL | undefined;
    const run = () => runConsent({
      clientFile, outFile: out, authUrl: `${base}/auth`, tokenUrl: `${base}/token`, timeoutMs: 5000,
      openUrl: (url) => {
        seen = new URL(url);
        const cb = new URL(seen.searchParams.get("redirect_uri")!);
        cb.searchParams.set("code", "fake-code");
        cb.searchParams.set("state", seen.searchParams.get("state")!);
        void fetch(cb);
      },
    });
    expect(await run()).toEqual({ scope: DRIVE_SCOPE });
    expect(seen!.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(seen!.searchParams.get("code_challenge_method")).toBe("S256");
    expect(seen!.searchParams.get("access_type")).toBe("offline");
    expect(seen!.searchParams.get("prompt")).toBe("consent");
    expect(seen!.toString()).not.toContain(FAKE_CREDS.client_secret);
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ ...FAKE_CREDS, refresh_token: "fake-refresh-from-consent" });
    await expect(run()).rejects.toThrow(/--force/);
  });
});

describe("mcp drive tools", () => {
  let server: Server;
  let url: string;
  let key: string;
  let root: string;
  beforeAll(async () => {
    root = syntheticVault();
    const stateDir = tmpDir("state-");
    key = new KeyStore(stateDir).issue("ben");
    const vault = new Vault(root, { git: false });
    const { drive } = newDrive();
    await registerDriveSource(vault, drive, "ben", { fileId: "docfile001", id: "src-drive-doc", title: "Doc" });
    await registerDriveSource(vault, drive, "ben", { fileId: "vttfile001", id: "src-drive-vtt", title: "Captions" });
    // a drive source whose locator is outside the root (e.g. registered while Drive was not configured)
    await vault.registerSource("ben", { id: "src-drive-outside", title: "Outside", description: "x", source: { kind: "drive_file", locator: "outfile001", original_title: "o", access: "restricted", data_class: "UNKNOWN" } });
    server = createServer();
    url = await listen(server);
    const embedder = { model: "fake", embed: async (t: string[]) => t.map(() => [1]) };
    server.on("request", createApp({ vault, embedder: embedder as never, store: new MemoryStore(), drive, stateDir, publicUrl: url }));
  });
  afterAll(() => server.close());

  const connect = async () => {
    const c = new Client({ name: "t", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
    return c;
  };
  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const r = await c.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: Boolean(r.isError), text, data: r.isError ? undefined : (JSON.parse(text) as Record<string, unknown>) };
  };

  it("lists exactly 9 tools, none destructive", async () => {
    const c = await connect();
    const tools = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([...TOOL_NAMES].sort());
    expect(tools).toHaveLength(9);
    expect(tools.some((t) => /delete|remove|overwrite|update_body|write_file/.test(t))).toBe(false);
    await c.close();
  });

  it("brain_read_source returns bounded text for in-root drive sources", async () => {
    const c = await connect();
    const r = await call(c, "brain_read_source", { id: "src-drive-doc", offset: 5, max_chars: 20 });
    expect(r.data).toMatchObject({ source_id: "src-drive-doc", drive_file_id: "docfile001", mime: "application/vnd.google-apps.document", total_chars: DOC_TEXT.length, offset: 5, truncated: true });
    expect(r.data!.text).toBe(DOC_TEXT.slice(5, 25));
    const v = await call(c, "brain_read_source", { id: "src-drive-vtt" });
    expect(v.data).toMatchObject({ text: VTT_TEXT, truncated: false });
    expect(readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8")).not.toContain("SECRET-TRANSCRIPT-LINE");
    expect((await call(c, "brain_read_source", { id: "src-drive-doc", max_chars: 60001 })).isError).toBe(true);
    await c.close();
  });

  it("brain_read_source refuses non-drive sources, non-sources and out-of-root locators", async () => {
    const c = await connect();
    expect((await call(c, "brain_read_source", { id: "src-synthetic-report" })).text).toMatch(/not a Drive source/);
    expect((await call(c, "brain_read_source", { id: "kn-hook-first" })).text).toMatch(/not a Drive source/);
    expect((await call(c, "brain_read_source", { id: "src-drive-outside" })).text).toContain(OUTSIDE_ROOT);
    await c.close();
  });

  it("brain_register_source verifies drive locators against the root and fills metadata from Drive", async () => {
    const c = await connect();
    const src = (locator: string) => ({ kind: "drive_file", locator, original_title: "caller title", access: "restricted", data_class: "UNKNOWN" });
    const bad = await call(c, "brain_register_source", { id: "src-mcp-outside", title: "x", description: "x", source: src("outfile001") });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain(OUTSIDE_ROOT);
    expect(existsSync(path.join(root, "sources", "src-mcp-outside.md"))).toBe(false);
    const good = await call(c, "brain_register_source", { id: "src-mcp-vtt", title: "Captions", description: "captions", source: src("vttfile001") });
    expect(good.isError).toBe(false);
    const created = (good.data as { created: { source: Record<string, unknown> } }).created.source;
    expect(created).toMatchObject({ locator: "vttfile001", original_title: "captions.vtt" });
    expect(created.checksum).toMatch(/^sha256:/);
    expect(readFileSync(path.join(root, "sources", "src-mcp-vtt.md"), "utf8")).not.toContain("fake caption line");
    await c.close();
  });
});

describe("mcp without drive", () => {
  it("accepts drive_* registrations as given and refuses reads", async () => {
    const root = syntheticVault();
    const stateDir = tmpDir("state-");
    const key = new KeyStore(stateDir).issue("vince");
    const server = createServer();
    const url = await listen(server);
    server.on("request", createApp({ vault: new Vault(root, { git: false }), embedder: { model: "f", embed: async () => [] } as never, store: new MemoryStore(), stateDir, publicUrl: url }));
    const c = new Client({ name: "t", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
    const r = await c.callTool({ name: "brain_register_source", arguments: { id: "src-nodrive-x", title: "x", description: "x", source: { kind: "drive_doc", locator: "anyfileid1", original_title: "t", access: "restricted", data_class: "UNKNOWN" } } });
    expect(r.isError).toBeFalsy();
    const rd = await c.callTool({ name: "brain_read_source", arguments: { id: "src-nodrive-x" } });
    expect(rd.isError).toBe(true);
    await c.close();
    server.close();
  });
});
