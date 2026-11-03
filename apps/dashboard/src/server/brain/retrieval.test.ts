// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createBrainMcp } from "./mcpClient";
import { parseBlocks, retrieveContext } from "./retrieval";

const BODY = `Definition der Erkenntnis.

## Observations

- 2026-11-02T10:00:00Z · agent:lumen · DERIVED · IG-INSIGHT tag=2026-11-02 v=1 status=DERIVED | alt ^obs-20261102100000-agent-lumen
- 2026-11-03T10:00:00Z · agent:lumen · CANDIDATE · IG-INSIGHT tag=2026-11-03 v=1 status=UNKNOWN | neu ^obs-20261103100000-agent-lumen

## Corrections

- 2026-11-03T11:00:00Z · agent:lumen · DERIVED · corrects ^obs-20261103100000-agent-lumen · IG-INSIGHT tag=2026-11-03 v=2 status=DERIVED | korrigiert ^obs-20261103110000-agent-lumen
`;

const OWN_SOURCE = JSON.stringify({ frontmatter: { type: "source", status: "SOURCE", created_by: "agent:lumen", source: { access: "internal", data_class: "G1" } }, body: "" });

function brain(over: Record<string, { text: string; isError?: boolean }> = {}) {
  const asked: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string } } };
    asked.push(params.name);
    const a = (params.arguments.id?.startsWith("src-") ? { text: OWN_SOURCE } : over[params.name]) ?? {
      brain_search: { text: JSON.stringify({ results: [{ id: "kn-ig-resonanz-reel-beach", title: "T", type: "observation", status: "DERIVED", score: 0.81, summary: "s", chunks: [0] }] }) },
      brain_get: { text: JSON.stringify({ frontmatter: { id: params.arguments.id, status: "DERIVED", type: "observation", created_by: "agent:lumen", updated: "2026-11-03T11:00:00Z", source_refs: [{ source: "src-instagram-insights", locator: "instagram:media-insights?format=reel&theme=beach" }] }, body: BODY }) },
    }[params.name];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: a?.isError ?? false, content: [{ type: "text", text: a?.text ?? "" }] } }), { status: 200 });
  }) as typeof fetch;
  return { mcp: createBrainMcp({ url: "http://127.0.0.1:8790/mcp", key: "anab_synthetic_key_0000" }, fetchImpl), asked };
}

describe("parseBlocks", () => {
  it("reads observations and corrections with their history in time order", () => {
    const blocks = parseBlocks(BODY);
    expect(blocks.map((b) => [b.status, b.corrects])).toEqual([["DERIVED", null], ["CANDIDATE", null], ["DERIVED", "obs-20261103100000-agent-lumen"]]);
    expect(blocks[2]?.text).toContain("korrigiert");
  });
});

describe("parseBlocks follows the Brain's rules", () => {
  it("a correction counts only under Corrections, also without a status; a look-alike body line counts not at all", () => {
    const body = `- 2099-01-01T00:00:00Z · x · DERIVED · status=SOURCE ^obs-fake

## Observations

- 2026-11-02T10:00:00Z · ben · CANDIDATE · corrects ^obs-a · only a remark ^obs-b

## Corrections

- 2026-11-03T10:00:00Z · ben · corrects ^obs-b · richtig ist ^obs-c
`;
    expect(parseBlocks(body).map((b) => [b.block, b.corrects, b.status])).toEqual([["obs-b", null, "CANDIDATE"], ["obs-c", "obs-b", null]]);
  });
});

