import { generateKeyPairSync, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeyStore } from "../src/auth/keys.js";
import { cliVault } from "../src/cli-vault.js";
import { DriveClient, OUTSIDE_ROOT } from "../src/drive/client.js";
import { loadConfig } from "../src/config.js";
import { DRIVE_SCOPE, DriveTokenProvider, JWT_BEARER, loadServiceAccountKey, type ServiceAccountKey } from "../src/drive/oauth.js";
import { registerDriveSource } from "../src/drive/register.js";
import { driveFromConfig, requireDrive } from "../src/drive/setup.js";
import { createApp } from "../src/http/app.js";
import { TOOL_NAMES } from "../src/mcp/tools.js";
import { Vault } from "../src/vault/vault.js";
import { listen, MemoryStore, syntheticVault, tmpDir } from "./helpers.js";

// ---------- fake Google token + Drive v3 server (127.0.0.1 only, fake credentials) ----------

// an in-test key pair: the fake token endpoint verifies the assertion signature with the public half
const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const KEYS = pair();
const FAKE_SA: ServiceAccountKey = { client_email: "ana-brain@fake-project.iam.example", private_key: KEYS.privateKey, private_key_id: "fake-kid-1" };
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

const stats = { token: 0, meta: 0, lists: 0, nonGet: 0 };
let lastGrant: { header: Record<string, unknown>; claims: Record<string, unknown>; form: string[] } | undefined;
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
    const [h, c, s] = (p.get("assertion") ?? "").split(".");
    if (p.get("grant_type") !== JWT_BEARER || !h || !c || !s) return json(res, 400, { error: "invalid_grant" });
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    lastGrant = { header: decode(h), claims: decode(c), form: [...p.keys()].sort() };
    if (!verify("sha256", Buffer.from(`${h}.${c}`), KEYS.publicKey, Buffer.from(s, "base64url"))) return json(res, 400, { error: "invalid_grant" });
    stats.token++;
    validToken = `access-${stats.token}`;
    return json(res, 200, { access_token: validToken, expires_in: 3600, token_type: "Bearer" });
  }
  if (req.method !== "GET") stats.nonGet++;
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
  const tokens = new DriveTokenProvider(FAKE_SA, `${base}/token`);
  return { tokens, drive: new DriveClient(tokens, root, `${base}/drive/v3`) };
};

describe("drive service-account auth", () => {
  it("signs an RS256 JWT-bearer grant for drive.readonly as the service account itself (no sub) and caches it", async () => {
    let t = 1_000_000;
    const tokens = new DriveTokenProvider(FAKE_SA, `${base}/token`, () => t);
    const before = stats.token;
    const a = await tokens.accessToken();
    expect(stats.token).toBe(before + 1);
    expect(lastGrant!.form).toEqual(["assertion", "grant_type"]);
    expect(lastGrant!.header).toEqual({ alg: "RS256", typ: "JWT", kid: "fake-kid-1" });
    const claims = lastGrant!.claims;
    expect(claims).toEqual({ iss: FAKE_SA.client_email, scope: DRIVE_SCOPE, aud: `${base}/token`, iat: 1000, exp: 4600 });
    expect(claims).not.toHaveProperty("sub");
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(3600);
    expect(await tokens.accessToken()).toBe(a);
    expect(stats.token).toBe(before + 1);
    t += (3600 - 59) * 1000;
    expect(await tokens.accessToken()).not.toBe(a);
    expect(stats.token).toBe(before + 2);
  });

  it("a grant signed with another key is refused, and the error carries no key material", async () => {
    const other = pair();
    const tokens = new DriveTokenProvider({ ...FAKE_SA, private_key: other.privateKey }, `${base}/token`);
    const err = await tokens.accessToken().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 400 \(invalid_grant\)/);
    expect((err as Error).message).not.toMatch(/PRIVATE KEY|fake-kid|ana-brain@/);
  });

  it("loads a service-account key file; refuses personal OAuth credentials and incomplete files without echoing content", () => {
    const dir = tmpDir("drv-");
    const good = path.join(dir, "sa.json");
    writeFileSync(good, JSON.stringify({ type: "service_account", project_id: "fake-project", ...FAKE_SA, client_id: "123" }));
    expect(loadServiceAccountKey(good)).toEqual(FAKE_SA);
    const personal = path.join(dir, "oauth.json");
    writeFileSync(personal, JSON.stringify({ client_id: "x", client_secret: "fake-secret-not-real", refresh_token: "fake-refresh-not-real" }));
    expect(() => loadServiceAccountKey(personal)).toThrow(/not a service-account key/);
    expect(() => loadServiceAccountKey(personal)).not.toThrow(/fake-secret|fake-refresh/);
    const partial = path.join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({ type: "service_account", client_email: "x@fake.example" }));
    expect(() => loadServiceAccountKey(partial)).toThrow(/missing private_key/);
    expect(() => loadServiceAccountKey(path.join(dir, "absent.json"))).toThrow(/cannot read/);
  });

  it("Drive is off without a root id, and fails closed when the root id is set but the key file is missing", () => {
    const absent = path.join(tmpDir("drv-"), "absent.json");
    expect(driveFromConfig({ driveRootId: undefined, driveSaKeyFile: absent })).toBeUndefined();
    expect(() => driveFromConfig({ driveRootId: ROOT, driveSaKeyFile: absent })).toThrow(/service-account key/);
    expect(() => requireDrive({ driveRootId: undefined, driveSaKeyFile: absent })).toThrow(/ANA_DRIVE_ROOT_ID is not set/);
  });

  it("config takes the key file from ANA_DRIVE_SA_KEY_FILE and refuses the retired personal-token setting", () => {
    expect(loadConfig({ BRAIN_VAULT_DIR: "/srv/v" }).driveSaKeyFile).toBe("/etc/ana-brain/drive-sa.json");
    expect(loadConfig({ BRAIN_VAULT_DIR: "/srv/v", ANA_DRIVE_SA_KEY_FILE: "/etc/x/sa.json" }).driveSaKeyFile).toBe("/etc/x/sa.json");
    expect(() => loadConfig({ BRAIN_VAULT_DIR: "/srv/v", ANA_DRIVE_OAUTH_FILE: "/etc/ana-brain/drive-oauth.json" })).toThrow(/ANA_DRIVE_OAUTH_FILE/);
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

describe("drive-register from the CLI", () => {
  it("is recorded as an operator's manual registration, not as an MCP write; `serve` stays MCP", async () => {
    const root = syntheticVault();
    const { drive } = newDrive();
    const fm = await registerDriveSource(cliVault(root, "drive-register"), drive, "ben", { fileId: "docfile001", id: "src-drive-cli", title: "CLI" });
    expect(fm.provenance).toMatchObject({ method: "manual", actor: "ben" });
    const served = await registerDriveSource(cliVault(root, "serve"), drive, "ana", { fileId: "vttfile001", id: "src-drive-served", title: "Served" });
    expect(served.provenance).toMatchObject({ method: "mcp", actor: "ana" });
    const lines = readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string>);
    expect(lines.map((l) => [l.target, l.method])).toEqual([["src-drive-cli", "manual"], ["src-drive-served", "mcp"]]);
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

describe("drive is read-only on the wire", () => {
  it("no request in this file reached Drive with a method other than GET", () => {
    expect(stats.meta + stats.lists).toBeGreaterThan(0);
    expect(stats.nonGet).toBe(0);
  });
});
