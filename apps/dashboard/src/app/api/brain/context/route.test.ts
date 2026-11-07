// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const refuse = vi.hoisted(() => ({ value: null as Response | null }));
vi.mock("@/server/http", () => ({ refuseUnauthorized: async () => refuse.value }));

const URL_OK = "http://127.0.0.1:3000/api/brain/context?q=strand";

describe("GET /api/brain/context", () => {
  beforeEach(() => {
    refuse.value = null;
    vi.stubEnv("ANA_BRAIN_MCP_URL", "http://127.0.0.1:8790/mcp");
    vi.stubEnv("ANA_BRAIN_WRITE_KEY", "anab_synthetic_key_0000");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("the access gate comes first: nothing reaches the Brain", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    refuse.value = new Response(null, { status: 401 });
    expect((await GET(new Request(URL_OK))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses another site and an empty or oversized question", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await GET(new Request(URL_OK, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await GET(new Request("http://127.0.0.1:3000/api/brain/context"))).status).toBe(400);
    expect((await GET(new Request(`http://127.0.0.1:3000/api/brain/context?q=${"x".repeat(501)}`))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a foreign Origin, also without Sec-Fetch-Site", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await GET(new Request(URL_OK, { headers: { origin: "https://evil.example", host: "127.0.0.1:3000" } }))).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("a fractional limit is floored before it is scaled for the Brain (2 asked, 10 searched: withheld hits must not crowd out)", async () => {
    const f = vi.fn<(u: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ results: [] }) }] } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await GET(new Request(`${URL_OK}&limit=2.5`));
    expect(JSON.parse(String(f.mock.calls[0]?.[1].body)).params.arguments.limit).toBe(10);
  });

  it("a locked note stays out of the route's answer, in id, title, body and sources", async () => {
    const CANARY = "PRIVATE-CANARY-7f3a";
    const tool = (text: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } }), { status: 200 });
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string } } };
      asked.push(`${params.name}:${params.arguments.id ?? ""}`);
      if (params.name === "brain_search") return tool(JSON.stringify({ results: [{ id: "kn-privat-canary", title: `Titel ${CANARY}`, type: "concept", score: 0.99, summary: CANARY }] }));
      if (params.arguments.id === "kn-privat-canary") return tool(JSON.stringify({ frontmatter: { type: "concept", status: "CANDIDATE", created_by: "agent:lumen", source_refs: [{ source: "src-privat-canary", locator: `drive ${CANARY}` }] }, body: `Vertraulich ${CANARY}` }));
      return tool(JSON.stringify({ frontmatter: { type: "source", status: "SOURCE", created_by: "ben", source: { access: "restricted", data_class: "G3" } }, body: CANARY }));
    }));
    const text = await (await GET(new Request(URL_OK))).text();
    expect(asked).toContain("brain_get:kn-privat-canary");
    expect(text).toBe(JSON.stringify({ ok: true, results: [], withheld: 1 }));
    expect(text).not.toContain(CANARY);
    expect(text).not.toContain("kn-privat-canary");
  });

  it("says when the server has no Brain connection", async () => {
    vi.stubEnv("ANA_BRAIN_WRITE_KEY", "");
    await expect((await GET(new Request(URL_OK))).json()).resolves.toEqual({ ok: false, reason: "not-configured" });
  });

  it("an answer never carries the key and is not cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ results: [] }) }] } }), { status: 200 })));
    const r = await GET(new Request(URL_OK));
    expect(r.headers.get("cache-control")).toBe("no-store");
    const text = await r.text();
    expect(text).toBe(JSON.stringify({ ok: true, results: [], withheld: 0 }));
    expect(text).not.toContain("anab_");
  });
});
