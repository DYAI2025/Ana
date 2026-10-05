/** Wraps the shared fake Jira (e2e/fake-jira/core.mjs) as a `fetch` for unit tests of the server adapter. */
import { createFakeJira, FAKE_AUTH, type FakeJira } from "../../e2e/fake-jira/core.mjs";
import { createJiraClient, type JiraClient } from "@/server/jira/client";

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    });
  });

export function fakeJiraFetch(fake: FakeJira): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const result = fake.handle(init?.method ?? "GET", path, headers, body);
    if (result.network) throw new TypeError("fetch failed");
    if (result.delayMs) await sleep(result.delayMs, init?.signal);
    if (result.hang) return new Response(JSON.stringify({ errorMessages: ["slow"] }), { status: 503 });
    return new Response(result.body === null || result.body === undefined ? null : JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  };
}

export function fakeJiraClient(options: { timeoutMs?: number; token?: string } = {}): { fake: FakeJira; client: JiraClient } {
  const fake = createFakeJira();
  const client = createJiraClient(
    { baseUrl: "https://jira.example.invalid", email: FAKE_AUTH.email, token: options.token ?? FAKE_AUTH.token, timeoutMs: options.timeoutMs ?? 200 },
    fakeJiraFetch(fake),
  );
  return { fake, client };
}
