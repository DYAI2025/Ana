/**
 * Popular Substack newsletters whose public RSS feeds Ana's office reads, to see which of her topics newsletters that
 * people pay for write about. Ben's decision of 2026-11-04: RSS feeds only, because Substack's terms (2026-10-06) forbid
 * crawling or scraping the site; a feed is published for feed readers.
 *
 * Picked once from Substack's Travel leaderboards of 2026-11-04 ("Rising" = fastest-growing paid subscriptions,
 * "Bestseller" = highest paid revenue): six whose recent posts speak to Ana's topics, and two broad travel newsletters
 * as a check: if those match Ana's topics as often as the others, the matching sees her topics everywhere and is not
 * worth much. A feed carries no likes or reads, so a hit says "a paid newsletter writes about this", never "this post
 * did well".
 */

export interface NewsletterFeed {
  id: string;
  name: string;
  /** the publication's host; the feed is https://<host>/feed */
  host: string;
  /** where it was found */
  board: "travel-rising" | "travel-bestseller";
  /** core = writes about Ana's topics; control = broad travel, the check */
  role: "core" | "control";
}

export const NEWSLETTER_FEEDS: readonly NewsletterFeed[] = [
  { id: "travel-creator-gigs", name: "Travel Creator Gigs", host: "travelcreatorgigs.substack.com", board: "travel-rising", role: "core" },
  { id: "jet-plane-crew", name: "Jet Plane Crew", host: "jetplanecrew.substack.com", board: "travel-bestseller", role: "core" },
  { id: "life-unscripted", name: "Life Unscripted", host: "millieameliacreates.substack.com", board: "travel-rising", role: "core" },
  { id: "different-way", name: "Different Way", host: "gdarusa.substack.com", board: "travel-rising", role: "core" },
  { id: "borderless-living", name: "Borderless Living", host: "www.borderlessliving.com", board: "travel-bestseller", role: "core" },
  { id: "twice-over", name: "Twice Over", host: "rheaandnick.substack.com", board: "travel-rising", role: "core" },
  { id: "club-yolo", name: "Club Yolo", host: "yolojournal.substack.com", board: "travel-bestseller", role: "control" },
  { id: "so-theres-this-place", name: "So there's this place…", host: "sotheresthisplace.substack.com", board: "travel-bestseller", role: "control" },
];

/** the day the list was picked from the leaderboards */
export const NEWSLETTERS_PICKED = "2026-11-04";
/** posts older than this are not counted */
export const NEWSLETTER_DAYS = 30;

export interface NewsletterHit {
  /** NewsletterFeed.id */
  feed: string;
  title: string;
  url: string;
  /** publication day (YYYY-MM-DD) */
  date: string;
}

export interface WorldNewsletters {
  state: "on" | "off";
  /** when the last feed was read */
  read_at: string | null;
  /** feeds in the list and feeds whose last read worked */
  feeds: number;
  feeds_ok: number;
  /** posts of the last NEWSLETTER_DAYS days, and how many of them the model has matched to topics */
  posts: number;
  read: number;
  /** posts per office topic, newest first */
  topics: Record<string, NewsletterHit[]>;
  /** posts whose matching failed and that wait for their retry */
  failing: number;
}

export const NEWSLETTERS_OFF: WorldNewsletters = { state: "off", read_at: null, feeds: NEWSLETTER_FEEDS.length, feeds_ok: 0, posts: 0, read: 0, topics: {}, failing: 0 };

export function feedName(id: string): string {
  return NEWSLETTER_FEEDS.find((f) => f.id === id)?.name ?? id;
}

/** How many posts and which newsletters (names, in first-seen order) wrote about one topic. */
export function newsletterSummary(hits: readonly NewsletterHit[] | undefined): { posts: number; names: string[] } {
  const list = hits ?? [];
  return { posts: list.length, names: [...new Set(list.map((h) => feedName(h.feed)))] };
}
