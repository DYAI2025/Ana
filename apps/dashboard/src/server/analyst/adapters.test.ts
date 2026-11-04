// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analystConfigFromEnv, PROVIDERS, type AnalystOn } from "./config";
import { callProvider } from "./adapters";

const KEYS = { anthropic: "fake-anthropic-key-000000", openai: "fake-openai-key-000000", openrouter: "fake-openrouter-key-000000" };
const prompt = { system: "SYSTEM", user: "USER" };

const on = (provider: AnalystOn["provider"]): AnalystOn => {
  const config = analystConfigFromEnv({
    WORLD_ANALYST_PROVIDER: provider,
    WORLD_ANALYST_MODEL: "model-x",
    WORLD_ANALYST_ANTHROPIC_API_KEY: KEYS.anthropic,
    WORLD_ANALYST_OPENAI_API_KEY: KEYS.openai,
    WORLD_ANALYST_OPENROUTER_API_KEY: KEYS.openrouter,
  });
  if (config.state !== "on") throw new Error(config.state);
  return config;
};

function recorder(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit; json: Record<string, unknown>; headers: Headers }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, json: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const ANTHROPIC_OK = { content: [{ type: "thinking", thinking: "NOT THE ANSWER" }, { type: "text", text: "ANSWER" }], stop_reason: "end_turn" };
const CHAT_OK = { choices: [{ message: { content: "ANSWER", refusal: null }, finish_reason: "stop" }] };

