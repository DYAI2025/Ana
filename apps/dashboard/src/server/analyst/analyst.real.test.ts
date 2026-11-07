// @vitest-environment node
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostTags } from "@/features/world/postTags";
import { digestText, type PulseDigest } from "@/features/world/pulse";
import { createBrainMcp, type BrainMcp } from "@/server/brain/mcpClient";
import { fetchProjection, readBrainConfig } from "@/server/brain/projection";
import { readSocialConfig } from "@/server/social/config";
import { createSnapshotService } from "@/server/social/service";
import { createBrainWriter, SOURCE_ID, weekNoteId } from "@/server/world/brainWriter";
import { createWorldService } from "@/server/world/service";
import { createBrainReader, retrieveBrainContext, SCORE_FLOOR, verifyBeforeOutput, type BrainReader } from "./brainContext";

/**
 * The bounded Brain read on real parts, synthetic data only: the dashboard's real writer fills a disposable vault, the
 * real Brain service, real Qdrant and real BGE-M3 in Ollama answer. Not part of CI (it needs those binaries and the
 * model). The parser and the release rule are the production ones. Run:
 *
 *   REAL_BRAIN_DIR=<empty dir> QDRANT_BIN=<qdrant 1.19.2> OLLAMA_URL=http://127.0.0.1:11434 \
 *     npx vitest run src/server/analyst/analyst.real.test.ts
 *
 * REAL_ANALYST_PARAPHRASE replaces the paraphrase, so someone who did not write this test can pick one.
 * apps/brain must be built (npm run build). Without REAL_BRAIN_DIR this suite is reported as skipped, never as passed.
 *
 * "Fresh process": the retriever keeps nothing between requests, so the Brain is restarted and a new reader used; the
 * whole run is a new process against a vault it filled itself. It says nothing about the production vault.
 */
const DIR = process.env.REAL_BRAIN_DIR;
const QDRANT_BIN = process.env.QDRANT_BIN ?? "";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const CLI = path.resolve(process.cwd(), "../brain/dist/cli.js");
const WORKER = path.resolve(process.cwd(), "e2e/fake-social/server.mjs");
const PORTS = { brain: 18791, qdrant: 16334, worker: 13199 };
const QDRANT_KEY = "real-test-qdrant-key-0000000000";
const WORKER_KEY = "real-test-worker-key-00000000000000000";
const PARAPHRASE = process.env.REAL_ANALYST_PARAPHRASE ?? "Welche Motive kommen beim Publikum derzeit am stärksten an?";
const OFF_TOPIC = ["Wie backe ich ein Sauerteigbrot ohne Hefe?", "Welche Steuerklasse gilt nach der Hochzeit?", "How do I replace a bicycle chain?", "Was kostet ein Flug nach Nairobi im März?", "Wie schreibe ich eine gute Rechnung für Kunden?", "Which camera lens is best for portraits?", "Wie lange hält ein Reisepass?", "Wann ist die nächste Bundestagswahl?"];
/** other wordings of the same need, only to measure how far the floor sits from what should match; not asserted one by one */
const ON_TOPIC = ["Welche Motive kommen beim Publikum derzeit am stärksten an?", "Was läuft gerade am besten?", "Wie schneiden die Strandvideos gerade ab?", "Which kind of content performs best right now?", "Was wird gerade am häufigsten geteilt und gespeichert?", "Zeig mir die wöchentliche Lage der Instagram-Kennzahlen."];
const NOW = Date.parse("2026-03-05T09:00:00Z");
const NOTE = weekNoteId("2026-03-05");

