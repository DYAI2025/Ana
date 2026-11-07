// @vitest-environment node
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "../../../e2e/fake-social/core.mjs";
import type { PostTags } from "@/features/world/postTags";
import type { PostTagger, TaggedPost } from "@/server/world/tagger";
import { CATEGORIES_OFF, cockpitCategories, e2eCategories } from "./categories";
import { normalizeSnapshot } from "./normalize";

vi.mock("server-only", () => ({}));

const posts = normalizeSnapshot(buildSnapshot()).posts;
const full = (theme: PostTags["theme"], confidence: number): PostTags => ({ theme, ana: "face", shot: "selfie", hook: "place", cta: "none", mood: "calm", country: "TH", brand: true, confidence });

function fakeTagger(tags: Record<string, PostTags>) {
  const scheduled: TaggedPost[][] = [];
  let loadedCalls = 0;
  const tagger: PostTagger = {
    current: () => tags,
    schedule: (p) => void scheduled.push([...p]),
    idle: () => Promise.resolve(),
    ready: () => true,
    loaded: () => {
      loadedCalls += 1;
      return Promise.resolve();
    },
  };
  return { tagger, scheduled, loadedCalls: () => loadedCalls };
}

describe("cockpit categories (ANA-60)", () => {
  it("no tagger (no model key) → off, nothing guessed", async () => {
    expect(await cockpitCategories(posts, null)).toEqual(CATEGORIES_OFF);
    expect(CATEGORIES_OFF).toEqual({ state: "off", tags: {} });
  });

  it("hands on only theme and confidence of the snapshot's own posts", async () => {
    const f = fakeTagger({ syn004: full("lifestyle", 0.9), syn008: full("food", 0.3), other: full("beach", 1) });
    const c = await cockpitCategories(posts, f.tagger);
    expect(c).toEqual({ state: "on", tags: { syn004: { theme: "lifestyle", confidence: 0.9 }, syn008: { theme: "food", confidence: 0.3 } } });
    // no country, brand, mood … and no caption reaches the browser through this path
    expect(JSON.stringify(c)).not.toMatch(/TH|brand|mood|caption/);
    expect(f.loadedCalls()).toBe(1);
  });

  it("queues the snapshot's posts for the same background reader the world uses", async () => {
    const f = fakeTagger({});
    await cockpitCategories(posts, f.tagger);
    expect(f.scheduled).toHaveLength(1);
    expect(f.scheduled[0]!.map((p) => p.id)).toEqual(posts.map((p) => p.media_id));
  });

  it("e2e: the synthetic stored file goes through the store's checks (an invalid record is dropped)", async () => {
    const c = await e2eCategories(posts, path.join(__dirname, "../../../e2e/fake-social/tags.json"));
    expect(c.state).toBe("on");
    expect(c.tags.syn004).toEqual({ theme: "lifestyle", confidence: 0.9 });
    expect(c.tags.syn008).toEqual({ theme: "food", confidence: 0.3 });
    expect(c.tags.syn013).toBeUndefined(); // theme off the list
    expect(c.tags.syn999).toBeUndefined(); // not in the snapshot
    expect(Object.keys(c.tags)).toHaveLength(19);
  });
});