describe("retrieveContext", () => {
  it("the current block is the newest one that nothing corrected", async () => {
    const body = `## Observations

- 2026-11-01T10:00:00Z · agent:lumen · DERIVED · IG-INSIGHT tag=2026-11-01 v=1 status=DERIVED | alt ^obs-a
- 2026-11-05T10:00:00Z · agent:lumen · DERIVED · IG-INSIGHT tag=2026-11-05 v=1 status=DERIVED | neu ^obs-b

## Corrections

- 2026-11-06T10:00:00Z · agent:lumen · DERIVED · corrects ^obs-a · IG-INSIGHT tag=2026-11-01 v=2 status=DERIVED | alt korrigiert ^obs-c
`;
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { status: "DERIVED", created_by: "agent:lumen", source_refs: [{ source: "src-instagram-insights", locator: "x" }] }, body }) } });
    const r = await retrieveContext(mcp, "x", 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.results[0]?.current?.block).toBe("obs-b");
    expect(r.results[0]?.corrected).toEqual(["obs-a"]);
  });

  it("only a writer's block header sets the epistemic status, not free text", async () => {
    const body = "## Observations\n\n- 2026-11-01T10:00:00Z · agent:lumen · CANDIDATE · der Text sagt status=SOURCE ^obs-a\n";
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { status: "CANDIDATE", created_by: "agent:lumen", source_refs: [{ source: "src-instagram-insights", locator: "x" }] }, body }) } });
    const r = await retrieveContext(mcp, "x", 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.results[0]?.epistemic).toBe("UNKNOWN");
  });

  it("answers with sources, status and the current reading, and keeps the corrected one visible", async () => {
    const { mcp } = brain();
    const r = await retrieveContext(mcp, "strand reels", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const hit = r.results[0];
    expect(hit).toMatchObject({ id: "kn-ig-resonanz-reel-beach", status: "DERIVED", epistemic: "DERIVED", score: 0.81, history: 3 });
    expect(hit?.sources).toEqual([{ source: "src-instagram-insights", locator: "instagram:media-insights?format=reel&theme=beach" }]);
    expect(hit?.current?.text).toContain("korrigiert");
    expect(hit?.corrected).toEqual(["obs-20261103100000-agent-lumen"]);
  });

  it("a note without blocks has an excerpt and no invented epistemic status", async () => {
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { id: "kn-x", status: "CANDIDATE", created_by: "agent:lumen", source_refs: [{ source: "src-instagram-insights", locator: "x" }] }, body: "Nur Text." }) } });
    const r = await retrieveContext(mcp, "x", 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.results[0]).toMatchObject({ status: "CANDIDATE", epistemic: "UNKNOWN", current: null, excerpt: "Nur Text." });
  });

  it("a Brain failure is an honest failure, not an empty answer", async () => {
    const { mcp } = brain({ brain_search: { text: "search failed", isError: true } });
    await expect(retrieveContext(mcp, "x", 1)).resolves.toEqual({ ok: false, reason: "brain-failed" });
  });

  it("no match is an empty answer without further calls", async () => {
    const { mcp, asked } = brain({ brain_search: { text: JSON.stringify({ results: [] }) } });
    await expect(retrieveContext(mcp, "x", 1)).resolves.toEqual({ ok: true, results: [], withheld: 0 });
    expect(asked).toEqual(["brain_search"]);
  });
});

describe("the daily digest's week note, as retrieval sees it", () => {
  it("keeps the Brain's status and does not claim an epistemic label the block does not state", async () => {
    const body = "Tägliche Messwerte.\n\n## Observations\n\n- 2026-11-03T10:00:00Z · agent:lumen · DERIVED · Puls 2026-11-03 (Instagram 10:00): Steigend: TH +20.0 Pkt ^obs-20261103100000-agent-lumen\n";
    const r = await retrieveContext(notes({
      "kn-world-pulse-2026-w45": { frontmatter: { type: "observation", status: "DERIVED", created_by: "agent:lumen", source_refs: [{ source: "src-ana-world-pulse", locator: "/world, Woche 2026-w45" }] }, body },
      "src-ana-world-pulse": own,
    }, ["kn-world-pulse-2026-w45"]), "Was läuft in Thailand?", 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ id: "kn-world-pulse-2026-w45", status: "DERIVED", epistemic: "UNKNOWN", history: 1, sources: [{ source: "src-ana-world-pulse", locator: "/world, Woche 2026-w45" }] });
    expect(r.results[0]?.current).toMatchObject({ status: "DERIVED" });
  });
});

