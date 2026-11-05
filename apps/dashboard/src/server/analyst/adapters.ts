import "server-only";
import type { AnalystOn, Provider } from "./config";

/**
 * One adapter per provider, each with its own request and answer shape, written against the provider's documentation
 * as read on 2026-11-04:
 *
 * - Anthropic Messages API, platform.claude.com/docs (anthropic-version 2026-10-21; Haiku 5.5's adaptive thinking stays
 *   on and counts into max_tokens, effort "low" keeps it short; stop_reason is checked before the content)
 * - OpenAI Chat Completions, platform.openai.com/docs/api-reference/chat
 * - OpenRouter, openrouter.ai/docs/guides/routing/provider-selection and /docs/api-reference/errors (an upstream error
 *   can arrive inside a 200, next to partial content)
 *
 * No SDK, as in server/world/vision.ts: this repository calls providers with fetch and has no SDK dependency. Exactly
 * one request, no retry, no fallback. What a provider says on failure stays here: the caller gets a reason only.
 * Only the Anthropic adapter has a real call planned (after the G4 approvals); the other two stay proved against their
 * documentation only.
 */
export type ProviderFailure = "timeout" | "rate_limited" | "refused" | "truncated" | "invalid" | "failed";
export type ProviderResult = { ok: true; text: string } | { ok: false; reason: ProviderFailure };

export interface Prompt {
  system: string;
  user: string;
}

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 2000;

const failed = (reason: ProviderFailure): ProviderResult => ({ ok: false, reason });

/** one POST; returns the parsed JSON or the failure, never the provider's text */
async function post(url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch): Promise<{ json: unknown } | { failure: ProviderResult }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return { failure: failed(timedOut ? "timeout" : "failed") };
  }
  if (response.status === 429) return { failure: failed("rate_limited") };
  if (!response.ok) return { failure: failed("failed") };
  try {
    return { json: await response.json() };
  } catch {
    return { failure: failed("invalid") };
  }
}

interface AnthropicAnswer {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
}

async function anthropic(config: AnalystOn, prompt: Prompt, fetchImpl: typeof fetch): Promise<ProviderResult> {
  const result = await post(
    `${config.baseUrl}/v1/messages`,
    { "x-api-key": config.key, "anthropic-version": "2026-10-21" },
    { model: config.model, max_tokens: MAX_OUTPUT_TOKENS, system: prompt.system, messages: [{ role: "user", content: prompt.user }], output_config: { effort: "low" } },
    fetchImpl,
  );
  if ("failure" in result) return result.failure;
  const answer = result.json as AnthropicAnswer;
  if (answer?.stop_reason === "max_tokens") return failed("truncated");
  if (answer?.stop_reason === "refusal") return failed("refused");
  if (answer?.stop_reason !== "end_turn") return failed("invalid");
  const text = (Array.isArray(answer.content) ? answer.content : [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  return text ? { ok: true, text } : failed("invalid");
}

interface ChatAnswer {
  choices?: Array<{ finish_reason?: string; error?: unknown; message?: { content?: string | null; refusal?: string | null } }>;
}

async function openai(config: AnalystOn, prompt: Prompt, fetchImpl: typeof fetch): Promise<ProviderResult> {
  const result = await post(
    `${config.baseUrl}/v1/chat/completions`,
    { authorization: `Bearer ${config.key}` },
    {
      model: config.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    },
    fetchImpl,
  );
  if ("failure" in result) return result.failure;
  const choice = (result.json as ChatAnswer)?.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") return failed("refused");
  if (choice?.finish_reason === "length") return failed("truncated");
  if (choice?.finish_reason !== "stop") return failed("invalid");
  const text = choice.message?.content?.trim();
  return text ? { ok: true, text } : failed("invalid");
}

async function openrouter(config: AnalystOn, prompt: Prompt, fetchImpl: typeof fetch): Promise<ProviderResult> {
  const result = await post(
    `${config.baseUrl}/v1/chat/completions`,
    { authorization: `Bearer ${config.key}` },
    {
      model: config.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      // no provider that keeps the data, and no silent move to another one
      provider: { data_collection: "deny", allow_fallbacks: false },
    },
    fetchImpl,
  );
  if ("failure" in result) return result.failure;
  const choice = (result.json as ChatAnswer)?.choices?.[0];
  if (choice?.error || choice?.finish_reason === "error") return failed("failed");
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") return failed("refused");
  if (choice?.finish_reason === "length") return failed("truncated");
  if (choice?.finish_reason !== "stop") return failed("invalid");
  const text = choice.message?.content?.trim();
  return text ? { ok: true, text } : failed("invalid");
}

const ADAPTERS: Record<Provider, (config: AnalystOn, prompt: Prompt, fetchImpl: typeof fetch) => Promise<ProviderResult>> = { anthropic, openai, openrouter };

export function callProvider(config: AnalystOn, prompt: Prompt, fetchImpl: typeof fetch = fetch): Promise<ProviderResult> {
  return ADAPTERS[config.provider](config, prompt, fetchImpl);
}
