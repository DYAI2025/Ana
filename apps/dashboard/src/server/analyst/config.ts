import "server-only";

/**
 * The World analyst's configuration, all of it server-side. WORLD_ANALYST_PROVIDER is the one switch: unset means no
 * call to any provider, no worker read and no Brain read. Each provider has its own key, deliberately not the
 * tagger's ANTHROPIC_API_KEY, so the analyst's spend and rate limits stay apart from the post categories. There is no
 * fallback: a provider without its key or model is misconfigured and nothing is sent.
 */
export const PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface AnalystOn {
  state: "on";
  provider: Provider;
  model: string;
  key: string;
  baseUrl: string;
  /** source ids released for this provider; another provider's list counts for nothing */
  brainSources: ReadonlySet<string>;
  dailyCap: number;
}

export type AnalystConfig = { state: "off" } | { state: "misconfigured"; reason: string } | AnalystOn;

const BASE_URL: Record<Provider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai/api",
};
const DEFAULT_MODEL: Partial<Record<Provider, string>> = { anthropic: "claude-haiku-5-5" };
const DEFAULT_DAILY_CAP = 30;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** A fake provider for the browser tests: counts only under the e2e control and on loopback, otherwise the real host stands. */
function testBaseUrl(env: Readonly<Record<string, string | undefined>>): string | null {
  const raw = env.WORLD_ANALYST_TEST_BASE_URL?.trim();
  if (!raw || env.SOCIAL_IG_E2E_CONTROLS !== "1") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && LOOPBACK.has(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

export function analystConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): AnalystConfig {
  const raw = env.WORLD_ANALYST_PROVIDER?.trim();
  if (!raw) return { state: "off" };
  if (!(PROVIDERS as readonly string[]).includes(raw)) return { state: "misconfigured", reason: "unknown provider" };
  const provider = raw as Provider;
  const name = provider.toUpperCase();
  const key = env[`WORLD_ANALYST_${name}_API_KEY`]?.trim();
  if (!key) return { state: "misconfigured", reason: "no key for the selected provider" };
  const model = env.WORLD_ANALYST_MODEL?.trim() || DEFAULT_MODEL[provider];
  if (!model) return { state: "misconfigured", reason: "no model for the selected provider" };
  const brainSources = new Set(
    (env[`WORLD_ANALYST_BRAIN_SOURCES_${name}`] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const cap = Number(env.WORLD_ANALYST_DAILY_CAP);
  return { state: "on", provider, model, key, baseUrl: testBaseUrl(env) ?? BASE_URL[provider], brainSources, dailyCap: Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP };
}
