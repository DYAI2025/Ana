import "server-only";
import type { SocialFailure, SocialResult, SocialSnapshot } from "@/features/social/types";
import { fetchWorkerSnapshot, type WorkerCallError } from "./client";
import { readSocialConfig, type SocialConfig } from "./config";
import { InvalidWorkerResponse, normalizeSnapshot } from "./normalize";

/**
 * One worker snapshot costs ~45 Instagram API calls, so the server keeps the last good answer in memory for
 * `config.cacheMs` (default 10 min) and shares one in-flight read between concurrent requests. A forced refresh is
 * honoured at most every `config.minRefreshMs` (default 60 s). Nothing is written to disk: a restart starts empty.
 */

export function workerFailure(error: WorkerCallError): SocialFailure {
  switch (error.kind) {
    case "timeout":
      return { state: "ERROR", code: "unavailable", detail: "the Instagram worker did not answer in time" };
    case "network":
      return { state: "ERROR", code: "unavailable", detail: "the Instagram worker could not be reached" };
    case "invalid-json":
      return { state: "ERROR", code: "invalid-response", detail: "the Instagram worker returned an unreadable answer" };
    case "http":
      if (error.status === 401) return { state: "ERROR", code: "auth", detail: "the dashboard's worker key was refused" };
      if (error.status === 409 && error.code === "account-mismatch") return { state: "PERMISSION_REQUIRED", code: "account-mismatch", detail: "the connected Instagram account is not the expected one" };
      if (error.status === 409) return { state: "PERMISSION_REQUIRED", code: "reauth-required", detail: "Instagram access must be re-authorized" };
      if (error.status === 400) return { state: "ERROR", code: "invalid-request", detail: error.code ?? "HTTP 400" };
      return { state: "ERROR", code: "upstream", detail: `HTTP ${error.status}${error.code ? `: ${error.code}` : ""}` };
  }
}

export const NOT_CONFIGURED: SocialFailure = {
  state: "ERROR",
  code: "not-configured",
  detail: "SOCIAL_IG_WORKER_URL and SOCIAL_IG_INTERNAL_READ_KEY must be set on the dashboard server",
};

interface Cache {
  snapshot: SocialSnapshot | null;
  fetchedAt: number;
  inFlight: Promise<SocialResult> | null;
}

export interface SnapshotService {
  read(options?: { refresh?: boolean }): Promise<SocialResult>;
  /** Drops the in-memory snapshot (e2e control only, see route). */
  reset(): void;
}

export function createSnapshotService(config: SocialConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): SnapshotService {
  const cache: Cache = { snapshot: null, fetchedAt: 0, inFlight: null };

  async function load(): Promise<SocialResult> {
    const response = await fetchWorkerSnapshot(config, fetchImpl);
    let failure: SocialFailure;
    if (response.ok) {
      try {
        const snapshot = normalizeSnapshot(response.data);
        cache.snapshot = snapshot;
        cache.fetchedAt = now();
        return { ok: true, snapshot: { ...snapshot, served_at: new Date(now()).toISOString() }, stale: false };
      } catch (error) {
        failure = { state: "ERROR", code: "invalid-response", detail: error instanceof InvalidWorkerResponse ? error.message : "unreadable snapshot" };
      }
    } else {
      failure = workerFailure(response.error);
    }
    // an earlier good snapshot is still evidence, but only as STALE; a permission problem is never hidden behind it
    if (cache.snapshot && failure.state !== "PERMISSION_REQUIRED") {
      return { ok: true, snapshot: { ...cache.snapshot, served_at: new Date(now()).toISOString() }, stale: true, failure: { ...failure, state: "STALE" } };
    }
    return { ok: false, failure };
  }

  return {
    read({ refresh = false } = {}) {
      const age = now() - cache.fetchedAt;
      const refreshAllowed = refresh && age >= config.minRefreshMs;
      if (cache.snapshot && age < config.cacheMs && !refreshAllowed) {
        return Promise.resolve({ ok: true, snapshot: { ...cache.snapshot, served_at: new Date(now()).toISOString() }, stale: false });
      }
      if (!cache.inFlight) cache.inFlight = load().finally(() => (cache.inFlight = null));
      return cache.inFlight;
    },
    reset() {
      cache.snapshot = null;
      cache.fetchedAt = 0;
    },
  };
}

let shared: { key: string; service: SnapshotService } | null = null;

/** The process-wide service for the configured worker, or null when the connection is not configured. */
export function socialServiceFromEnv(): SnapshotService | null {
  const config = readSocialConfig();
  if (!config) return null;
  const key = `${config.workerOrigin}|${config.maxPosts}|${config.key.length}|${config.cacheMs}|${config.minRefreshMs}`;
  if (!shared || shared.key !== key) shared = { key, service: createSnapshotService(config) };
  return shared.service;
}
