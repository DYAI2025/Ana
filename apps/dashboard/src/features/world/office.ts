/**
 * Ana's office: topics people outside talk about (Reddit, YouTube, last 30 days) next to how Ana's own audience saves and
 * shares her posts on those topics. Each topic is a HYPOTHESIS for Substack, not a finding: the outside evidence says
 * people discuss it, the save+share index says whether Ana's audience keeps posts about it. Revenue is proven only by a
 * real post or newsletter test.
 *
 * The first catalog is the last30days test run of 2026-11-04 (Ben's go, same day); the automatic search that refreshes
 * it is a later step. Every number here comes from that run and was spot-checked against an independent Reddit archive.
 */

import type { WorldPost } from "./model";
import type { WorldPostHistory } from "./types";

export type OfficeLane = "opportunities" | "templates" | "stories";
export type OfficeQuadrant = "starter" | "test" | "niche" | "skip";

export interface OfficeEvidence {
  source: "reddit" | "youtube";
  /** forum or platform, e.g. "r/solotravel" */
  where: string;
  title: string;
  url: string;
  /** publication day (YYYY-MM-DD) */
  date: string;
  /** upvotes (Reddit) or likes (YouTube) */
  up: number;
  comments: number;
  views?: number;
}

export interface OfficeTopic {
  id: string;
  lane: OfficeLane;
  /** what the topic covers, in English: shown to the model that matches Ana's posts to it */
  about: string;
  evidence: readonly OfficeEvidence[];
}

