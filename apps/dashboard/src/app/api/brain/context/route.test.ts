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

  it("a fractional limit is floored before it reaches the Brain", async () => {
    const f = vi.fn<(u: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ results: [] }) }] } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await GET(new Request(`${URL_OK}&limit=2.5`));
    expect(JSON.parse(String(f.mock.calls[0]?.[1].body)).params.arguments.limit).toBe(2);
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
    expect(text).toBe(JSON.stringify({ ok: true, results: [] }));
    expect(text).not.toContain("anab_");
  });
});