/** content words: three letters or more, without stop words, in lower case */
const words = (text: string) => new Set((text.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((w) => !["was", "wie", "der", "die", "das", "den", "dem", "des", "und", "ist", "ein", "für", "von", "mit", "the", "and", "for", "welche", "beim", "derzeit", "eine", "nicht", "oder", "auch", "nach", "aber", "wird", "aller", "sagt", "nur"].includes(w)));

describe.skipIf(!DIR)("World analyst -> real Brain, Qdrant 1.19.2, BGE-M3", () => {
  const root = DIR ?? "";
  const vault = path.join(root, "vault");
  const state = path.join(root, "state");
  const evidence: Record<string, unknown> = { score_floor: SCORE_FLOOR, paraphrase: PARAPHRASE, off_topic: OFF_TOPIC };
  const procs = new Map<string, ChildProcess>();
  const brainEnv = { ...process.env, BRAIN_VAULT_DIR: vault, BRAIN_STATE_DIR: state, OLLAMA_URL, QDRANT_URL: `http://127.0.0.1:${PORTS.qdrant}`, QDRANT_API_KEY: QDRANT_KEY, HOST: "127.0.0.1", PORT: String(PORTS.brain) };
  const cli = (...args: string[]) => execFileSync("node", [CLI, ...args], { env: brainEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const mcpUrl = `http://127.0.0.1:${PORTS.brain}/mcp`;
  const commits = () => Number(execFileSync("git", ["-C", vault, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim());
  let key = "";
  let token = "";
  let mcp: BrainMcp;
  const toolCalls: string[] = [];
  /** the production reader over a fetch that records which tools it reaches */
  const recording: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/mcp")) toolCalls.push((JSON.parse(String(init?.body)) as { params: { name: string } }).params.name);
    return fetch(input, init);
  };
  const reader = (): BrainReader => createBrainReader({ url: mcpUrl, key }, recording);
  const retrieve = (question: string, sources: ReadonlySet<string> = new Set([SOURCE_ID]), r: BrainReader = reader()) => {
    let n = 0;
    return retrieveBrainContext(question, { reader: r, sources, projection: () => fetchProjection(readBrainConfig({ BRAIN_API_URL: `http://127.0.0.1:${PORTS.brain}`, BRAIN_API_TOKEN: token, BRAIN_TIMEOUT_MS: "20000" })), ref: () => `b_${++n}` });
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
  const startBrain = async () => {
    procs.set("brain", spawn("node", [CLI, "serve"], { env: brainEnv, stdio: "ignore" }));
    await waitFor(`http://127.0.0.1:${PORTS.brain}/healthz`);
  };

  beforeAll(async () => {
    for (const d of [vault, state, path.join(root, "qdrant")]) mkdirSync(d, { recursive: true });
    if (readdirSync(vault).length > 0) throw new Error("REAL_BRAIN_DIR must start empty");
    execFileSync("git", ["-C", vault, "init", "-q"]);
    writeFileSync(path.join(vault, "README.md"), "synthetic test vault\n");
    execFileSync("git", ["-C", vault, "add", "-A"]);
    execFileSync("git", ["-C", vault, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "init"]);
    key = cli("issue-key", "agent:lumen").trim();
    token = cli("issue-dashboard-token").trim().split("\n").pop() as string;
    mcp = createBrainMcp({ url: mcpUrl, key });
    procs.set("worker", spawn("node", [WORKER], { env: { ...process.env, FAKE_SOCIAL_PORT: String(PORTS.worker), FAKE_SOCIAL_KEY: WORKER_KEY }, stdio: "ignore" }));
    await waitFor(`http://127.0.0.1:${PORTS.worker}/__fake/health`);
    const qdrantConfig = path.join(root, "qdrant.yaml");
    writeFileSync(qdrantConfig, `storage:\n  storage_path: ${path.join(root, "qdrant")}\n  snapshots_path: ${path.join(root, "qdrant-snapshots")}\nservice:\n  host: 127.0.0.1\n  http_port: ${PORTS.qdrant}\n  enable_cors: false\ntelemetry_disabled: true\n`);
    procs.set("qdrant", spawn(QDRANT_BIN, ["--config-path", qdrantConfig], { cwd: root, env: { ...process.env, QDRANT__SERVICE__API_KEY: QDRANT_KEY }, stdio: "ignore" }));
    await waitFor(`http://127.0.0.1:${PORTS.qdrant}/collections`, { "api-key": QDRANT_KEY });
    await startBrain();

    // the dashboard's real writer fills the week note from a world read over the fake worker
    const config = readSocialConfig({ SOCIAL_IG_WORKER_URL: `http://127.0.0.1:${PORTS.worker}`, SOCIAL_IG_INTERNAL_READ_KEY: WORKER_KEY });
    if (!config) throw new Error("worker config");
    const social = createSnapshotService(config);
    const read = await social.read();
    if (!read.ok) throw new Error("fake worker read failed");
    const tags: Record<string, PostTags> = Object.fromEntries(read.snapshot.posts.map((p, i) => [p.media_id, { theme: i % 2 ? "city" : "beach", ana: "face", shot: "action", hook: "place", cta: "none", mood: "calm", country: null, brand: false, confidence: 0.9, model: "fixed", at: "2026-03-01T00:00:00Z" } as unknown as PostTags]));
    const brain = createBrainWriter({ url: mcpUrl, key }, path.join(state, "dashboard-brain-sync.json"), fetch, () => NOW);
    const world = createWorldService({ social, socialConfig: null, readWork: null, workKeys: [], env: {}, tagger: { schedule() {}, current: () => tags, ready: () => true } as never, brain, now: () => NOW });
    await world.read();
    await brain.idle();
    expect(brain.status()).toMatchObject({ state: "on", note: NOTE });

    // a later day of the same note, in the writer's own call and format, with everything the release must keep back
    const digest = { day: "2026-03-06", rising: [{ key: "BR", share: 0.2, delta: 7.77 }], falling: [], leading: [{ key: "DE", share: 0.41, delta: 6.66 }], fresh: [], erMedian: 0.031, ssrMedian: 0.012, themesEr: [{ value: "beach", n: 5, median: 0.052 }], themesSsr: [{ value: "city", n: 4, median: 0.0345 }], topAge: { band: "25-34", share: 0.47 }, gender: { f: 0.61, m: 0.39, u: 0 }, brand: { n: 1, er: 0.09, otherN: 9, otherEr: 0.03 }, reach28: 44444, followers: 987654, tagged: 12 } as unknown as PulseDigest;
    await mcp.call("brain_append_observation", { id: NOTE, text: digestText(digest), status: "DERIVED" });

    // other knowledge, so the hit has to be earned
    for (const [id, title, body] of [
      ["kn-test-capcut", "Schnitt in CapCut", "Wie man im Workshop einen Hook schneidet und Untertitel in CapCut setzt."],
      ["kn-test-preis", "Preisgestaltung für Vorlagen", "Überlegungen zu Preisstufen für digitale Vorlagen und Checklisten im Shop."],
      ["kn-test-tiktok", "TikTok-Veröffentlichungszeiten", "Wann Clips auf TikTok am Abend veröffentlicht werden sollten."],
      ["kn-test-reise", "Packliste für Kenia", "Was in den Rucksack gehört: Adapter, Malariaprophylaxe, leichte Kleidung."],
    ] as const) {
      await mcp.call("brain_create_note", { id, title, type: "concept", status: "CANDIDATE", body });
    }
    evidence.index = JSON.parse(cli("index").trim().split("\n").pop() as string);
  }, 240_000);

  afterAll(async () => {
    for (const name of [...procs.keys()]) await stop(name);
    if (DIR && existsSync(DIR)) writeFileSync(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  });

  it("after an index run nothing counts as unindexed, the source note included", async () => {
    const result = await fetchProjection(readBrainConfig({ BRAIN_API_URL: `http://127.0.0.1:${PORTS.brain}`, BRAIN_API_TOKEN: token, BRAIN_TIMEOUT_MS: "20000" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      evidence.unindexed = result.projection.unindexed;
      expect(result.projection.unindexed).toBe(0);
    }
  });

  it("the paraphrase shares no content word with the note", async () => {
    const note = await reader().get(NOTE);
    // the Brain embeds the title with every chunk, so a word shared with the title counts too
    const title = (note.frontmatter as { title?: unknown }).title;
    expect(typeof title).toBe("string");
    const indexed = words(`${String(title)}\n${note.body}`);
    const shared = [...words(PARAPHRASE)].filter((w) => indexed.has(w));
    evidence.shared_content_words = shared;
    expect(shared).toEqual([]);
  });

  it("a paraphrase finds the right note first, with the right source, and only allowed segments", async () => {
    const hits = await reader().search(PARAPHRASE, 25);
    evidence.paraphrase_hits = hits.map((h) => ({ id: h.id, score: h.score }));
    const context = await retrieve(PARAPHRASE);
    evidence.paraphrase_context = { state: context.state, reason: context.reason, withheld: context.withheld, items: context.items.map((i) => ({ note: i.note_id, score: i.score, sources: i.source_ids, text: i.text })) };
    expect(hits[0]?.id).toBe(NOTE);
    expect(context.state).toBe("ok");
    expect(context.items[0]).toMatchObject({ note_id: NOTE, source_ids: [SOURCE_ID], status: "DERIVED", origin: "agent:lumen" });
    const text = context.items.map((i) => i.text).join("\n");
    expect(text).toContain("Themen nach ER (n ≥ 3): beach 5.2 % (n 5).");
    for (const canary of ["BR ", "DE ", "25-34", "61 %", "987654", "44444", "Follower", "Marken-Posts: 1 ", "Steigend", "Wer (7 T)"]) expect(text, canary).not.toContain(canary);
  });

  it.each(OFF_TOPIC)("off-topic releases no note: %s", async (question) => {
    const hits = await reader().search(question, 25);
    const context = await retrieve(question);
    (evidence.off_topic_scores ??= {} as Record<string, unknown>);
    (evidence.off_topic_scores as Record<string, unknown>)[question] = hits.slice(0, 5).map((h) => ({ id: h.id, score: h.score }));
    expect(context.items).toEqual([]);
  });

  it("measures the distance of the floor: every off-topic question below it, on-topic scores recorded", async () => {
    const r = reader();
    const top = async (q: string) => (await r.search(q, 25)).find((h) => h.id === NOTE)?.score ?? 0;
    const on = await Promise.all(ON_TOPIC.map(async (q) => ({ q, score: await top(q) })));
    const off = await Promise.all(OFF_TOPIC.map(async (q) => ({ q, score: await top(q) })));
    evidence.calibration = { floor: SCORE_FLOOR, on, off, max_off: Math.max(...off.map((x) => x.score)), min_on: Math.min(...on.map((x) => x.score)) };
    for (const x of off) expect(x.score, x.q).toBeLessThan(SCORE_FLOOR);
  });

  it("a list for another provider releases nothing, and the Brain is not asked", async () => {
    toolCalls.length = 0;
    const context = await retrieve(PARAPHRASE, new Set());
    expect(context).toMatchObject({ state: "blocked", reason: "no_release", items: [] });
    expect(toolCalls).toEqual([]);
  });

  it("after a Brain restart and with a new reader the same note comes back, and verification holds", async () => {
    await stop("brain");
    await startBrain();
    const fresh = reader();
    const context = await retrieve(PARAPHRASE, new Set([SOURCE_ID]), fresh);
    expect(context.items[0]?.note_id).toBe(NOTE);
    expect(await verifyBeforeOutput(createBrainReader({ url: mcpUrl, key }), context.items, new Set([SOURCE_ID]))).toMatchObject({ dropped: 0, items: [{ note_id: NOTE }] });
  });

  it("a new block appended meanwhile fails the check before output", async () => {
    const before = await retrieve(PARAPHRASE);
    await mcp.call("brain_append_observation", { id: NOTE, text: "Median aller Posts: ER 9.9 %, Save+Share 9.90 %.", status: "DERIVED" });
    expect(await verifyBeforeOutput(reader(), before.items, new Set([SOURCE_ID]))).toMatchObject({ items: [], dropped: before.items.length });
  });

  it("reading writes nothing: only search and get reach the Brain and the vault history stands", async () => {
    toolCalls.length = 0;
    const before = commits();
    await retrieve(PARAPHRASE);
    await retrieve(OFF_TOPIC[0] as string);
    expect(new Set(toolCalls)).toEqual(new Set(["brain_search", "brain_get"]));
    expect(commits()).toBe(before);
  });
});
