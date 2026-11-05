// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BrainToolError, createBrainMcp } from "./mcpClient";

const config = { url: "http://127.0.0.1:8790/mcp", key: "anab_synthetic_key_0000" };
const tool = (text: string, isError = false) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError, content: [{ type: "text", text }] } }), { status: 200 });
const failure = (impl: () => Promise<Response>) => createBrainMcp(config, impl as unknown as typeof fetch).call("brain_get", { id: "x" }).catch((e: unknown) => e as BrainToolError);

describe("createBrainMcp", () => {
  it("sends the key only to the configured URL and refuses redirects", async () => {
    const f = vi.fn<(u: string, i: RequestInit) => Promise<Response>>(async () => tool("ok"));
    await expect(createBrainMcp(config, f as unknown as typeof fetch).call("brain_get", { id: "x" })).resolves.toBe("ok");
    expect(f.mock.calls[0]?.[0]).toBe(config.url);
    expect(f.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", headers: { authorization: `Bearer ${config.key}` } });
  });

  it("tells an existing id, a refusal and an unreachable Brain apart", async () => {
    expect(await failure(async () => tool("exists: note already exists: x", true))).toMatchObject({ kind: "exists" });
    expect(await failure(async () => tool("forbidden", true))).toMatchObject({ kind: "refused", summary: "brain_get refused" });
    expect(await failure(async () => new Response("no", { status: 500 }))).toMatchObject({ kind: "unreachable" });
    expect(await failure(async () => Promise.reject(new Error("ECONNREFUSED")))).toMatchObject({ kind: "unreachable" });
    expect(await failure(async () => new Response("not json", { status: 200 }))).toMatchObject({ kind: "unreachable" });
  });
});
