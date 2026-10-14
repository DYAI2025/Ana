// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSnapshot, FAKE_ACCOUNT_ID } from "../../../e2e/fake-social/core.mjs";
import { GET } from "@/app/api/social/instagram/route";
import { fetchWorkerSnapshot, SNAPSHOT_PATH } from "./client";
import { readSocialConfig, type SocialConfig } from "./config";
import { formatOf, InvalidWorkerResponse, normalizeSnapshot } from "./normalize";
import { createSnapshotService, workerFailure } from "./service";

const KEY = "unit-test-social-key-0123456789";
const FRESH_MS = 10 * 60_000;
const MIN_REFRESH_INTERVAL_MS = 60_000;
const config: SocialConfig = { workerOrigin: "https://worker.example.invalid", key: KEY, timeoutMs: 50, maxPosts: 50, cacheMs: FRESH_MS, minRefreshMs: MIN_REFRESH_INTERVAL_MS };
const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("readSocialConfig — the worker key stays server-side and only travels encrypted", () => {
  const env = { SOCIAL_IG_WORKER_URL: "https://login.example.invalid/", SOCIAL_IG_INTERNAL_READ_KEY: KEY };

  it("reads a complete https configuration with defaults", () => {
    expect(readSocialConfig(env)).toEqual({ workerOrigin: "https://login.example.invalid", key: KEY, timeoutMs: 45_000, maxPosts: 50, cacheMs: 600_000, minRefreshMs: 60_000 });
    expect(readSocialConfig({ ...env, SOCIAL_IG_CACHE_MS: "0", SOCIAL_IG_MIN_REFRESH_MS: "0" })).toMatchObject({ cacheMs: 0, minRefreshMs: 0 });
    expect(readSocialConfig({ ...env, SOCIAL_IG_CACHE_MS: "-5" })?.cacheMs).toBe(600_000);
    expect(readSocialConfig({ ...env, SOCIAL_IG_TIMEOUT_MS: "1500", SOCIAL_IG_MAX_POSTS: "20" })).toMatchObject({ timeoutMs: 1500, maxPosts: 20 });
    expect(readSocialConfig({ ...env, SOCIAL_IG_MAX_POSTS: "51" })?.maxPosts).toBe(50);
  });

  it("is not configured when anything is missing, the key is short or the URL is unusable", () => {
    expect(readSocialConfig({ ...env, SOCIAL_IG_INTERNAL_READ_KEY: "" })).toBeNull();
    expect(readSocialConfig({ ...env, SOCIAL_IG_INTERNAL_READ_KEY: "short" })).toBeNull();
    expect(readSocialConfig({ ...env, SOCIAL_IG_WORKER_URL: undefined })).toBeNull();
    expect(readSocialConfig({ ...env, SOCIAL_IG_WORKER_URL: "not a url" })).toBeNull();
  });

  it("refuses plain http to a remote host but allows a local test double", () => {
    expect(readSocialConfig({ ...env, SOCIAL_IG_WORKER_URL: "http://login.example.invalid" })).toBeNull();
    expect(readSocialConfig({ ...env, SOCIAL_IG_WORKER_URL: "http://127.0.0.1:3198" })?.workerOrigin).toBe("http://127.0.0.1:3198");
  });
});

describe("worker client", () => {
  it("sends the key as a Bearer header to the snapshot path with max, and keeps it out of every error", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const result = await fetchWorkerSnapshot(config, async (input, init) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ error: "reauth-required" }), { status: 409 });
    });
    expect(seen).toEqual([{ url: `https://worker.example.invalid${SNAPSHOT_PATH}?max=50`, auth: `Bearer ${KEY}` }]);
    expect(result).toEqual({ ok: false, error: { kind: "http", status: 409, code: "reauth-required" } });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("reports timeout, network failure and unreadable JSON distinctly", async () => {
    const slow = await fetchWorkerSnapshot(config, (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
    expect(slow).toEqual({ ok: false, error: { kind: "timeout" } });
    expect(await fetchWorkerSnapshot(config, async () => { throw new TypeError("fetch failed"); })).toEqual({ ok: false, error: { kind: "network" } });
    expect(await fetchWorkerSnapshot(config, async () => new Response("<html>", { status: 200 }))).toEqual({ ok: false, error: { kind: "invalid-json" } });
  });
});

