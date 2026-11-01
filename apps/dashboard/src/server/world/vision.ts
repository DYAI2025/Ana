import "server-only";
import { COLOR_RE, isAnaLook, lighten, parseColor, type AnaLookId, type OutfitColors } from "@/features/world/looks";

/**
 * Ana's look from the cover image of her newest post, read by a Claude vision model (Anthropic API). On Ana's request
 * (2026-11-01). Only the cover image of the newest post is sent, never the caption; only the answer (a look from the
 * catalogue and two outfit colours) is kept, in memory, per post. Off unless ANTHROPIC_API_KEY is set on the server;
 * WORLD_VISION_MODEL picks the model (default claude-haiku-5-5).
 */

export interface VisionConfig {
  key: string;
  model: string;
  timeoutMs: number;
}

export interface VisionLook {
  look: AnaLookId | null;
  colors: OutfitColors | null;
  /** the model's own confidence (0..1) */
  confidence: number;
}

const API = "https://api.anthropic.com/v1/messages";
const ALLOWED_HOSTS = [/\.cdninstagram\.com$/i, /\.fbcdn\.net$/i];
const MAX_BYTES = 3_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function visionConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): VisionConfig | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key || key.length < 20) return null;
  const model = env.WORLD_VISION_MODEL?.trim() || "claude-haiku-5-5";
  if (!/^[a-z0-9.-]{3,64}$/.test(model)) return null;
  return { key, model, timeoutMs: 20_000 };
}

/** Only Meta's own image CDN over https: the URL comes from the worker, but this server fetches it. */
export function allowedCoverUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return null;
    return ALLOWED_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

export const PROMPT = `This is the cover image of an Instagram post by Ana, a travel content creator (a young woman with long wavy brown hair).
Answer with one JSON object and nothing else:
{"ana_visible": true|false, "look": "scooter"|"mermaid"|"none", "outfit_primary": "#rrggbb"|null, "outfit_secondary": "#rrggbb"|null, "confidence": 0.0-1.0}
- ana_visible: Ana (the main woman in the picture) can be seen.
- look: "scooter" if she rides or sits on a scooter, moped or motorbike; "mermaid" if she is dressed as a mermaid; otherwise "none".
- outfit_primary / outfit_secondary: the two main colours of the clothes she wears (not skin, hair, background, text or objects). null when not visible.
- confidence: how sure you are about look and colours together.`;

/** The model's answer, checked: anything malformed is null. */
export function parseVisionAnswer(text: string): VisionLook | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const confidence = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
  if (confidence === null || o.ana_visible !== true) return null;
  const look = o.look === "none" ? null : isAnaLook(o.look) && o.look !== "everyday" ? o.look : null;
  const p = typeof o.outfit_primary === "string" ? o.outfit_primary.toLowerCase() : "";
  const s = typeof o.outfit_secondary === "string" ? o.outfit_secondary.toLowerCase() : "";
  const primary = COLOR_RE.test(p) ? parseColor(p) : null;
  const secondary = COLOR_RE.test(s) ? parseColor(s) : null;
  return { look, colors: primary === null ? null : { primary, secondary: secondary ?? lighten(primary) }, confidence };
}

/** The body, read up to MAX_BYTES: null when larger, undefined when the read failed (network, timeout). */
async function readCapped(r: Response): Promise<Uint8Array | null | undefined> {
  if (!r.body) return null;
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface VisionReader {
  /** the answer for one post's cover image; cached per post (a "nothing clear" answer too) */
  read(postId: string, coverUrl: string | null): Promise<VisionLook | null>;
}

export function createVisionReader(config: VisionConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): VisionReader {
  const cache = new Map<string, VisionLook | null>();
  const inFlight = new Map<string, Promise<VisionLook | null>>();
  // after a failed call the same post is tried again at the earliest 10 minutes later
  const failedAt = new Map<string, number>();

  async function call(url: URL): Promise<VisionLook | null | undefined> {
    let image: Response;
    try {
      image = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(8_000) });
    } catch {
      return undefined;
    }
    if (!image.ok) return undefined;
    const type = (image.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!IMAGE_TYPES.has(type)) return null;
    if (Number(image.headers.get("content-length") ?? "0") > MAX_BYTES) return null;
    const bytes = await readCapped(image);
    if (bytes === undefined) return undefined;
    if (bytes === null || bytes.length === 0) return null;
    let r: Response;
    try {
      r = await fetchImpl(API, {
        method: "POST",
        headers: { "x-api-key": config.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          // the answer is one short JSON object; without this Haiku 5.5 spends the budget on thinking blocks
          max_tokens: 400,
          thinking: { type: "disabled" },
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: type, data: Buffer.from(bytes).toString("base64") } }, { type: "text", text: PROMPT }] }],
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      return undefined;
    }
    if (!r.ok) return undefined;
    try {
      const body = (await r.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      return parseVisionAnswer(text);
    } catch {
      return undefined;
    }
  }

  return {
    async read(postId, raw) {
      if (cache.has(postId)) return cache.get(postId) ?? null;
      const url = allowedCoverUrl(raw);
      if (!url) return null;
      const failed = failedAt.get(postId);
      if (failed !== undefined && now() - failed < 10 * 60_000) return null;
      let p = inFlight.get(postId);
      if (!p) {
        p = call(url)
          .catch((): undefined => undefined)
          .then((v) => {
            if (v === undefined) {
              failedAt.set(postId, now());
              return null;
            }
            failedAt.delete(postId);
            if (cache.size >= 24) cache.delete(cache.keys().next().value as string);
            cache.set(postId, v);
            return v;
          })
          .finally(() => inFlight.delete(postId));
        inFlight.set(postId, p);
      }
      return p;
    },
  };
}