// generated from the last30days test run of 2026-11-04 (Reddit + YouTube, last 30 days); see docs in PR
export const OFFICE_TOPICS: readonly OfficeTopic[] = [
  {
    id: "work-anywhere-jobs",
    lane: "opportunities",
    about: "Finding jobs that can truly be done from anywhere (not \"remote, US only\"), job boards, avoiding fake or ghost job posts.",
    evidence: [
      { source: "reddit", where: "r/RemoteJobs", title: "Where to look for truly remote jobs that allow u to work from anywhere?", url: "https://www.reddit.com/r/RemoteJobs/comments/1x2d1so/", date: "2026-10-10", up: 225, comments: 137 },
      { source: "reddit", where: "r/digitalnomad", title: "Are there truly any jobs that let you work remotely from anywhere these days?", url: "https://www.reddit.com/r/digitalnomad/comments/1x1y2we/", date: "2026-10-09", up: 25, comments: 169 },
      { source: "reddit", where: "r/remotework", title: "I got tired of ghost postings and aggregator spam, so I built a remote job board that re-verifies every listing against the employer's own site, daily", url: "https://www.reddit.com/r/remotework/comments/1x9hu5c/", date: "2026-10-18", up: 32, comments: 10 },
    ],
  },
  {
    id: "entry-level-remote",
    lane: "opportunities",
    about: "Entry-level online or remote work for beginners: what kinds of jobs exist and how to get accepted.",
    evidence: [
      { source: "reddit", where: "r/WorkOnline", title: "What kinda entry level remote jobs are out there?", url: "https://www.reddit.com/r/WorkOnline/comments/1xgjo7g/", date: "2026-10-27", up: 85, comments: 308 },
      { source: "reddit", where: "r/WorkOnline", title: "Anyone else finding it harder to get accepted for remote data entry jobs lately?", url: "https://www.reddit.com/r/WorkOnline/comments/1x49ghf/", date: "2026-10-12", up: 31, comments: 300 },
      { source: "reddit", where: "r/remotework", title: "3yrs looking for a remote job, still nothing.", url: "https://www.reddit.com/r/remotework/comments/1xm40wv/", date: "2026-11-02", up: 2, comments: 4 },
    ],
  },
  {
    id: "ugc-gigs",
    lane: "opportunities",
    about: "Paid UGC (user-generated content) gigs and brand collaborations: where to find them and what they pay.",
    evidence: [
      { source: "reddit", where: "r/ugc", title: "Looking for a UGC Creator - $500/month + Bonuses up to $3,000", url: "https://www.reddit.com/r/ugc/comments/1xb6pb1/", date: "2026-10-20", up: 27, comments: 37 },
      { source: "reddit", where: "r/UGCcreators", title: "where are you all finding ugc gigs?", url: "https://www.reddit.com/r/UGCcreators/comments/1wzd6si/", date: "2026-10-06", up: 34, comments: 37 },
      { source: "reddit", where: "r/ContentCreators", title: "Looking for a Tech UGC Creator", url: "https://www.reddit.com/r/ContentCreators/comments/1xcaxwb/", date: "2026-10-22", up: 5, comments: 15 },
      { source: "reddit", where: "r/UGCcreators", title: "Ugc referrals?", url: "https://www.reddit.com/r/UGCcreators/comments/1xmx0lx/", date: "2026-11-03", up: 1, comments: 3 },
    ],
  },
  {
    id: "ugc-beginner-income",
    lane: "opportunities",
    about: "What a beginner creator can realistically earn and charge (UGC rates, first income, pricing).",
    evidence: [
      { source: "reddit", where: "r/UGCcreators", title: "Can I make 1k on UGC a month? small creator.", url: "https://www.reddit.com/r/UGCcreators/comments/1xm5vxl/", date: "2026-11-02", up: 3, comments: 18 },
      { source: "reddit", where: "r/UGCcreators", title: "How Much Should a Beginner UGC Creator Charge?", url: "https://www.reddit.com/r/UGCcreators/comments/1xngkit/", date: "2026-11-04", up: 4, comments: 2 },
      { source: "youtube", where: "YouTube", title: "UGC Creator Rates: The Real Numbers Brands Pay in 2026", url: "https://www.youtube.com/watch?v=5hWWr_GbZEE", date: "2026-10-18", up: 0, comments: 0, views: 36 },
      { source: "reddit", where: "r/influencermarketing", title: "Does your creator outreach person also set commission rates?", url: "https://www.reddit.com/r/influencermarketing/comments/1xncjyy/", date: "2026-11-04", up: 1, comments: 1 },
    ],
  },
  {
    id: "ugc-portfolio",
    lane: "templates",
    about: "A creator portfolio or media kit that gets replies from brands.",
    evidence: [
      { source: "reddit", where: "r/UGCcreators", title: "The portfolio that got me brand replies in my first 3 days of UGC", url: "https://www.reddit.com/r/UGCcreators/comments/1xmqmqb/", date: "2026-11-03", up: 11, comments: 13 },
      { source: "reddit", where: "r/UGCcreators", title: "New UGC creator here, ex college student focusing on student tech 👋", url: "https://www.reddit.com/r/UGCcreators/comments/1xmnw7w/", date: "2026-11-03", up: 0, comments: 4 },
    ],
  },
  {
    id: "brand-pitch",
    lane: "templates",
    about: "Pitching brands: emails or messages to brands, outreach, getting a first collaboration.",
    evidence: [
      { source: "reddit", where: "r/UGCcreators", title: "My gf started UGC & emailing brands", url: "https://www.reddit.com/r/UGCcreators/comments/1x9xbgl/", date: "2026-10-19", up: 44, comments: 48 },
    ],
  },
  {
    id: "travel-budget",
    lane: "templates",
    about: "Travel budgets and route planning: what a long trip costs, budget breakdowns, itineraries.",
    evidence: [
      { source: "reddit", where: "r/solotravel", title: "One year solo travel budget + routes", url: "https://www.reddit.com/r/solotravel/comments/1xmls29/", date: "2026-11-03", up: 20, comments: 35 },
      { source: "reddit", where: "r/solotravel", title: "3-month solo trip around Asia. How would you change it?", url: "https://www.reddit.com/r/solotravel/comments/1xb3jde/", date: "2026-10-20", up: 35, comments: 101 },
    ],
  },
  {
    id: "quit-to-travel",
    lane: "stories",
    about: "Leaving a job or a settled life to travel, travelling in search of purpose, starting over abroad.",
    evidence: [
      { source: "reddit", where: "r/solotravel", title: "Quitting everything at 25 to solo travel in search of a sense of purpose – is it a good idea?", url: "https://www.reddit.com/r/solotravel/comments/1xlwo9b/", date: "2026-11-02", up: 301, comments: 226 },
      { source: "reddit", where: "r/SoloTravel_India", title: "Female Solo Travel at 40", url: "https://www.reddit.com/r/SoloTravel_India/comments/1xj9wuy/", date: "2026-10-30", up: 26, comments: 35 },
    ],
  },
  {
    id: "solo-lessons",
    lane: "stories",
    about: "What solo travel teaches you, how solo travel feels, reflections from travelling alone.",
    evidence: [
      { source: "reddit", where: "r/solotravel", title: "Has solo traveling taught you something?", url: "https://www.reddit.com/r/solotravel/comments/1xi0z3g/", date: "2026-10-28", up: 263, comments: 109 },
      { source: "reddit", where: "r/solotravel", title: "About the.. time-efficiency of solo travel, how do you guys fill your days compared to traveling in groups?", url: "https://www.reddit.com/r/solotravel/comments/1x19jnm/", date: "2026-10-09", up: 308, comments: 195 },
    ],
  },
  {
    id: "homesick",
    lane: "stories",
    about: "Homesickness, loneliness or hard days while travelling or living abroad.",
    evidence: [
      { source: "reddit", where: "r/solotravel", title: "Home sick solo travelling", url: "https://www.reddit.com/r/solotravel/comments/1xhczb0/", date: "2026-10-28", up: 18, comments: 39 },
    ],
  },
  {
    id: "nomad-income",
    lane: "opportunities",
    about: "How digital nomads earn money and what they really make; cost of living in nomad places.",
    evidence: [
      { source: "youtube", where: "YouTube", title: "Exposing How Much Digital Nomads Earn in Bali.", url: "https://www.youtube.com/watch?v=BPU5eAusJ_M", date: "2026-10-18", up: 304, comments: 29, views: 35066 },
      { source: "reddit", where: "r/digitalnomad", title: "Penang tops global ranking for budget-friendly digital nomad living", url: "https://www.reddit.com/r/digitalnomad/comments/1xj4fyc/", date: "2026-10-30", up: 91, comments: 43 },
    ],
  },
];

