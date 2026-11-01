// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveLook } from "@/features/world/looks";
import { allowedCoverUrl, createVisionReader, parseVisionAnswer, PROMPT, visionConfigFromEnv } from "./vision";

const config = { key: "sk-ant-unit-test-key-0123456789", model: "claude-haiku-5-5", timeoutMs: 1000 };
const COVER = "https://scontent-fra5-1.cdninstagram.com/v/t51/cover.jpg?stp=x";

function fakeFetch(answer: string, calls: Array<{ url: string; body?: unknown; headers?: Record<string, string> }>, imageType = "image/jpeg"): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers as Record<string, string> | undefined });
    if (url.startsWith("https://api.anthropic.com/")) return Response.json({ content: [{ type: "text", text: answer }] });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { headers: { "content-type": imageType } });
  }) as typeof fetch;
}

describe("visionConfigFromEnv", () => {
  it("is off without a key and defaults to Haiku 5.5", () => {
    expect(visionConfigFromEnv({})).toBeNull();
    expect(visionConfigFromEnv({ ANTHROPIC_API_KEY: "short" })).toBeNull();
    expect(visionConfigFromEnv({ ANTHROPIC_API_KEY: config.key })?.model).toBe("claude-haiku-5-5");
    expect(visionConfigFromEnv({ ANTHROPIC_API_KEY: config.key, WORLD_VISION_MODEL: "claude-sonnet-5-5" })?.model).toBe("claude-sonnet-5-5");
    expect(visionConfigFromEnv({ ANTHROPIC_API_KEY: config.key, WORLD_VISION_MODEL: "x y" })).toBeNull();
  });
});

describe("parseVisionAnswer", () => {
  it("takes a look from the catalogue and two colours", () => {
    expect(parseVisionAnswer('{"ana_visible": true, "look": "scooter", "outfit_primary": "#F4F4F0", "outfit_secondary": "#2B2B2B", "confidence": 0.8}')).toEqual({ look: "scooter", colors: { primary: 0xf4f4f0, secondary: 0x2b2b2b }, confidence: 0.8 });
    expect(parseVisionAnswer('Sure: {"ana_visible": true, "look": "none", "outfit_primary": "#aa2233", "outfit_secondary": null, "confidence": 0.7}')?.look).toBeNull();
  });

  it("refuses anything outside the contract", () => {
    expect(parseVisionAnswer('{"ana_visible": false, "look": "scooter", "outfit_primary": "#ffffff", "confidence": 0.9}')).toBeNull();
    expect(parseVisionAnswer('{"ana_visible": true, "look": "dragon", "outfit_primary": "red", "confidence": 0.9}')).toEqual({ look: null, colors: null, confidence: 0.9 });
    expect(parseVisionAnswer('{"ana_visible": true, "look": "scooter", "confidence": 3}')).toBeNull();
    expect(parseVisionAnswer("no json")).toBeNull();
  });
});