describe("Anthropic adapter (Messages API, docs read 2026-11-04)", () => {
  it("posts to /v1/messages with x-api-key and version, no bearer, no temperature, and reads only text blocks", async () => {
    const { calls, fetchImpl } = recorder(ANTHROPIC_OK);
    expect(await callProvider(on("anthropic"), prompt, fetchImpl)).toEqual({ ok: true, text: "ANSWER" });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.headers.get("x-api-key")).toBe(KEYS.anthropic);
    expect(c.headers.get("anthropic-version")).toBe("2026-10-21");
    expect(c.headers.get("authorization")).toBeNull();
    expect(c.init.redirect).toBe("error");
    expect(c.json).toMatchObject({ model: "model-x", system: "SYSTEM", messages: [{ role: "user", content: "USER" }], output_config: { effort: "low" } });
    expect(c.json.max_tokens).toBeGreaterThan(0);
    for (const banned of ["temperature", "top_p", "top_k", "thinking", "tools"]) expect(c.json).not.toHaveProperty(banned);
  });

  it("checks stop_reason before content: truncated and refused answers are not answers", async () => {
    expect(await callProvider(on("anthropic"), prompt, recorder({ ...ANTHROPIC_OK, stop_reason: "max_tokens" }).fetchImpl)).toEqual({ ok: false, reason: "truncated" });
    expect(await callProvider(on("anthropic"), prompt, recorder({ ...ANTHROPIC_OK, stop_reason: "refusal", stop_details: { category: "x" } }).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await callProvider(on("anthropic"), prompt, recorder({ content: [], stop_reason: "end_turn" }).fetchImpl)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("OpenAI adapter (Chat Completions, docs read 2026-11-04)", () => {
  it("posts to /v1/chat/completions with a bearer key, store false and max_completion_tokens", async () => {
    const { calls, fetchImpl } = recorder(CHAT_OK);
    expect(await callProvider(on("openai"), prompt, fetchImpl)).toEqual({ ok: true, text: "ANSWER" });
    const c = calls[0]!;
    expect(c.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(c.headers.get("authorization")).toBe(`Bearer ${KEYS.openai}`);
    expect(c.headers.get("x-api-key")).toBeNull();
    expect(c.json).toMatchObject({ model: "model-x", store: false, messages: [{ role: "system", content: "SYSTEM" }, { role: "user", content: "USER" }] });
    expect(c.json.max_completion_tokens).toBeGreaterThan(0);
    expect(c.json).not.toHaveProperty("max_tokens");
  });

  it("maps refusal, length, content_filter and null content", async () => {
    const answer = (message: unknown, finish_reason: string) => ({ choices: [{ message, finish_reason }] });
    expect(await callProvider(on("openai"), prompt, recorder(answer({ content: null, refusal: "no" }, "stop")).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await callProvider(on("openai"), prompt, recorder(answer({ content: "x" }, "length")).fetchImpl)).toEqual({ ok: false, reason: "truncated" });
    expect(await callProvider(on("openai"), prompt, recorder(answer({ content: "x" }, "content_filter")).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await callProvider(on("openai"), prompt, recorder(answer({ content: null }, "stop")).fetchImpl)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("OpenRouter adapter (docs read 2026-11-04)", () => {
  it("posts to /api/v1/chat/completions, forbids data collection and fallbacks", async () => {
    const { calls, fetchImpl } = recorder(CHAT_OK);
    expect(await callProvider(on("openrouter"), prompt, fetchImpl)).toEqual({ ok: true, text: "ANSWER" });
    const c = calls[0]!;
    expect(c.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(c.headers.get("authorization")).toBe(`Bearer ${KEYS.openrouter}`);
    expect(c.json).toMatchObject({ model: "model-x", provider: { data_collection: "deny", allow_fallbacks: false } });
    expect(c.json.max_tokens).toBeGreaterThan(0);
    expect(c.json).not.toHaveProperty("models");
    expect(c.json).not.toHaveProperty("route");
  });

  it("maps refusal, length, content_filter, null content and an unknown finish", async () => {
    const answer = (message: unknown, finish_reason: string) => ({ choices: [{ message, finish_reason }] });
    expect(await callProvider(on("openrouter"), prompt, recorder(answer({ content: null, refusal: "no" }, "stop")).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await callProvider(on("openrouter"), prompt, recorder(answer({ content: "x" }, "length")).fetchImpl)).toEqual({ ok: false, reason: "truncated" });
    expect(await callProvider(on("openrouter"), prompt, recorder(answer({ content: "x" }, "content_filter")).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await callProvider(on("openrouter"), prompt, recorder(answer({ content: null }, "stop")).fetchImpl)).toEqual({ ok: false, reason: "invalid" });
    expect(await callProvider(on("openrouter"), prompt, recorder(answer({ content: "x" }, "tool_calls")).fetchImpl)).toEqual({ ok: false, reason: "invalid" });
  });

  it("an error object at the top of a 200 is no answer", async () => {
    expect(await callProvider(on("openrouter"), prompt, recorder({ error: { code: 502, message: "upstream secret detail" } }).fetchImpl)).toEqual({ ok: false, reason: "invalid" });
  });

  it("treats an error delivered inside a 200 as a failure, even next to partial content", async () => {
    const body = { choices: [{ message: { content: "PARTIAL" }, finish_reason: "error", error: { code: 502, message: "upstream secret detail" } }] };
    const result = await callProvider(on("openrouter"), prompt, recorder(body).fetchImpl);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });
});

describe("every adapter", () => {
  it.each(PROVIDERS)("%s: status and network failures carry a reason, never the provider's text or the key", async (provider) => {
    const leak = "provider says secret-detail-canary";
    for (const [status, reason] of [[429, "rate_limited"], [401, "failed"], [403, "failed"], [413, "failed"], [500, "failed"], [529, "failed"]] as const) {
      const result = await callProvider(on(provider), prompt, recorder(leak, status).fetchImpl);
      expect(result).toEqual({ ok: false, reason });
    }
    const invalid = await callProvider(on(provider), prompt, recorder("not json").fetchImpl);
    expect(invalid).toEqual({ ok: false, reason: "invalid" });
    const down = (async () => {
      throw new Error(`connect failed ${KEYS.openai}`);
    }) as typeof fetch;
    expect(await callProvider(on(provider), prompt, down)).toEqual({ ok: false, reason: "failed" });
    const slow = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as typeof fetch;
    expect(await callProvider(on(provider), prompt, slow)).toEqual({ ok: false, reason: "timeout" });
  });

  it.each(PROVIDERS)("%s: exactly one request, no retry after a 429 or a failure", async (provider) => {
    for (const status of [429, 500]) {
      const { calls, fetchImpl } = recorder("x", status);
      await callProvider(on(provider), prompt, fetchImpl);
      expect(calls).toHaveLength(1);
    }
  });

  it("the selected provider gets the request and its own key; no other host or key appears", async () => {
    for (const provider of PROVIDERS) {
      const body = provider === "anthropic" ? ANTHROPIC_OK : CHAT_OK;
      const { calls, fetchImpl } = recorder(body);
      await callProvider(on(provider), prompt, fetchImpl);
      const sent = `${calls[0]!.url} ${JSON.stringify([...calls[0]!.headers])}`;
      for (const other of PROVIDERS.filter((p) => p !== provider)) expect(sent).not.toContain(KEYS[other]);
    }
  });
});

describe("configuration", () => {
  const env = { WORLD_ANALYST_ANTHROPIC_API_KEY: KEYS.anthropic, WORLD_ANALYST_OPENAI_API_KEY: KEYS.openai };

  it("is off when no provider is named, whatever keys exist", () => {
    expect(analystConfigFromEnv(env).state).toBe("off");
    expect(analystConfigFromEnv({ ANTHROPIC_API_KEY: "tagger-key-000000000" }).state).toBe("off");
  });

  it("an unknown provider, a missing key or a missing model is misconfigured, not a fallback", () => {
    expect(analystConfigFromEnv({ ...env, WORLD_ANALYST_PROVIDER: "gemini" }).state).toBe("misconfigured");
    expect(analystConfigFromEnv({ WORLD_ANALYST_PROVIDER: "openrouter", WORLD_ANALYST_OPENAI_API_KEY: KEYS.openai, WORLD_ANALYST_MODEL: "m" }).state).toBe("misconfigured");
    expect(analystConfigFromEnv({ ...env, WORLD_ANALYST_PROVIDER: "openai" }).state).toBe("misconfigured");
  });

  it("never takes the tagger's ANTHROPIC_API_KEY", () => {
    expect(analystConfigFromEnv({ WORLD_ANALYST_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "tagger-key-000000000" }).state).toBe("misconfigured");
  });

  it.each(PROVIDERS)("%s without a model is misconfigured: no provider picks one silently", (provider) => {
    expect(analystConfigFromEnv({ ...env, WORLD_ANALYST_PROVIDER: provider, WORLD_ANALYST_MODEL: "  " }).state).toBe("misconfigured");
    expect(analystConfigFromEnv({ ...env, WORLD_ANALYST_PROVIDER: provider }).state).toBe("misconfigured");
  });

  it("the test base URL counts only under the e2e control and on loopback", async () => {
    const armed = { ...env, WORLD_ANALYST_PROVIDER: "openai", WORLD_ANALYST_MODEL: "m", WORLD_ANALYST_TEST_BASE_URL: "http://127.0.0.1:3196" };
    const at = (e: Record<string, string>) => {
      const c = analystConfigFromEnv(e);
      return c.state === "on" ? c.baseUrl : c.state;
    };
    expect(at(armed)).toBe("https://api.openai.com");
    expect(at({ ...armed, SOCIAL_IG_E2E_CONTROLS: "1" })).toBe("http://127.0.0.1:3196");
    expect(at({ ...armed, SOCIAL_IG_E2E_CONTROLS: "1", WORLD_ANALYST_TEST_BASE_URL: "https://evil.example.invalid" })).toBe("https://api.openai.com");
  });

  it("reads the Brain source list of the active provider only", () => {
    const e = { ...env, WORLD_ANALYST_MODEL: "m", WORLD_ANALYST_BRAIN_SOURCES_ANTHROPIC: "src-a, src-b" };
    const anthropic = analystConfigFromEnv({ ...e, WORLD_ANALYST_PROVIDER: "anthropic" });
    expect(anthropic.state === "on" && [...anthropic.brainSources]).toEqual(["src-a", "src-b"]);
    const openai = analystConfigFromEnv({ ...e, WORLD_ANALYST_PROVIDER: "openai" });
    expect(openai.state === "on" && openai.brainSources.size).toBe(0);
  });

  it("the daily cap is small by default, positive and overridable", () => {
    const e = { ...env, WORLD_ANALYST_MODEL: "m", WORLD_ANALYST_PROVIDER: "openai" };
    const def = analystConfigFromEnv(e);
    expect(def.state === "on" && def.dailyCap).toBe(30);
    const set = analystConfigFromEnv({ ...e, WORLD_ANALYST_DAILY_CAP: "5" });
    expect(set.state === "on" && set.dailyCap).toBe(5);
    const bad = analystConfigFromEnv({ ...e, WORLD_ANALYST_DAILY_CAP: "-1" });
    expect(bad.state === "on" && bad.dailyCap).toBe(30);
  });
});
