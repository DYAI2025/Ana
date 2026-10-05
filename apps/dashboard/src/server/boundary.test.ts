// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/work/route";
import { readWriteRequest, refuseNonLocal } from "./http";
import { createJiraClient, jiraErrorDetail } from "./jira/client";
import { readJiraConfig } from "./jira/config";

describe("readJiraConfig — credentials stay server-side and only travel encrypted", () => {
  const env = { JIRA_BASE_URL: "https://example.atlassian.net/", JIRA_EMAIL: "bot@example.invalid", JIRA_API_TOKEN: "token" };

  it("reads a complete https configuration", () => {
    expect(readJiraConfig(env)).toEqual({ baseUrl: "https://example.atlassian.net", email: "bot@example.invalid", token: "token", timeoutMs: 10_000 });
    expect(readJiraConfig({ ...env, JIRA_TIMEOUT_MS: "1500" })?.timeoutMs).toBe(1500);
  });

  it("is not configured when anything is missing or the URL is unusable", () => {
    expect(readJiraConfig({ ...env, JIRA_API_TOKEN: "" })).toBeNull();
    expect(readJiraConfig({ ...env, JIRA_EMAIL: undefined })).toBeNull();
    expect(readJiraConfig({ ...env, JIRA_BASE_URL: "not a url" })).toBeNull();
  });

  it("refuses plain http to a remote host but allows a local test double", () => {
    expect(readJiraConfig({ ...env, JIRA_BASE_URL: "http://example.atlassian.net" })).toBeNull();
    expect(readJiraConfig({ ...env, JIRA_BASE_URL: "http://127.0.0.1:3199" })?.baseUrl).toBe("http://127.0.0.1:3199");
  });
});

describe("Jira client", () => {
  it("sends Basic auth from the server and keeps the token out of every error", async () => {
    const seen: Headers[] = [];
    const client = createJiraClient({ baseUrl: "https://jira.example.invalid", email: "bot@example.invalid", token: "super-secret-token", timeoutMs: 100 }, async (_input, init) => {
      seen.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ errorMessages: ["Nope"] }), { status: 500 });
    });
    const result = await client.get("/rest/api/3/myself");
    expect(seen[0]!.get("authorization")).toBe(`Basic ${Buffer.from("bot@example.invalid:super-secret-token").toString("base64")}`);
    expect(result).toEqual({ ok: false, error: { kind: "http", status: 500, detail: "Nope" } });
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("reports a timeout and a network failure distinctly", async () => {
    const slow = createJiraClient({ baseUrl: "https://x.invalid", email: "a", token: "b", timeoutMs: 20 }, (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    expect(await slow.get("/x")).toEqual({ ok: false, error: { kind: "timeout" } });
    const down = createJiraClient({ baseUrl: "https://x.invalid", email: "a", token: "b", timeoutMs: 20 }, async () => {
      throw new TypeError("fetch failed");
    });
    expect(await down.get("/x")).toEqual({ ok: false, error: { kind: "network", detail: "fetch failed" } });
  });

  it("shortens Jira error bodies to their messages", () => {
    expect(jiraErrorDetail(JSON.stringify({ errorMessages: ["A"], errors: { summary: "B" } }))).toBe("A; summary: B");
    expect(jiraErrorDetail("<html>gateway</html>")).toBe("<html>gateway</html>");
  });
});

describe("work API answers only requests addressed to this machine", () => {
  const get = (host: string) => new Request(`http://${host}/api/work`, { headers: { host } });

  it.each(["localhost:3000", "127.0.0.1:3100", "[::1]:3000"])("accepts %s", (host) => {
    expect(refuseNonLocal(get(host))).toBeNull();
  });

  it.each(["192.168.1.20:3000", "evil.example", "rebind.attacker.test:3000"])("refuses %s (LAN peer, DNS rebinding)", (host) => {
    expect(refuseNonLocal(get(host))?.status).toBe(403);
  });

  it("the GET /api/work route itself refuses a foreign Host before any Jira call", async () => {
    const response = await GET(get("rebind.attacker.test:3000"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, failure: { code: "invalid-request" } });
  });

  it("the npm scripts bind the server to 127.0.0.1", () => {
    const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts as Record<string, string>;
    expect(scripts.dev).toContain("--hostname 127.0.0.1");
    expect(scripts.start).toContain("--hostname 127.0.0.1");
  });

  describe("DASHBOARD_ALLOWED_HOSTS", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("is normalised like the Host header (case and port)", () => {
      vi.stubEnv("DASHBOARD_ALLOWED_HOSTS", " Dash.Example:3000 , ");
      expect(refuseNonLocal(get("dash.example:4000"))).toBeNull();
      expect(refuseNonLocal(get("other.example"))?.status).toBe(403);
    });
  });

  it("refuses a write addressed to another host even when Origin matches it", async () => {
    const request = new Request("http://evil.example/api/work/ideas", {
      method: "POST",
      headers: { host: "evil.example", origin: "http://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    const result = await readWriteRequest(request);
    expect(!result.ok && result.response.status).toBe(403);
  });
});

describe("write requests — same-origin JSON only", () => {
  const request = (headers: Record<string, string>, body = '{"a":1}') => new Request("http://localhost:3000/api/work/ideas", { method: "POST", headers, body });

  it("accepts a same-origin JSON request", async () => {
    const result = await readWriteRequest(request({ host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "sec-fetch-site": "same-origin" }));
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it.each([
    [{ host: "localhost:3000", origin: "https://evil.example", "content-type": "application/json" }, 403],
    [{ host: "localhost:3000", "sec-fetch-site": "cross-site", "content-type": "application/json" }, 403],
    [{ host: "localhost:3000", origin: "http://localhost:3000", "content-type": "text/plain" }, 415],
  ])("refuses %o with %i", async (headers, status) => {
    const result = await readWriteRequest(request(headers));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(status);
  });

  it("refuses a body that is not JSON", async () => {
    const result = await readWriteRequest(request({ host: "localhost:3000", "content-type": "application/json" }, "{nope"));
    expect(!result.ok && result.response.status).toBe(400);
  });
});
