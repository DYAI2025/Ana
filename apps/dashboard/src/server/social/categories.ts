import "server-only";
import type { SocialCategories, SocialPost } from "@/features/social/types";
import { readTags, type PostTagger } from "@/server/world/tagger";

/**
 * The cockpit's post categories (ANA-60): the Haiku readings the world keeps (src/server/world/tagger.ts, Ana's consent
 * of 2026-11-02), not a second classifier. Only the theme and the model's confidence of the snapshot's own posts are
 * handed on; the caption never leaves the server through this path. The client applies TAG_MIN_CONFIDENCE.
 */

export const CATEGORIES_OFF: SocialCategories = { state: "off", tags: {} };

function pick(posts: readonly SocialPost[], all: Readonly<Record<string, { theme: SocialCategories["tags"][string]["theme"]; confidence: number }>>): SocialCategories["tags"] {
  const out: Record<string, { theme: SocialCategories["tags"][string]["theme"]; confidence: number }> = {};
  for (const p of posts) {
    const t = all[p.media_id];
    if (t) out[p.media_id] = { theme: t.theme, confidence: t.confidence };
  }
  return out;
}

/**
 * With the tagger on, the snapshot's untagged posts are queued for the same background reader the world uses (a few
 * per read, never waited for) and the stored categories are read before answering, so a fresh restart does not show
 * every post as "not categorised".
 */
export async function cockpitCategories(posts: readonly SocialPost[], tagger: PostTagger | null): Promise<SocialCategories> {
  if (!tagger) return CATEGORIES_OFF;
  tagger.schedule(posts.map((p) => ({ id: p.media_id, cover: p.thumbnail_url ?? p.image_url ?? null, caption: p.caption })));
  await tagger.loaded();
  return { state: "on", tags: pick(posts, tagger.current()) };
}

/** e2e only: synthetic stored categories from a file (read through the same checks as the real store). */
export async function e2eCategories(posts: readonly SocialPost[], file: string): Promise<SocialCategories> {
  return { state: "on", tags: pick(posts, await readTags(file)) };
}
