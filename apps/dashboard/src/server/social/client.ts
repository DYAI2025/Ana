import "server-only";
import type { SocialConfig } from "./config";

export type WorkerCallError =
  | { kind: "http"; status: number; code: string | null }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "invalid-json" };

export type WorkerResponse = { ok: true; data: unknown } | { ok: false; error: WorkerCallError };

export const SNAPSHOT_PATH = "/internal/social-snapshot";

/**
 * One read of the worker's social snapshot. Errors carry only the worker's error code (e.g. "reauth-required"),
 * never headers, the key or a response body.
 */
export async function fetchWorkerSnapshot(config: SocialConfig, fetchImpl: typeof fetch = fetch): Promise<WorkerResponse> {
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(`${config.workerOrigin}${SNAPSHOT_PATH}?max=${config.maxPosts}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    });
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { ok: false, error: { kind: "timeout" } };
    return { ok: false, error: { kind: "network" } };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return response.ok ? { ok: false, error: { kind: "invalid-json" } } : { ok: false, error: { kind: "http", status: response.status, code: null } };
  }
  if (!response.ok) {
    const code = typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error.slice(0, 60) : null;
    return { ok: false, error: { kind: "http", status: response.status, code } };
  }
  return { ok: true, data };
}