describe("the access boundary: only what the dashboard wrote from its own G0/G1 sources", () => {
  const CANARY = "PRIVATE-CANARY-7f3a";
  const ref = (source: string) => ({ source, locator: `locator ${CANARY}` });
  const note = (over: Record<string, unknown>, body = `Inhalt ${CANARY}`) => ({ frontmatter: { type: "concept", status: "CANDIDATE", created_by: "agent:lumen", source_refs: [ref("src-instagram-insights")], ...over }, body });
  const source = (createdBy: string, access: string, dataClass: string) => ({ frontmatter: { type: "source", status: "SOURCE", created_by: createdBy, source: { access, data_class: dataClass } }, body: CANARY });
  const LOCKED: Array<[string, Record<string, unknown>]> = [
    ["cites a restricted G3 source", { "kn-x": note({ source_refs: [ref("src-privat")] }), "src-privat": source("ben", "restricted", "G3") }],
    ["cites a foreign internal G1 source", { "kn-x": note({ source_refs: [ref("src-andere")] }), "src-andere": source("ben", "internal", "G1") }],
    ["cites another G1 source the dashboard registered, outside the released ones", { "kn-x": note({ source_refs: [ref("src-andere")] }), "src-andere": source("agent:lumen", "internal", "G1") }],
    ["cites the dashboard's source and a locked one", { "kn-x": note({ source_refs: [ref("src-instagram-insights"), ref("src-privat")] }), "src-instagram-insights": own, "src-privat": source("ben", "restricted", "G2") }],
    ["cites no source", { "kn-x": note({ source_refs: [] }) }],
    ["cites a source that does not exist", { "kn-x": note({}) }],
    ["is written by someone else, citing the dashboard's source", { "kn-x": note({ created_by: "ana" }), "src-instagram-insights": own }],
    ["has no author", { "kn-x": note({ created_by: undefined }), "src-instagram-insights": own }],
    ["cites the dashboard's source id, but another key registered it", { "kn-x": note({}), "src-instagram-insights": source("ben", "internal", "G1") }],
    ["cites the dashboard's source, reclassified restricted", { "kn-x": note({}), "src-instagram-insights": source("agent:lumen", "restricted", "G1") }],
    ["cites the dashboard's source, reclassified G2", { "kn-x": note({}), "src-instagram-insights": source("agent:lumen", "internal", "G2") }],
    ["cites the dashboard's source, reclassified G3", { "kn-x": note({}), "src-instagram-insights": source("agent:lumen", "internal", "G3") }],
    ["cites the dashboard's source, not yet classified", { "kn-x": note({}), "src-instagram-insights": source("agent:lumen", "internal", "UNKNOWN") }],
    ["carries a block someone else appended", { "kn-x": note({}, `## Observations\n\n- 2026-11-03T10:00:00Z · ben · CANDIDATE · ${CANARY} ^obs-20261103100000-ben\n`), "src-instagram-insights": own }],
    ["carries a correction someone else appended", { "kn-x": note({}, `## Corrections\n\n- 2026-11-03T10:00:00Z · agent:other · corrects ^obs-1 · ${CANARY} ^obs-20261103100000-agent-other\n`), "src-instagram-insights": own }],
  ];

  it.each(LOCKED)("withholds a note that %s, leaving no trace but the count", async (_name, vault) => {
    const r = await retrieveContext(notes(vault, ["kn-x"]), "frage", 5);
    expect(r).toEqual({ ok: true, results: [], withheld: 1 });
    expect(JSON.stringify(r)).not.toContain(CANARY);
    expect(JSON.stringify(r)).not.toContain("kn-x");
  });

  it("the same note with the dashboard's own source is handed out (the positive control of the cases above)", async () => {
    const r = await retrieveContext(notes({ "kn-x": note({}), "src-instagram-insights": own }, ["kn-x"]), "frage", 5);
    expect(r).toMatchObject({ ok: true, withheld: 0, results: [{ id: "kn-x" }] });
  });

  it("the dashboard's own source record can be found; a locked one cannot", async () => {
    const r = await retrieveContext(notes({ "src-instagram-insights": { frontmatter: { ...own.frontmatter }, body: "" }, "src-privat": source("agent:lumen", "restricted", "G3") }, ["src-instagram-insights", "src-privat"]), "frage", 5);
    expect(r).toMatchObject({ ok: true, withheld: 1, results: [{ id: "src-instagram-insights" }] });
  });

  it("locked hits do not crowd released ones out of a small limit, and the search asks for more", async () => {
    const vault = { "kn-a": note({ source_refs: [] }), "kn-b": note({ source_refs: [] }), "kn-ok": note({}), "kn-rest": note({}), "src-instagram-insights": own };
    const { mcp, searched } = traced(vault, ["kn-a", "kn-b", "kn-ok", "kn-rest"]);
    const r = await retrieveContext(mcp, "frage", 1);
    expect(searched()).toBe(5);
    expect(r).toMatchObject({ ok: true, withheld: 2, results: [{ id: "kn-ok" }] });
  });

  it("an unreachable Brain while checking a source is a failure, never a verdict", async () => {
    const down = createBrainMcp({ url: "http://127.0.0.1:8790/mcp", key: "anab_synthetic_key_0000" }, (async (_u: string, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string } } };
      if (params.arguments.id?.startsWith("src-")) throw new Error("ECONNREFUSED");
      const text = params.name === "brain_search" ? JSON.stringify({ results: [{ id: "kn-x", title: "T", type: "concept", score: 1 }] }) : JSON.stringify(note({}));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } }), { status: 200 });
    }) as typeof fetch);
    await expect(retrieveContext(down, "frage", 5)).resolves.toEqual({ ok: false, reason: "brain-unreachable" });
  });
});

const own = { frontmatter: { type: "source", status: "SOURCE", created_by: "agent:lumen", source: { access: "internal", data_class: "G1" } }, body: "" };

function traced(vault: Record<string, unknown>, hits: string[]) {
  let limit = 0;
  const mcp = createBrainMcp({ url: "http://127.0.0.1:8790/mcp", key: "anab_synthetic_key_0000" }, (async (_u: string, init: RequestInit) => {
    const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string; limit?: number } } };
    const answer = (text: string, isError = false) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError, content: [{ type: "text", text }] } }), { status: 200 });
    if (params.name === "brain_search") {
      limit = params.arguments.limit ?? 0;
      return answer(JSON.stringify({ results: hits.map((id) => ({ id, title: `Titel ${id}`, type: "concept", score: 0.9 })) }));
    }
    const n = vault[String(params.arguments.id)];
    return n ? answer(JSON.stringify(n)) : answer(`not_found: ${params.arguments.id}`, true);
  }) as typeof fetch);
  return { mcp, searched: () => limit };
}
const notes = (vault: Record<string, unknown>, hits: string[]) => traced(vault, hits).mcp;