describe("normalizeSnapshot — provider response → dashboard DTO", () => {
  const snapshot = normalizeSnapshot(buildSnapshot());

  it("keeps provenance on every observation (brief §5 DTO fields)", () => {
    const reach = snapshot.posts[2]!.observations.find((o) => o.metric_name === "reach")!;
    expect(reach).toEqual({
      account_id: FAKE_ACCOUNT_ID,
      media_id: "syn002",
      provider: "instagram",
      provider_api_version: "v26.0",
      metric_name: "reach",
      native_metric_name: "reach",
      value: 5200,
      unit: "accounts",
      period: "lifetime",
      availability_state: "VERIFIED",
      availability_reason: null,
      observed_at: "2026-10-10T12:00:00.000Z",
      baseline_definition: null,
      source_reference: "instagram:media/syn002/insights#reach",
    });
    expect(snapshot.posts[2]!.observations.find((o) => o.native_metric_name === "saved")?.metric_name).toBe("saves");
  });

  it("missing values are null with a state — never 0", () => {
    const partial = snapshot.posts[7]!.observations.find((o) => o.metric_name === "views")!;
    expect(partial).toMatchObject({ value: null, availability_state: "UNAVAILABLE", availability_reason: "meta-100" });
    const notFetched = snapshot.posts[25]!;
    expect(notFetched.insights_state).toBe("not_fetched");
    expect(notFetched.observations.filter((o) => o.period === "lifetime").every((o) => o.value === null && o.availability_state === "NOT_FETCHED")).toBe(true);
    const engaged = snapshot.account.find((o) => o.metric_name === "accounts_engaged")!;
    expect(engaged).toMatchObject({ value: null, availability_state: "UNAVAILABLE", period: "28d" });
  });

  it("a VERIFIED state without a number is downgraded, not trusted", () => {
    const raw = buildSnapshot();
    raw.media.items[0]!.insights.metrics[0] = { name: "reach", value: null, state: "ok" };
    const reach = normalizeSnapshot(raw).posts[0]!.observations.find((o) => o.metric_name === "reach")!;
    expect(reach).toMatchObject({ value: null, availability_state: "UNAVAILABLE", availability_reason: "no-numeric-value" });
  });

  it("states coverage: retrieved, total available, pagination, insights split", () => {
    expect(snapshot.coverage).toEqual({
      requested: 50,
      retrieved: 28,
      total_available: 212,
      has_more: true,
      pages_fetched: 2,
      posts_with_insights: 25,
      posts_without_insights: 3,
      budget_used: 45,
      budget_limit: 45,
      insights_priority: "mature-first",
      halted: null,
      optional_fields: "ACCEPTED",
    });
  });

  it("a budget the worker did not report is unknown (null), never 0", () => {
    const raw = buildSnapshot() as unknown as Record<string, Record<string, unknown>>;
    raw.insights = { ...raw.insights, budget: undefined };
    expect(normalizeSnapshot(raw).coverage).toMatchObject({ budget_used: null, budget_limit: null });
  });

  it("maps formats from media type and product type", () => {
    expect([formatOf("VIDEO", "REELS"), formatOf("CAROUSEL_ALBUM", "FEED"), formatOf("IMAGE", "FEED"), formatOf("VIDEO", "FEED"), formatOf("VIDEO", null), formatOf(null, null)]).toEqual(["reel", "carousel", "image", "video", "unknown", "unknown"]);
  });

  it("drops non-https links and rejects unknown snapshot versions", () => {
    const raw = buildSnapshot();
    (raw.media.items[0] as Record<string, unknown>).permalink = "javascript:alert(1)";
    expect(normalizeSnapshot(raw).posts[0]!.permalink).toBeNull();
    expect(() => normalizeSnapshot({ snapshot_version: 2 })).toThrow(InvalidWorkerResponse);
    expect(() => normalizeSnapshot({ ...buildSnapshot(), fetched_at: "yesterday" })).toThrow(InvalidWorkerResponse);
  });
});

