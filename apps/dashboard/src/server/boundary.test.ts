// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readWriteRequest } from "./http";
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