describe("createVisionReader", () => {
  it("sends only the cover image (never a caption) and caches the answer per post", async () => {
    const calls: Array<{ url: string; body?: unknown; headers?: Record<string, string> }> = [];
    const reader = createVisionReader(config, fakeFetch('{"ana_visible": true, "look": "mermaid", "outfit_primary": "#2fa39a", "outfit_secondary": "#f6c6d0", "confidence": 0.9}', calls));
    const a = await reader.read("p1", COVER);
    expect(await reader.read("p1", COVER)).toEqual(a);
    expect(a?.look).toBe("mermaid");
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["scontent-fra5-1.cdninstagram.com", "api.anthropic.com"]);
    const api = calls[1];
    expect(api?.headers?.["x-api-key"]).toBe(config.key);
    const body = api?.body as { model: string; messages: Array<{ content: Array<{ type: string; text?: string; source?: { media_type: string } }> }> };
    expect(body.model).toBe("claude-haiku-5-5");
    expect((body as unknown as { thinking: unknown }).thinking).toEqual({ type: "disabled" });
    const parts = body.messages[0]?.content ?? [];
    expect(parts.map((p) => p.type)).toEqual(["image", "text"]);
    expect(parts[1]?.text).toBe(PROMPT);
  });

  it("never fetches outside Meta's CDN and does not hammer after a failure", async () => {
    const calls: Array<{ url: string }> = [];
    let t = 0;
    const failing = (async (input: string | URL | Request) => {
      calls.push({ url: String(input) });
      throw new Error("offline");
    }) as typeof fetch;
    const reader = createVisionReader(config, failing, () => t);
    expect(await reader.read("p2", "https://evil.example/a.jpg")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await reader.read("p3", COVER)).toBeNull();
    expect(await reader.read("p3", COVER)).toBeNull();
    expect(calls).toHaveLength(1);
    t += 11 * 60_000;
    await reader.read("p3", COVER);
    expect(calls).toHaveLength(2);
    expect(allowedCoverUrl("http://x.cdninstagram.com/a.jpg")).toBeNull();
    expect(allowedCoverUrl("https://cdninstagram.com.evil.example/a.jpg")).toBeNull();
  });

  it("does not send a body that is not an image", async () => {
    const calls: Array<{ url: string }> = [];
    const reader = createVisionReader(config, fakeFetch("{}", calls, "text/html"));
    expect(await reader.read("p4", COVER)).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("resolveLook with the image", () => {
  const post = { id: "p", published_at: "2026-10-29T10:00:00.000Z", permalink: null, caption: "a quiet morning" };
  it("uses the image when the caption says nothing and the model is sure enough", () => {
    const l = resolveLook(post, null, { look: "scooter", colors: { primary: 0xf4f4f0, secondary: 0x2b2b2b }, confidence: 0.8 }, "on");
    expect(l).toMatchObject({ look: "scooter", look_source: "image", color_source: "image", image_confidence: 0.8, image_reader: "on" });
  });
  it("ignores an unsure answer and lets the caption win", () => {
    expect(resolveLook(post, null, { look: "scooter", colors: { primary: 1, secondary: 2 }, confidence: 0.4 }, "on")).toMatchObject({ look: "everyday", look_source: "default", color_source: "default" });
    expect(resolveLook({ ...post, caption: "my mermaid costume" }, null, { look: "scooter", colors: { primary: 1, secondary: 2 }, confidence: 0.9 }, "on")).toMatchObject({ look: "mermaid", look_source: "caption", color_source: "image" });
  });
});

describe("createVisionReader — failures stay recoverable", () => {
  it("a body that fails mid-read neither sticks nor caches, and is tried again after the back-off", async () => {
    let t = 0;
    let calls = 0;
    const flaky = (async (input: string | URL | Request) => {
      calls++;
      if (String(input).startsWith("https://api.anthropic.com/")) return Response.json({ content: [{ type: "text", text: '{"ana_visible": true, "look": "none", "outfit_primary": "#123456", "outfit_secondary": null, "confidence": 0.9}' }] });
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.error(new Error("reset"));
        },
      });
      return new Response(body, { headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch;
    const reader = createVisionReader(config, flaky, () => t);
    expect(await reader.read("p9", COVER)).toBeNull();
    expect(calls).toBe(1);
    t += 11 * 60_000;
    await reader.read("p9", COVER);
    expect(calls).toBe(2);
  });

  it("refuses an image above 3 MB by its declared length", async () => {
    let api = 0;
    const big = (async (input: string | URL | Request) => {
      if (String(input).startsWith("https://api.anthropic.com/")) api++;
      return new Response(new Uint8Array(10), { headers: { "content-type": "image/jpeg", "content-length": String(4_000_000) } });
    }) as typeof fetch;
    expect(await createVisionReader(config, big).read("p10", COVER)).toBeNull();
    expect(api).toBe(0);
  });
});