/** a new catalog (topics or their wording) makes the model read Ana's posts again */
export const OFFICE_VERSION = "2026-11-04.1";
/** the day the outside evidence was collected */
export const OFFICE_AS_OF = "2026-11-04";
export const OFFICE_SOURCE = "last30days (Reddit, YouTube)";
/** posts on a topic needed before Ana's audience counts as tested (same rule as the signals) */
export const OFFICE_MIN_N = 3;
/** save+share at least this many times her usual rate counts as confirmed (same "clearly" as the signals) */
export const OFFICE_CONFIRMED = 1.15;

export interface OfficePoint {
  /** 1-based, in the order of the list */
  n: number;
  id: string;
  lane: OfficeLane;
  quadrant: OfficeQuadrant;
  outside: {
    /** upvotes/likes + comments over all evidence */
    reactions: number;
    threads: number;
    forums: string[];
    /** at least as discussed as the median topic */
    high: boolean;
  };
  ana: {
    /** untested: fewer than OFFICE_MIN_N rated posts (or no usual rate); weak: tested, below OFFICE_CONFIRMED */
    state: "untested" | "weak" | "confirmed";
    /** Ana's posts on this topic with a measured save+share rate */
    n: number;
    /** median save+share rate of those posts ÷ her usual rate; null below OFFICE_MIN_N posts */
    index: number | null;
    /** the matching posts, best save+share first */
    posts: string[];
  };
}

export interface OfficeView {
  points: OfficePoint[];
  /** reactions of the median topic: the line between "high" and "low" outside */
  threshold: number;
  /** Ana's usual save+share rate (median over her posts), null when unknown */
  baseline: number | null;
  /** posts of the given list the model has read for topics (with or without a match) */
  read: number;
}

const medianOf = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

const ORDER: Record<OfficeQuadrant, number> = { starter: 0, test: 1, niche: 2, skip: 3 };