describe("snapshot service — caching, STALE and failure states", () => {
  it("maps worker failures to cockpit states", () => {
    expect(workerFailure({ kind: "http", status: 409, code: "reauth-required" })).toMatchObject({ state: "PERMISSION_REQUIRED", code: "reauth-required" });
    expect(workerFailure({ kind: "http", status: 409, code: "account-mismatch" })).toMatchObject({ state: "PERMISSION_REQUIRED", code: "account-mismatch" });
    expect(workerFailure({ kind: "http", status: 401, code: "unauthorized" })).toMatchObject({ state: "ERROR", code: "auth" });
    expect(workerFailure({ kind: "http", status: 502, code: "instagram-media-fetch-failed" })).toMatchObject({ state: "ERROR", code: "upstream", detail: "HTTP 502: instagram-media-fetch-failed" });
    expect(workerFailure({ kind: "timeout" })).toMatchObject({ state: "ERROR", code: "unavailable" });
  });

  it("serves a fresh snapshot from memory and shares one in-flight worker read", async () => {
    let calls = 0;
    let t = 1_000_000;
    const service = createSnapshotService(config, async () => { calls += 1; return new Response(JSON.stringify(buildSnapshot())); }, () => t);
    const [a, b] = await Promise.all([service.read(), service.read()]);
    expect(calls).toBe(1);
    expect(a.ok && b.ok).toBe(true);
    t += FRESH_MS - 1;
    await service.read();
    expect(calls).toBe(1);
    await service.read({ refresh: true }); // allowed: older than MIN_REFRESH_INTERVAL_MS
    expect(calls).toBe(2);
    t += MIN_REFRESH_INTERVAL_MS - 1;
    await service.read({ refresh: true }); // too soon: served from memory
    expect(calls).toBe(2);
  });

  it("a failed refresh with an earlier snapshot answers STALE, never as current", async () => {
    let t = 0;
    let fail = false;
    const service = createSnapshotService(config, async () => (fail ? new Response(JSON.stringify({ error: "instagram-media-fetch-failed" }), { status: 502 }) : new Response(JSON.stringify(buildSnapshot()))), () => t);
    await service.read();
    fail = true;
    t += FRESH_MS;
    const result = await service.read();
    expect(result).toMatchObject({ ok: true, stale: true, failure: { state: "STALE", code: "upstream" } });
  });

  it("a permission problem is never hidden behind an older snapshot", async () => {
    let t = 0;
    let fail = false;
    const service = createSnapshotService(config, async () => (fail ? new Response(JSON.stringify({ error: "reauth-required" }), { status: 409 }) : new Response(JSON.stringify(buildSnapshot()))), () => t);
    await service.read();
    fail = true;
    t += FRESH_MS;
    expect(await service.read()).toEqual({ ok: false, failure: expect.objectContaining({ state: "PERMISSION_REQUIRED", code: "reauth-required" }) });
  });

  it("a failing worker is not hammered: within the interval the last failure is repeated without a new call", async () => {
    let calls = 0;
    let t = 0;
    const service = createSnapshotService(config, async () => { calls += 1; return new Response(JSON.stringify({ error: "instagram-media-fetch-failed" }), { status: 502 }); }, () => t);
    expect(await service.read()).toMatchObject({ ok: false, failure: { code: "upstream" } });
    t += MIN_REFRESH_INTERVAL_MS - 1;
    expect(await service.read({ refresh: true })).toMatchObject({ ok: false, failure: { code: "upstream" } });
    await service.read();
    expect(calls).toBe(1);
    t += 1;
    await service.read();
    expect(calls).toBe(2);
  });

  it("never writes a caption (or anything else) to the server log", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    let t = 0;
    let fail = false;
    const service = createSnapshotService(config, async () => (fail ? new Response("nope", { status: 500 }) : new Response(JSON.stringify(buildSnapshot()))), () => t);
    await service.read();
    fail = true;
    t += FRESH_MS;
    await service.read();
    const printed = spies.flatMap((s) => s.mock.calls.flat().map(String)).join("\n");
    spies.forEach((s) => s.mockRestore());
    expect(printed).toBe("");
  });

  it("an unreadable snapshot is an ERROR, not partial data", async () => {
    const service = createSnapshotService(config, ok({ snapshot_version: 99 }));
    expect(await service.read()).toEqual({ ok: false, failure: { state: "ERROR", code: "invalid-response", detail: "unsupported snapshot_version" } });
  });
});

