// @vitest-environment node
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostTags } from "@/features/world/postTags";
import type { WorldInsightSync } from "@/features/world/types";
import { readSocialConfig } from "@/server/social/config";
import { createSnapshotService } from "@/server/social/service";
import { createBrainWriter } from "@/server/world/brainWriter";
import { createWorldService } from "@/server/world/service";
import { createBrainMcp, type BrainMcp } from "./mcpClient";
import { retrieveContext } from "./retrieval";

/**
 * The whole path on real parts, synthetic data only: the worker client against the fake worker (with its key), the real
 * Brain service, real Qdrant, real BGE-M3 in Ollama. Not part of CI (it needs those binaries and the model). Run:
 *
 *   REAL_BRAIN_DIR=<empty dir> QDRANT_BIN=<qdrant 1.19.2> OLLAMA_URL=http://127.0.0.1:11434 \
 *     npx vitest run src/server/brain/insight.real.test.ts
 *
 * apps/brain must be built (npm run build). Without REAL_BRAIN_DIR this suite is reported as skipped, never as passed.
 */
const DIR = process.env.REAL_BRAIN_DIR;
const QDRANT_BIN = process.env.QDRANT_BIN ?? "";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const CLI = path.resolve(process.cwd(), "../brain/dist/cli.js");
const WORKER = path.resolve(process.cwd(), "e2e/fake-social/server.mjs");
const PORTS = { brain: 18790, qdrant: 16333, worker: 13198 };
const QDRANT_KEY = "real-test-qdrant-key-0000000000";
const WORKER_KEY = "real-test-worker-key-00000000000000000";
const NOTE = "kn-ig-resonanz-reel-beach";
const QUERY = "Welche Strandvideos werden besonders oft gespeichert und weitergeschickt?";

