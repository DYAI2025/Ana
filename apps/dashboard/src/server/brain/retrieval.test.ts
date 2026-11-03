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

function brain(over: Record<string, { text: string; isError?: boolean }> = {}) {
  const asked: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string } } };
    asked.push(params.name);
    const a = over[params.name] ?? {
      brain_search: { text: JSON.stringify({ results: [{ id: "kn-ig-resonanz-reel-beach", title: "T", type: "observation", status: "DERIVED", score: 0.81, summary: "s", chunks: [0] }] }) },
      brain_get: { text: JSON.stringify({ frontmatter: { id: params.arguments.id, status: "DERIVED", type: "observation", updated: "2026-11-03T11:00:00Z", source_refs: [{ source: "src-instagram-insights", locator: "instagram:media-insights?format=reel&theme=beach" }] }, body: BODY }) },
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

- 2026-11-01T10:00:00Z · a · DERIVED · IG-INSIGHT tag=2026-11-01 v=1 status=DERIVED | alt ^obs-a
- 2026-11-05T10:00:00Z · a · DERIVED · IG-INSIGHT tag=2026-11-05 v=1 status=DERIVED | neu ^obs-b

## Corrections

- 2026-11-06T10:00:00Z · ben · DERIVED · corrects ^obs-a · IG-INSIGHT tag=2026-11-01 v=2 status=DERIVED | alt korrigiert ^obs-c
`;
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { status: "DERIVED", source_refs: [] }, body }) } });
    const r = await retrieveContext(mcp, "x", 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.results[0]?.current?.block).toBe("obs-b");
    expect(r.results[0]?.corrected).toEqual(["obs-a"]);
  });

  it("only a writer's block header sets the epistemic status, not free text", async () => {
    const body = "## Observations\n\n- 2026-11-01T10:00:00Z · a · CANDIDATE · der Text sagt status=SOURCE ^obs-a\n";
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { status: "CANDIDATE", source_refs: [] }, body }) } });
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
    const { mcp } = brain({ brain_get: { text: JSON.stringify({ frontmatter: { id: "kn-x", status: "CANDIDATE", source_refs: [] }, body: "Nur Text." }) } });
    const r = await retrieveContext(mcp, "x", 1);
    if (!r.ok) throw new Error("unreachable");
    expect(r.results[0]).toMatchObject({ status: "CANDIDATE", epistemic: "UNKNOWN", current: null, excerpt: "Nur Text.", sources: [] });
  });

  it("a Brain failure is an honest failure, not an empty answer", async () => {
    const { mcp } = brain({ brain_search: { text: "search failed", isError: true } });
    await expect(retrieveContext(mcp, "x", 1)).resolves.toEqual({ ok: false, reason: "brain-failed" });
  });

  it("no match is an empty answer without further calls", async () => {
    const { mcp, asked } = brain({ brain_search: { text: JSON.stringify({ results: [] }) } });
    await expect(retrieveContext(mcp, "x", 1)).resolves.toEqual({ ok: true, results: [] });
    expect(asked).toEqual(["brain_search"]);
  });
});

describe("the daily digest's week note, as retrieval sees it", () => {
  it("keeps the Brain's status and does not claim an epistemic label the block does not state", async () => {
    const body = "Tägliche Messwerte.\n\n## Observations\n\n- 2026-11-03T10:00:00Z · agent:lumen · DERIVED · Puls 2026-11-03 (Instagram 10:00): Steigend: TH +20.0 Pkt ^obs-20261103100000-agent-lumen\n";
    const { mcp } = brain({
      brain_search: { text: JSON.stringify({ results: [{ id: "kn-world-pulse-2026-w45", title: "Was läuft", type: "observation", score: 0.7 }] }) },
      brain_get: { text: JSON.stringify({ frontmatter: { status: "DERIVED", source_refs: [{ source: "src-ana-world-pulse", locator: "/world, Woche 2026-w45" }] }, body }) },
    });
    const r = await retrieveContext(mcp, "Was läuft in Thailand?", 5);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results[0]).toMatchObject({ id: "kn-world-pulse-2026-w45", status: "DERIVED", epistemic: "UNKNOWN", history: 1, sources: [{ source: "src-ana-world-pulse", locator: "/world, Woche 2026-w45" }] });
    expect(r.results[0]?.current).toMatchObject({ status: "DERIVED" });
  });
});