describe("GET /api/social/instagram", () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = (host: string) => new Request(`http://${host}/api/social/instagram`, { headers: { host } });

  it("refuses a foreign Host before any worker call (loopback only)", async () => {
    vi.stubEnv("SOCIAL_IG_WORKER_URL", "https://worker.example.invalid");
    vi.stubEnv("SOCIAL_IG_INTERNAL_READ_KEY", KEY);
    const spy = vi.spyOn(globalThis, "fetch");
    const response = await GET(get("rebind.attacker.test:3000"));
    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refuses a cross-site request (a read may start a costly worker call)", async () => {
    vi.stubEnv("SOCIAL_IG_WORKER_URL", "https://worker.example.invalid");
    vi.stubEnv("SOCIAL_IG_INTERNAL_READ_KEY", KEY);
    const spy = vi.spyOn(globalThis, "fetch");
    const cases: Record<string, string>[] = [{ host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" }, { host: "127.0.0.1:3000", origin: "https://evil.example" }];
    for (const headers of cases) {
      const response = await GET(new Request("http://127.0.0.1:3000/api/social/instagram?refresh=1", { headers }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ ok: false, failure: { code: "invalid-request" } });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("answers not-configured without a worker URL and key", async () => {
    vi.stubEnv("SOCIAL_IG_WORKER_URL", "");
    vi.stubEnv("SOCIAL_IG_INTERNAL_READ_KEY", "");
    const response = await GET(get("127.0.0.1:3000"));
    expect(await response.json()).toEqual({ ok: false, failure: expect.objectContaining({ state: "ERROR", code: "not-configured" }) });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("ignores the e2e cache-reset control unless SOCIAL_IG_E2E_CONTROLS=1", async () => {
    vi.stubEnv("SOCIAL_IG_WORKER_URL", "http://127.0.0.1:9");
    vi.stubEnv("SOCIAL_IG_INTERNAL_READ_KEY", KEY);
    vi.stubEnv("SOCIAL_IG_TIMEOUT_MS", "50");
    vi.stubEnv("SOCIAL_IG_E2E_CONTROLS", "");
    const off = await GET(new Request("http://127.0.0.1:3000/api/social/instagram?__reset", { headers: { host: "127.0.0.1:3000" } }));
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ ok: false });
    vi.stubEnv("SOCIAL_IG_E2E_CONTROLS", "1");
    const on = await GET(new Request("http://127.0.0.1:3000/api/social/instagram?__reset", { headers: { host: "127.0.0.1:3000" } }));
    expect(on.status).toBe(204);
  });

  it("the route reads only through the server-side service (no client-side worker access)", () => {
    const route = readFileSync("src/app/api/social/instagram/route.ts", "utf8");
    expect(route).toMatch(/socialServiceFromEnv\(\)/);
    expect(route).toMatch(/refuseNonLocal\(request\)/);
  });
});
