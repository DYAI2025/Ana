/**
 * Popular Substack newsletters whose public RSS feeds Ana's office reads, to see which of her topics newsletters that
 * people pay for write about. Ben's decision of 2026-11-04: RSS feeds only, because Substack's terms (2026-10-06) forbid
 * crawling or scraping the site; a feed is published for feed readers.
 *
 * Picked once from Substack's Travel leaderboards of 2026-11-04 ("Rising" = fastest-growing paid subscriptions,
 * "Bestseller" = highest paid revenue): six whose recent posts speak to Ana's topics (core), and two broad travel
 * newsletters as a check (control): if those touch Ana's topics as often as the core ones, the matching sees her topics
 * everywhere and is not worth much. Topic counts use the core newsletters only. A feed carries no likes or reads, so a
 * hit says "a paid newsletter writes about this", never "this post did well".
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
/** the window: today and the 29 days before it (UTC days) */
export const NEWSLETTER_DAYS = 30;

export interface NewsletterHit {
  /** NewsletterFeed.id */
  feed: string;
  title: string;
  url: string;
  /** publication day (YYYY-MM-DD) */
  date: string;
}

/** One topic over the core newsletters: counted over every post in the window; `hits` is only the newest few. */
export interface NewsletterTopic {
  posts: number;
  /** ids of the core newsletters that wrote about it */
  feeds: string[];
  hits: NewsletterHit[];
}

export interface NewsletterCheck {
  feeds: number;
  checked: number;
  matched: number;
}

/** the check line needs at least this many checked posts on each side */
export const NEWSLETTER_CHECK_MIN = 10;

export interface WorldNewsletters {
  state: "on" | "off";
  /** the last successful read of any feed (ISO) */
  read_at: string | null;
  /** core newsletters in the list, and those read at least once (the denominator of every topic count) */
  feeds: number;
  feeds_read: number;
  /** core feeds whose latest read failed */
  feeds_failing: number;
  /** the counts cover the posts from this day on (YYYY-MM-DD); null = the whole window */
  since: string | null;
  /** posts in the window (all feeds), checked by the model, waiting for a retry, given up after repeated failures */
  posts: number;
  checked: number;
  failing: number;
  unreadable: number;
  /** every post in the window is checked and no core feed is failing: only then may a topic say "none wrote about it" */
  complete: boolean;
  /** the check: feeds read, checked posts and those with at least one topic, core against control */
  check: { core: NewsletterCheck; control: NewsletterCheck };
  /** per office topic (core newsletters only) */
  topics: Record<string, NewsletterTopic>;
  /** the stored readings could not be loaded: nothing is read until that is fixed */
  store_error: boolean;
}

export const NEWSLETTERS_OFF: WorldNewsletters = {
  state: "off",
  read_at: null,
  feeds: NEWSLETTER_FEEDS.filter((f) => f.role === "core").length,
  feeds_read: 0,
  feeds_failing: 0,
  since: null,
  posts: 0,
  checked: 0,
  failing: 0,
  unreadable: 0,
  complete: false,
  check: { core: { feeds: 0, checked: 0, matched: 0 }, control: { feeds: 0, checked: 0, matched: 0 } },
  topics: {},
  store_error: false,
};

export function feedName(id: string): string {
  return NEWSLETTER_FEEDS.find((f) => f.id === id)?.name ?? id;
}