describe.skipIf(!DIR)("Instagram -> Brain -> Qdrant/BGE-M3 -> retrieval on real parts", () => {
  const root = DIR ?? "";
  const vault = path.join(root, "vault");
  const state = path.join(root, "state");
  const evidence: Record<string, unknown> = {};
  const procs = new Map<string, ChildProcess>();
  const brainEnv = { ...process.env, BRAIN_VAULT_DIR: vault, BRAIN_STATE_DIR: state, OLLAMA_URL, QDRANT_URL: `http://127.0.0.1:${PORTS.qdrant}`, QDRANT_API_KEY: QDRANT_KEY, HOST: "127.0.0.1", PORT: String(PORTS.brain) };
  const cli = (...args: string[]) => execFileSync("node", [CLI, ...args], { env: brainEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const index = (...flags: string[]) => JSON.parse(cli("index", ...flags).trim().split("\n").pop() as string) as { embedded: number; skipped: number; upserted_points: number };
  const mcpUrl = `http://127.0.0.1:${PORTS.brain}/mcp`;
  let key = "";
  let mcp: BrainMcp;
  let tags: Record<string, PostTags> = {};

  const start = (name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv) => {
    const p = spawn(cmd, args, { env, stdio: "ignore" });
    procs.set(name, p);
  };
  const stop = async (name: string) => {
    const p = procs.get(name);
    if (!p || p.exitCode !== null) return;
    await new Promise((resolve) => {
      p.once("exit", resolve);
      p.kill("SIGTERM");
    });
  };
  const waitFor = async (url: string, headers: Record<string, string> = {}) => {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(url, { headers })).ok) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`no answer from ${url}`);
  };
  const startQdrant = async () => {
    // the same shape as deploy/ana-brain/qdrant.yaml: loopback, REST only, a key
    const config = path.join(root, "qdrant.yaml");
    writeFileSync(config, `storage:\n  storage_path: ${path.join(root, "qdrant")}\n  snapshots_path: ${path.join(root, "qdrant-snapshots")}\nservice:\n  host: 127.0.0.1\n  http_port: ${PORTS.qdrant}\n  grpc_port: null\ntelemetry_disabled: true\n`);
    const p = spawn(QDRANT_BIN, ["--config-path", config], { cwd: root, env: { ...process.env, QDRANT__SERVICE__API_KEY: QDRANT_KEY }, stdio: "ignore" });
    procs.set("qdrant", p);
    await waitFor(`http://127.0.0.1:${PORTS.qdrant}/collections`, { "api-key": QDRANT_KEY });
  };
  const startBrain = async () => {
    start("brain", "node", [CLI, "serve"], brainEnv);
    await waitFor(`http://127.0.0.1:${PORTS.brain}/healthz`);
  };
  const noteFile = () => path.join(vault, "knowledge", `${NOTE}.md`);
  const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const commits = () => Number(execFileSync("git", ["-C", vault, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim());
  const social = () => {
    const config = readSocialConfig({ SOCIAL_IG_WORKER_URL: `http://127.0.0.1:${PORTS.worker}`, SOCIAL_IG_INTERNAL_READ_KEY: WORKER_KEY });
    if (!config) throw new Error("worker config");
    return createSnapshotService(config);
  };
  /** one world read as the server does it; the model's reading of the posts is replaced by a fixed one */
  const worldRead = async (version = 1, nowMs = Date.now()) => {
    const brain = createBrainWriter({ url: mcpUrl, key }, path.join(state, "dashboard-brain-sync.json"), fetch, () => nowMs, { derivationVersion: version });
    const world = createWorldService({ social: social(), socialConfig: null, readWork: null, workKeys: [], env: {}, tagger: { schedule() {}, current: () => tags, ready: () => true } as never, brain });
    const payload = await world.read();
    await brain.idle();
    return { payload, status: brain.status().insights as WorldInsightSync, digest: brain.status() };
  };
  const allFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === ".git" ? [] : e.isDirectory() ? allFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  beforeAll(async () => {
    for (const d of [vault, state, path.join(root, "qdrant")]) mkdirSync(d, { recursive: true });
    if (readdirSync(vault).length > 0) throw new Error("REAL_BRAIN_DIR must start empty");
    execFileSync("git", ["-C", vault, "init", "-q"]);
    writeFileSync(path.join(vault, "README.md"), "synthetic test vault\n");
    execFileSync("git", ["-C", vault, "add", "-A"]);
    execFileSync("git", ["-C", vault, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "init"]);
    key = cli("issue-key", "agent:lumen").trim();
    mcp = createBrainMcp({ url: mcpUrl, key });
    start("worker", "node", [WORKER], { ...process.env, FAKE_SOCIAL_PORT: String(PORTS.worker), FAKE_SOCIAL_KEY: WORKER_KEY });
    await waitFor(`http://127.0.0.1:${PORTS.worker}/__fake/health`);
    await startQdrant();
    await startBrain();
    // the fixed reading: half of the mature reels are about the beach, the others about the city
    const read = await social().read();
    if (!read.ok) throw new Error("fake worker read failed");
    const reels = read.snapshot.posts.filter((p) => p.format === "reel");
    tags = Object.fromEntries(reels.map((p, i) => [p.media_id, { theme: i % 2 ? "city" : "beach", ana: "face", shot: "action", hook: "place", cta: "none", mood: "calm", country: null, brand: false, confidence: 0.9 } as PostTags]));
    evidence.reels = reels.length;
    // other knowledge, so the semantic hit has to be earned
    await mcp.call("brain_register_source", { id: "src-test-other", title: "Testquelle", description: "synthetisch", source: { kind: "url", locator: "https://example.invalid/x", original_title: "x", access: "internal", data_class: "G1" } });
    for (const [id, title, body] of [
      ["kn-test-capcut", "Schnitt in CapCut", "Wie man im Workshop einen Hook schneidet und Untertitel in CapCut setzt."],
      ["kn-test-preis", "Preisgestaltung für Vorlagen", "Überlegungen zu Preisstufen für digitale Vorlagen und Checklisten im Shop."],
      ["kn-test-tiktok", "TikTok-Veröffentlichungszeiten", "Wann Clips auf TikTok am Abend veröffentlicht werden sollten."],
    ] as const) {
      await mcp.call("brain_create_note", { id, title, type: "concept", status: "CANDIDATE", body });
    }
    evidence.first_index = index();
  }, 180_000);

  afterAll(async () => {
    for (const name of [...procs.keys()]) await stop(name);
    if (DIR && existsSync(DIR)) writeFileSync(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  });

  it("the Brain's interface refuses a caller without a valid key", async () => {
    const rpc = (headers: Record<string, string>) => fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect((await rpc({})).status).toBe(401);
    expect((await rpc({ authorization: "Bearer anab_wrong_wrong_wrong" })).status).toBe(401);
  });

  it("an authorized read of the worker becomes a valid Brain note, without a caption", async () => {
    const { payload, status, digest } = await worldRead();
    expect(payload.instagram.ok).toBe(true);
    expect(status).toMatchObject({ state: "on", reason: null });
    expect(payload.brain.insights).toMatchObject({ state: "on" });
    // the one daily writer wrote both: the digest's week note and the insight notes
    expect(digest).toMatchObject({ state: "on", reason: null });
    expect(readFileSync(path.join(vault, "knowledge", `${digest.note}.md`), "utf8")).toContain("Puls ");
    expect(existsSync(noteFile())).toBe(true);
    const text = readFileSync(noteFile(), "utf8");
    expect(text).toContain("status: DERIVED");
    expect(text).toContain("created_by: agent:lumen");
    expect(text).toMatch(/IG-INSIGHT tag=\d{4}-\d{2}-\d{2} v=1 status=(DERIVED|UNKNOWN)/);
    expect(text).toContain("src-instagram-insights");
    // the payload as written: post ids with their measured values (the open PO decision in docs/ana-knowledge)
    expect(text).toMatch(/instagram:media\/\S+ saves=\d+ count shares=\d+ count reach=\d+ accounts/);
    expect(text).toMatch(/instagram:media\/\S+ rate=\d+\.\d+ %/);
    evidence.payload = {
      post_refs_with_values: (text.match(/instagram:media\/\S+ saves=/g) ?? []).length,
      post_refs_with_rate: (text.match(/instagram:media\/\S+ rate=/g) ?? []).length,
      digest_post_ids: (readFileSync(path.join(vault, "knowledge", `${digest.note}.md`), "utf8").match(/instagram:media\//g) ?? []).length,
      block: /^- .*IG-INSIGHT.*$/m.exec(text)?.[0],
    };
    cli("validate"); // throws on a non-zero exit
    const captions = payload.instagram.ok ? payload.instagram.snapshot.posts.flatMap((p) => p.caption ?? []) : [];
    expect(captions.length).toBeGreaterThan(0);
    const everything = allFiles(vault).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const c of captions) expect(everything).not.toContain(c);
    evidence.note = { sha: sha(noteFile()), commits: commits(), captions_checked: captions.length };
  }, 60_000);

  it("before indexing the note is not found; the index step is real", async () => {
    const r = await retrieveContext(mcp, QUERY, 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results.map((x) => x.id)).not.toContain(NOTE);
    const ran = index();
    expect(ran.embedded).toBeGreaterThan(0);
    evidence.second_index = ran;
  }, 180_000);

  it("BGE-M3/Qdrant finds the note by paraphrase, with sources and status; another question finds something else", async () => {
    const r = await retrieveContext(mcp, QUERY, 5);
    if (!r.ok) throw new Error(r.reason);
    const top = r.results[0];
    evidence.ranking = r.results.map((x) => [x.id, x.score]);
    expect(top?.id).toBe(NOTE);
    expect(top?.status).toBe("DERIVED");
    expect(["DERIVED", "UNKNOWN"]).toContain(top?.epistemic);
    expect(top?.sources[0]).toEqual({ source: "src-instagram-insights", locator: "instagram:media-insights?format=reel&theme=beach" });
    expect(top?.current?.text).toContain("BEOBACHTUNG (SOURCE)");
    // the search itself does find foreign knowledge; the boundary keeps it out
    const raw = JSON.parse(await mcp.call("brain_search", { query: "Wie setze ich Untertitel beim Videoschnitt?", limit: 5 })) as { results: Array<{ id: string }> };
    expect(raw.results[0]?.id).toBe("kn-test-capcut");
    const other = await retrieveContext(mcp, "Wie setze ich Untertitel beim Videoschnitt?", 5);
    if (!other.ok) throw new Error(other.reason);
    expect(other.results.map((x) => x.id)).not.toContain("kn-test-capcut");
    expect(other.withheld).toBeGreaterThan(0);
    const collection = (await (await fetch(`http://127.0.0.1:${PORTS.qdrant}/collections/ana_brain_v1`, { headers: { "api-key": QDRANT_KEY } })).json()) as { result: { points_count: number; config: { params: { vectors: { size: number } } } } };
    expect(collection.result.config.params.vectors.size).toBe(1024);
    const indexState = JSON.parse(readFileSync(path.join(vault, ".ana", "index-state.json"), "utf8")) as Record<string, unknown>;
    evidence.index = { points: collection.result.points_count, size: 1024, state_keys: Object.keys(indexState).slice(0, 6), model: indexState.embed_model ?? indexState.model, digest: indexState.embed_digest ?? indexState.digest };
  }, 60_000);

  it("locked notes are found by the Brain and stay out of the context retrieval", async () => {
    const CANARY = "PRIVATE-CANARY-7f3a";
    const ana = createBrainMcp({ url: mcpUrl, key: cli("issue-key", "ana").trim() });
    const question = `Vertraulich ${CANARY}: Welche Strandvideos werden besonders oft gespeichert und weitergeschickt?`;
    // the same key as the dashboard's, so the key alone cannot be what keeps them out
    await mcp.call("brain_register_source", { id: "src-test-privat", title: "Privat", description: "synthetisch", source: { kind: "url", locator: "https://example.invalid/privat", original_title: "privat", access: "restricted", data_class: "G3" } });
    await mcp.call("brain_create_note", { id: "kn-test-privat", title: `Strandvideos ${CANARY}`, type: "concept", status: "CANDIDATE", body: question, source_refs: [{ source: "src-test-privat", locator: "privat" }] });
    // a person's note citing the dashboard's own source
    await ana.call("brain_create_note", { id: "kn-test-person", title: `Strandvideos von Ana ${CANARY}`, type: "concept", status: "CANDIDATE", body: question, source_refs: [{ source: "src-instagram-insights", locator: "ana" }] });
    // a person's line appended to a note the dashboard wrote
    await ana.call("brain_append_observation", { id: "kn-ig-resonanz-reel-city", text: `Stadtvideos ${CANARY}`, status: "CANDIDATE" });
    index();
    const raw = JSON.parse(await mcp.call("brain_search", { query: question, limit: 25 })) as { results: Array<{ id: string }> };
    for (const id of ["kn-test-privat", "kn-test-person", "kn-ig-resonanz-reel-city"]) expect(raw.results.map((x) => x.id)).toContain(id);
    const r = await retrieveContext(mcp, question, 10);
    if (!r.ok) throw new Error(r.reason);
    const out = JSON.stringify(r);
    expect(out).not.toContain(CANARY);
    for (const id of ["kn-test-privat", "kn-test-person", "kn-ig-resonanz-reel-city", "kn-test-capcut"]) expect(out).not.toContain(id);
    expect(r.results[0]?.id).toBe(NOTE);
    expect(r.withheld).toBeGreaterThanOrEqual(3);
    evidence.boundary = { released: r.results.map((x) => x.id), withheld: r.withheld };
  }, 120_000);

  it("reprocessing adds nothing: same writer, a new writer, the same day", async () => {
    const before = { sha: sha(noteFile()), commits: commits() };
    await worldRead();
    await worldRead();
    expect({ sha: sha(noteFile()), commits: commits() }).toEqual(before);
    expect(readFileSync(noteFile(), "utf8").match(/IG-INSIGHT/g)).toHaveLength(1);
    expect(index().embedded).toBe(0);
  }, 60_000);

  it("a correction keeps the history, in the note and in git", async () => {
    const before = readFileSync(noteFile(), "utf8");
    const oldBlock = /\^(obs-[a-z0-9-]+)/.exec(before)?.[1] as string;
    const count = commits();
    await worldRead(2);
    const after = readFileSync(noteFile(), "utf8");
    expect(after).toContain(`^${oldBlock}`);
    expect(after).toContain(`corrects ^${oldBlock}`);
    expect(after).toMatch(/IG-INSIGHT tag=\S+ v=1/);
    expect(after).toMatch(/IG-INSIGHT tag=\S+ v=2/);
    expect(commits()).toBeGreaterThan(count);
    // the note's own git history holds both versions
    const history = execFileSync("git", ["-C", vault, "log", "--format=%H %s", "--", `knowledge/${NOTE}.md`], { encoding: "utf8" }).trim().split("\n");
    expect(history[0]).toContain(`append_correction ${NOTE}`);
    const previous = (history[1] as string).split(" ")[0] as string;
    expect(execFileSync("git", ["-C", vault, "show", `${previous}:knowledge/${NOTE}.md`], { encoding: "utf8" })).toBe(before);
    cli("validate");
    index();
    const r = await retrieveContext(mcp, QUERY, 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ id: NOTE, history: 2, corrected: [oldBlock] });
    expect(r.results[0]?.current?.text).toContain("v=2");
  }, 180_000);

  it("everything survives a restart of the Brain and of Qdrant", async () => {
    const before = sha(noteFile());
    await stop("brain");
    await stop("qdrant");
    await startQdrant();
    await startBrain();
    expect(sha(noteFile())).toBe(before);
    const r = await retrieveContext(mcp, QUERY, 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ id: NOTE, history: 2 });
    expect(index().embedded).toBe(0);
    cli("validate");
  }, 120_000);

  it("the index is rebuilt from the Markdown alone after losing the collection", async () => {
    const gone = await fetch(`http://127.0.0.1:${PORTS.qdrant}/collections/ana_brain_v1`, { method: "DELETE", headers: { "api-key": QDRANT_KEY } });
    expect(gone.ok).toBe(true);
    expect(index().embedded).toBeGreaterThan(0);
    const r = await retrieveContext(mcp, QUERY, 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]?.id).toBe(NOTE);
  }, 180_000);

  it("a Brain outage is an honest failure in retrieval and in the writer", async () => {
    await stop("brain");
    await expect(retrieveContext(mcp, QUERY, 5)).resolves.toEqual({ ok: false, reason: "brain-unreachable" });
    // a later day, so the writer does try
    const { status, payload } = await worldRead(3, Date.now() + 86_400_000);
    expect(status.state).toBe("error");
    expect(payload.instagram.ok).toBe(true);
    expect(JSON.stringify(status)).not.toContain(key);
    await startBrain();
  }, 60_000);
});