export function reactionsOf(t: OfficeTopic): number {
  return t.evidence.reduce((s, e) => s + e.up + e.comments, 0);
}

/**
 * Places every topic in the matrix. postTopics = topic ids per post as read by the model (null when the reader is off);
 * posts without a measured save+share rate never count.
 */
/**
 * The posts the office reads: the snapshot's (live numbers) and Ana's older posts from the history list (Ben,
 * 2026-11-05: her last 200), each post once; the snapshot wins where both have it.
 */
export function officePosts(posts: readonly WorldPost[], history: Pick<WorldPostHistory, "posts"> | null): WorldPost[] {
  const byId = new Map((history?.posts ?? []).map((h) => [h.id, h]));
  // a snapshot post the snapshot could not measure takes the history's numbers when those exist
  const out = posts.map((p) => {
    const h = byId.get(p.id);
    return p.ssr === null && h && h.ssr !== null ? { ...p, reach: h.reach, saves: h.saves, shares: h.shares, ssr: h.ssr } : p;
  });
  const known = new Set(posts.map((p) => p.id));
  for (const h of history?.posts ?? []) {
    if (known.has(h.id)) continue;
    known.add(h.id);
    out.push({ id: h.id, format: h.format, caption: null, permalink: null, published_at: h.published_at, reach: h.reach, views: null, saves: h.saves, shares: h.shares, interactions: null, likes: null, comments: null, counters_at: null, er: null, ssr: h.ssr, fresh: false, cover: h.cover, history: true });
  }
  return out;
}

export function officeView(topics: readonly OfficeTopic[], posts: ReadonlyArray<{ id: string; ssr: number | null }>, postTopics: Readonly<Record<string, readonly string[]>> | null): OfficeView {
  const threshold = medianOf(topics.map(reactionsOf)) ?? 0;
  const rated = posts.filter((p) => p.ssr !== null && Number.isFinite(p.ssr));
  const baseline = medianOf(rated.map((p) => p.ssr as number));
  const rows = topics.map((t) => {
    const reactions = reactionsOf(t);
    const mine = postTopics ? rated.filter((p) => Object.hasOwn(postTopics, p.id) && postTopics[p.id]?.includes(t.id)).sort((a, b) => (b.ssr as number) - (a.ssr as number)) : [];
    const med = medianOf(mine.map((p) => p.ssr as number));
    const index = mine.length >= OFFICE_MIN_N && med !== null && baseline ? med / baseline : null;
    const high = reactions >= threshold;
    const confirmed = index !== null && index >= OFFICE_CONFIRMED;
    const quadrant: OfficeQuadrant = high ? (confirmed ? "starter" : "test") : confirmed ? "niche" : "skip";
    return {
      id: t.id,
      lane: t.lane,
      quadrant,
      outside: { reactions, threads: t.evidence.length, forums: [...new Set(t.evidence.map((e) => e.where))], high },
      ana: { state: confirmed ? ("confirmed" as const) : index === null ? ("untested" as const) : ("weak" as const), n: mine.length, index, posts: mine.map((p) => p.id) },
    };
  });
  rows.sort((a, b) => ORDER[a.quadrant] - ORDER[b.quadrant] || b.outside.reactions - a.outside.reactions);
  return {
    points: rows.map((r, i) => ({ n: i + 1, ...r })),
    threshold,
    baseline,
    // only the posts in view: the store also keeps readings of older posts
    read: postTopics ? posts.filter((p) => Object.hasOwn(postTopics, p.id)).length : 0,
  };
}

/** The things in Ana's office room you can use (scene/officeRoom.ts); the register holds her internal rate card. */
export type RoomSpot = "board" | "computer" | "register" | "lamp";
export const ROOM_SPOTS: readonly RoomSpot[] = ["board", "computer", "register", "lamp"];

/** A topic on the board in the room: its number, quadrant and place inside the quadrant (0..1 from left / bottom). */
export interface BoardDot {
  n: number;
  quadrant: OfficeQuadrant;
  tested: boolean;
  x: number;
  y: number;
}
