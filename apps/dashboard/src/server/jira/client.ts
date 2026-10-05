import "server-only";
import type { JiraConfig } from "./config";

/**
 * What went wrong talking to Jira. `timeout` and `network` leave the outcome of a write unknown; `budget` means the
 * call was never sent because the request's time budget was already spent.
 */
export type JiraCallError =
  | { kind: "http"; status: number; detail: string }
  | { kind: "timeout" }
  | { kind: "budget" }
  | { kind: "network"; detail: string }
  | { kind: "invalid-json" };

export type JiraResponse<T> = { ok: true; status: number; data: T } | { ok: false; error: JiraCallError };

export interface JiraClient {
  readonly siteOrigin: string;
  get<T>(path: string): Promise<JiraResponse<T>>;
  post<T>(path: string, body: unknown): Promise<JiraResponse<T>>;
}

const DETAIL_MAX = 300;

/** Jira's own error text, shortened; never request headers or credentials. */
export function jiraErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: unknown; errors?: unknown; message?: unknown };
    const messages = [
      ...(Array.isArray(parsed.errorMessages) ? parsed.errorMessages.map(String) : []),
      ...(parsed.errors && typeof parsed.errors === "object" ? Object.entries(parsed.errors).map(([field, text]) => `${field}: ${String(text)}`) : []),
      ...(typeof parsed.message === "string" ? [parsed.message] : []),
    ];
    if (messages.length > 0) return messages.join("; ").slice(0, DETAIL_MAX);
  } catch {
    /* not JSON */
  }
  return body.replace(/\s+/g, " ").trim().slice(0, DETAIL_MAX);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export interface ClientOptions {
  /** Total time for every Jira call made through this client (one dashboard request); each call gets what is left. */
  budgetMs?: number;
}

export function createJiraClient(config: JiraConfig, fetchImpl: typeof fetch = fetch, options: ClientOptions = {}): JiraClient {
  const authorization = `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;
  const deadline = options.budgetMs === undefined ? Infinity : Date.now() + options.budgetMs;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<JiraResponse<T>> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, error: { kind: "budget" } };
    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, remaining)),
        cache: "no-store",
      });
      text = await response.text();
    } catch (error) {
      if (isTimeout(error)) return { ok: false, error: { kind: "timeout" } };
      return { ok: false, error: { kind: "network", detail: error instanceof Error ? error.message.slice(0, DETAIL_MAX) : "network error" } };
    }
    if (!response.ok) return { ok: false, error: { kind: "http", status: response.status, detail: jiraErrorDetail(text) } };
    if (text.trim() === "") return { ok: true, status: response.status, data: undefined as T };
    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: { kind: "invalid-json" } };
    }
  }

  return {
    siteOrigin: config.baseUrl,
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
  };
}
