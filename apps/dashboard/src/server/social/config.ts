import "server-only";

/**
 * Server-side connection to the ana-instagram-oauth worker's internal read contract (ANA-38).
 * The key authorizes GET /internal/social-snapshot only; it never reaches the browser and never uses NEXT_PUBLIC_.
 */
export interface SocialConfig {
  /** Origin of the worker, e.g. https://login.example */
  workerOrigin: string;
  key: string;
  timeoutMs: number;
  /** Posts to request per snapshot (worker accepts 1..50). */
  maxPosts: number;
  /** How long a good snapshot is served from memory (default 10 min). */
  cacheMs: number;
  /** Minimum time between forced refreshes (default 60 s). */
  minRefreshMs: number;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MIN_KEY_LENGTH = 16;

/** Returns null when anything is missing or unusable, so the cockpit shows a not-configured state instead of guessing. */
export function readSocialConfig(env: Readonly<Record<string, string | undefined>> = process.env): SocialConfig | null {
  const raw = env.SOCIAL_IG_WORKER_URL?.trim();
  const key = env.SOCIAL_IG_INTERNAL_READ_KEY?.trim();
  if (!raw || !key || key.length < MIN_KEY_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // the key travels only encrypted, except to a local test double
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  if (!secure) return null;
  const timeout = Number(env.SOCIAL_IG_TIMEOUT_MS);
  const max = Number(env.SOCIAL_IG_MAX_POSTS);
  const ms = (v: string | undefined, fallback: number) => (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);
  return {
    workerOrigin: url.origin,
    key,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 45_000,
    maxPosts: Number.isInteger(max) && max >= 1 && max <= 50 ? max : 50,
    cacheMs: ms(env.SOCIAL_IG_CACHE_MS, 10 * 60_000),
    minRefreshMs: ms(env.SOCIAL_IG_MIN_REFRESH_MS, 60_000),
  };
}
