import "server-only";
import { parseProjection, type BrainResult } from "@/features/brain/types";

export interface BrainConfig {
  /** Base URL of the Brain service; the projection is read from `${baseUrl}/projection`. */
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the server-side Brain connection (BRAIN_API_URL, BRAIN_API_TOKEN). Null when anything is missing or the
 * URL is unusable, so the UI shows BLOCKED instead of guessing. Plain http only for a local service or test double:
 * the bearer token never travels unencrypted to a remote host. Never exposed to the browser (no NEXT_PUBLIC_).
 */
export function readBrainConfig(env: Readonly<Record<string, string | undefined>> = process.env): BrainConfig | null {
  const raw = env.BRAIN_API_URL?.trim();
  const token = env.BRAIN_API_TOKEN?.trim();
  if (!raw || !token) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  if (!secure) return null;
  const timeout = Number(env.BRAIN_TIMEOUT_MS);
  return { baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, token, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000 };
}

/** One bounded read of the projection. Every outcome is a BrainResult; the token never appears in a detail. */
export async function fetchProjection(config: BrainConfig | null, fetchImpl: typeof fetch = fetch): Promise<BrainResult> {
  if (!config) {
    return { ok: false, failure: { kind: "not-configured", detail: "BRAIN_API_URL and BRAIN_API_TOKEN must be set on the dashboard server" } };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/projection`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, failure: { kind: "unreachable", detail: timedOut ? `no answer within ${config.timeoutMs} ms` : "the Brain service could not be reached" } };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, failure: { kind: "unauthorized", detail: `the Brain service refused the dashboard credential (HTTP ${response.status})` } };
  }
  if (!response.ok) return { ok: false, failure: { kind: "unreachable", detail: `the Brain service answered HTTP ${response.status}` } };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: { kind: "invalid-response", detail: "the Brain service did not answer with JSON" } };
  }
  const parsed = parseProjection(body);
  if (!parsed.ok) return { ok: false, failure: { kind: "invalid-response", detail: parsed.error } };
  return { ok: true, projection: parsed.value };
}
