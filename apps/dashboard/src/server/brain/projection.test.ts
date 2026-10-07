// @vitest-environment node
import { describe, expect, it } from "vitest";
import { baseProjection } from "../../../e2e/fake-brain/data.mjs";
import { fetchProjection, readBrainConfig, type BrainConfig } from "./projection";

const config: BrainConfig = { baseUrl: "https://brain.example.invalid/api", token: "super-secret-brain-token", timeoutMs: 30 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("readBrainConfig — the token stays server-side and only travels encrypted", () => {
  const env = { BRAIN_API_URL: "https://brain.example.invalid/api/", BRAIN_API_TOKEN: "t" };
  it("reads a complete configuration", () => {
    expect(readBrainConfig(env)).toEqual({ baseUrl: "https://brain.example.invalid/api", token: "t", timeoutMs: 10_000 });
    expect(readBrainConfig({ ...env, BRAIN_TIMEOUT_MS: "1500" })?.timeoutMs).toBe(1500);
  });
  it("is not configured when anything is missing, unusable or plain http to a remote host", () => {
    expect(readBrainConfig({ ...env, BRAIN_API_TOKEN: " " })).toBeNull();
    expect(readBrainConfig({ BRAIN_API_TOKEN: "t" })).toBeNull();
    expect(readBrainConfig({ ...env, BRAIN_API_URL: "not a url" })).toBeNull();
    expect(readBrainConfig({ ...env, BRAIN_API_URL: "http://brain.example.invalid" })).toBeNull();
    expect(readBrainConfig({ ...env, BRAIN_API_URL: "http://127.0.0.1:3198" })?.baseUrl).toBe("http://127.0.0.1:3198");
  });
});

describe("fetchProjection", () => {
  it("not configured → not-configured, without any call", async () => {
    let calls = 0;
    const result = await fetchProjection(null, async () => {
      calls += 1;
      return json({});
    });
    expect(result).toMatchObject({ ok: false, failure: { kind: "not-configured" } });
    expect(calls).toBe(0);
  });

  it("ok: reads /projection with the bearer token and returns the validated projection", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const result = await fetchProjection(config, async (input, init) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return json(baseProjection());
    });
    expect(seen).toEqual([{ url: "https://brain.example.invalid/api/projection", auth: "Bearer super-secret-brain-token" }]);
    expect(result.ok && result.projection.nodes.length).toBe(baseProjection().nodes.length);
  });

  it.each([401, 403])("HTTP %i → unauthorized", async (status) => {
    const result = await fetchProjection(config, async () => json({ error: "no" }, status));
    expect(result).toMatchObject({ ok: false, failure: { kind: "unauthorized" } });
    expect(JSON.stringify(result)).not.toContain("super-secret-brain-token");
  });

  it("network failure, timeout and HTTP 5xx → unreachable", async () => {
    expect(await fetchProjection(config, async () => Promise.reject(new TypeError("fetch failed")))).toMatchObject({ ok: false, failure: { kind: "unreachable" } });
    const slow = await fetchProjection(config, (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
    expect(slow).toMatchObject({ ok: false, failure: { kind: "unreachable", detail: "no answer within 30 ms" } });
    expect(await fetchProjection(config, async () => json({}, 502))).toMatchObject({ ok: false, failure: { kind: "unreachable" } });
  });

  it("non-JSON or a body that breaks the contract → invalid-response", async () => {
    expect(await fetchProjection(config, async () => new Response("<html>", { status: 200 }))).toMatchObject({ ok: false, failure: { kind: "invalid-response" } });
    expect(await fetchProjection(config, async () => json({ version: 2, nodes: "nope" }))).toMatchObject({ ok: false, failure: { kind: "invalid-response" } });
  });
});
