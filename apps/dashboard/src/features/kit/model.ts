/**
 * What the media kit shows (ANA-53), built on the server from the world snapshot and media-kit.json. Only aggregated
 * numbers, cover links and Ana's own content reach the page: never captions, Jira work or anything else of the world.
 *
 * Rules: a number Instagram did not return as VERIFIED is left out (never 0, never "—"); a section without content is
 * left out and named in `hidden` for the internal preview; nothing is written for Ana.
 */
import type { CanonicalMetric, Observation, SocialPost, SocialSnapshot } from "@/features/social/types";
import { shares } from "@/features/world/model";
import type { AudienceSeries, WhoSeries, WorldPayload } from "@/features/world/types";
import { PARTNER_KINDS, REEL_LABELS, type KitAddon, type KitCase, type KitConfig, type KitPackage, type KitReelLabel } from "./config";
import { project, type KitGeo, type KitLand } from "./map";
import { presetList, resolvePreset, type KitPreset, type KitSectionId, type KitTileId } from "./presets";

/** "percent" is 0..100 with one decimal, "share" a 0..1 share shown as a whole percent */
export type KitValueKind = "count" | "percent" | "seconds" | "share";

export interface KitTile {
  id: KitTileId;
  label: string;
  value: number;
  kind: KitValueKind;
  /** how the number is defined, shown small under it */
  note: string;
  /** the period or basis in a few words, for the hero where the full note does not fit; null when the label says it all */
  short: string | null;
}

export interface KitCountry {
  code: string;
  name: string;
  /** share of the countries Meta lists, 0..1 */
  share: number;
  focus: boolean;
}

export interface KitMarker {
  code: string;
  x: number;
  y: number;
  r: number;
  focus: boolean;
}

export interface KitAudience {
  basis: "engaged" | "followers";
  /** "Engaged accounts · this month" */
  basis_label: string;
  countries: KitCountry[];
  /** the share of the brand's markets among the listed countries; null without focus or without a match */
  focus: { label: string; share: number } | null;
  age: Array<{ key: string; share: number }>;
  gender: Array<{ key: string; label: string; share: number }>;
  /** whose ages and genders are shown; it can differ from the countries' basis when Meta did not return one */
  who_label: string | null;
  map: { land: KitLand; markers: KitMarker[] } | null;
}

export interface KitReel {
  id: string;
  cover: string | null;
  link: string | null;
  published_at: string | null;
  views: number | null;
  reach: number | null;
  watch_s: number | null;
  /** what the Reel is, as set in media-kit.json ("Brand partnership · Fiverr"); null when not set */
  label: string | null;
}

/** the typical Reel: medians over Reels old enough for their lifetime values to have settled */
export interface KitTypicalReel {
  views: number;
  reach: number;
  /** both medians are over the same Reels: those with a measured value for both */
  n: number;
  /** publishing dates of the Reels counted */
  from: string;
  to: string;
}

/** fewer Reels than this are no "typical" Reel */
export const MIN_TYPICAL = 5;

export type KitSection =
  | { id: "proof"; cases: KitCase[] }
  | { id: "numbers"; tiles: KitTile[] }
  | { id: "audience"; audience: KitAudience }
  | { id: "reels"; reels: KitReel[]; typical: KitTypicalReel | null }
  | { id: "packages"; packages: KitPackage[]; addons: KitAddon[] };

export interface KitModel {
  preset: { id: string; label: string };
  presets: Array<{ id: string; label: string }>;
  name: string;
  handle: string | null;
  tagline: string | null;
  hero: {
    covers: Array<{ id: string; src: string }>;
    tiles: KitTile[];
    /** the preset's markets as a share of the listed audience, e.g. 58 % in Asia-Pacific & India */
    /** basis: whose countries and when, e.g. "Engaged accounts · last 30 days" */
    signal: { share: number; label: string; basis: string } | null;
  };
  /** brands Ana has worked with and how, names only */
  partners: Array<{ name: string; kind: string | null; current: boolean }>;
  sections: KitSection[];
  contact: { href: string; label: string } | null;
  /** when Instagram measured the numbers; null without a snapshot */
  as_of: string | null;
  /** the snapshot is an older one because the last read failed */
  stale: boolean;
  /** measured within FRESH_MS and not stale: only then the page says "live" */
  fresh: boolean;
  /** what the internal preview says is not shown, and why */
  hidden: string[];
  /** ids of all case studies, for writing presets (internal preview only) */
  case_ids: string[];
  config_error: boolean;
}

/** a reading older than this is not called live */
export const FRESH_MS = 26 * 3_600_000;
/** a Reel's lifetime values count for the typical Reel once it is this old */
export const SETTLED_DAYS = 7;
const DAY_MS = 86_400_000;

/** the briefing a brand fills in, in the e-mail the button opens */
export const BRIEF_TEMPLATE = ["Brand:", "Campaign goal:", "Markets:", "Timing:", "Budget range:", "Deliverables you have in mind:"].join("\r\n");

const MAX_COUNTRIES = 8;
/** at most 6 of the brand's markets, so at least 2 countries elsewhere stay in the list of 8 */
const MAX_FOCUS = 6;
const MAX_REELS = 6;
const HERO_COVERS = 5;
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const GENDER_LABEL: Record<string, string> = { F: "Women", M: "Men", U: "Not stated" };

const verified = (list: readonly Observation[], metric: CanonicalMetric): number | null => {
  const o = list.find((x) => x.metric_name === metric && x.availability_state === "VERIFIED");
  return o && typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0 ? o.value : null;
};

function tiles(world: WorldPayload, snapshot: SocialSnapshot | null): Map<KitTileId, KitTile> {
  const out = new Map<KitTileId, KitTile>();
  const add = (id: KitTileId, label: string, value: number | null, kind: KitValueKind, note: string, short: string | null) => {
    if (value !== null && Number.isFinite(value) && value >= 0) out.set(id, { id, label, value, kind, note, short });
  };
  const account = snapshot?.account ?? [];
  const pulseFollowers = world.pulse.state === "ok" && typeof world.pulse.followers === "number" ? world.pulse.followers : null;
  add("followers", "Followers", pulseFollowers ?? verified(account, "followers"), "count", "Instagram followers", null);
  const reach = verified(account, "reach");
  const interactions = verified(account, "total_interactions");
  add("reach", "Accounts reached", reach, "count", "Unique accounts, last 28 days", "Last 28 days");
  add("views", "Views", verified(account, "views"), "count", "All content, last 28 days", "Last 28 days");
  add("engaged", "Accounts engaged", verified(account, "accounts_engaged"), "count", "Accounts that interacted, last 28 days", "Last 28 days");
  add("interactions", "Interactions", interactions, "count", "Likes, comments, saves and shares, last 28 days", "Last 28 days");
  // by reach, not by followers: the label says so, because brands often compare follower-based rates
  add("engagement", "Engagement rate (by reach)", reach && interactions !== null ? (interactions / reach) * 100 : null, "percent", "Interactions ÷ accounts reached, last 28 days", "Interactions ÷ reach, 28 days");
  const v = world.reel_viewing;
  if (v.state === "on") {
    add("watch", "Watch time per Reel", v.watch_ms === null ? null : v.watch_ms / 1000, "seconds", `Median of the average watch time, ${v.reels} recent Reels`, "Median, recent Reels");
    add("hold", "Stay past 3 seconds", v.skip_pct === null ? null : 100 - v.skip_pct, "percent", `Share of Reel views not skipped in the first 3 s, median of ${v.skip_reels} Reels`, "Median, recent Reels");
  }
  return out;
}

const timeframeLabel = (timeframe: string | null, week: boolean) => (week ? "last 7 days" : timeframe === "this_month" ? "last 30 days" : timeframe === "this_week" ? "last 7 days" : null);

function pickWho(world: WorldPayload, basis: "engaged" | "followers"): { who: WhoSeries; label: string } | null {
  const w = world.audience.who;
  const has = (s: WhoSeries) => shares(s.age).length > 0 || shares(s.gender).length > 0;
  const tf = world.audience.timeframe;
  const engagedMonth = { who: w.engaged_month, label: ["Engaged accounts", timeframeLabel(tf, false)].filter(Boolean).join(" · ") };
  const engagedWeek = { who: w.engaged_week, label: "Engaged accounts · last 7 days" };
  const followers = { who: w.follower, label: "Followers" };
  const order = basis === "followers" ? [followers, engagedMonth, engagedWeek] : [engagedMonth, engagedWeek, followers];
  return order.find((o) => has(o.who)) ?? null;
}

function audience(world: WorldPayload, preset: KitPreset, geo: KitGeo | null): KitAudience | null {
  if (world.audience.state !== "ok") return null;
  const a = world.audience;
  const tf = timeframeLabel(a.timeframe, false);
  const options: Array<{ basis: "engaged" | "followers"; series: AudienceSeries; label: string }> = [
    { basis: "engaged", series: a.engaged_country, label: ["Engaged accounts", tf].filter(Boolean).join(" · ") },
    { basis: "followers", series: a.follower_country, label: "Followers" },
  ];
  const chosen = (preset.lead === "followers" ? [options[1]!, options[0]!] : options).find((o) => shares(o.series).length > 0) ?? null;
  const focusSet = new Set(preset.focus);
  const regions = (() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  })();
  const name = (code: string) => {
    try {
      return regions?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const all = chosen
    ? shares(chosen.series)
        .map((r) => ({ code: r.key.toUpperCase(), name: name(r.key.toUpperCase()), share: r.share, focus: focusSet.has(r.key.toUpperCase()) }))
        .sort((x, y) => y.share - x.share)
    : [];
  // the brand's markets first (still by share), then the rest: two labelled groups, never a re-ranked list. Each group
  // is capped on its own, so the biggest countries elsewhere never drop out behind a long list of markets.
  const inFocus = all.filter((c) => c.focus).slice(0, MAX_FOCUS);
  const elsewhere = all.filter((c) => !c.focus);
  const countries = [...inFocus, ...elsewhere.slice(0, MAX_COUNTRIES - inFocus.length)];
  const focusShare = all.filter((c) => c.focus).reduce((s, c) => s + c.share, 0);
  const who = pickWho(world, chosen?.basis ?? preset.lead);
  const age = who
    ? shares(who.who.age)
        .filter((r) => AGE_ORDER.includes(r.key))
        .sort((x, y) => AGE_ORDER.indexOf(x.key) - AGE_ORDER.indexOf(y.key))
        .map((r) => ({ key: r.key, share: r.share }))
    : [];
  const gender = who
    ? shares(who.who.gender)
        .filter((r) => Object.hasOwn(GENDER_LABEL, r.key))
        .sort((x, y) => y.share - x.share)
        .map((r) => ({ key: r.key, label: GENDER_LABEL[r.key]!, share: r.share }))
    : [];
  if (!all.length && !age.length && !gender.length) return null;
  let map: KitAudience["map"] = null;
  if (geo && all.length) {
    const max = all[0]!.share;
    const markers = all
      .map((c) => {
        const at = geo.centroids.get(c.code);
        if (!at) return null;
        const p = project(at, geo.land);
        return { code: c.code, x: p.x, y: p.y, r: Math.round((3 + 11 * Math.sqrt(c.share / max)) * 10) / 10, focus: c.focus };
      })
      .filter((m): m is KitMarker => m !== null && m.y <= geo.land.height);
    map = { land: geo.land, markers };
  }
  return {
    basis: chosen?.basis ?? preset.lead,
    basis_label: chosen?.label ?? (who?.label ?? ""),
    countries,
    focus: preset.focus_label && focusShare > 0 ? { label: preset.focus_label, share: focusShare } : null,
    age,
    gender,
    who_label: who?.label ?? null,
    map,
  };
}

const httpsOrNull = (u: string | null | undefined, host?: RegExp): string | null => {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (!host || host.test(url.hostname)) ? url.toString() : null;
  } catch {
    return null;
  }
};

const labelText = (l: KitReelLabel | undefined): string | null => (l ? [REEL_LABELS[l.kind], l.brand].filter(Boolean).join(" · ") : null);

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Medians of views and reach over the Reels at least SETTLED_DAYS old: what a brand can expect, not the best Reel. */
export function typicalReel(snapshot: SocialSnapshot | null): KitTypicalReel | null {
  if (!snapshot) return null;
  const measuredAt = Date.parse(snapshot.observed_at);
  if (Number.isNaN(measuredAt)) return null;
  const settled = snapshot.posts.filter((p) => {
    const at = p.published_at ? Date.parse(p.published_at) : Number.NaN;
    return p.format === "reel" && !Number.isNaN(at) && measuredAt - at >= SETTLED_DAYS * DAY_MS;
  });
  // one set of Reels for both numbers, so one n and one date range describe both
  const counted = settled
    .map((p) => ({ at: p.published_at!, views: verified(p.observations, "views"), reach: verified(p.observations, "reach") }))
    .filter((x): x is { at: string; views: number; reach: number } => x.views !== null && x.reach !== null);
  if (counted.length < MIN_TYPICAL) return null;
  const dates = counted.map((x) => x.at).sort();
  return { views: median(counted.map((x) => x.views))!, reach: median(counted.map((x) => x.reach))!, n: counted.length, from: dates[0]!, to: dates.at(-1)! };
}

function toReel(p: SocialPost, labels: Readonly<Record<string, KitReelLabel>>): KitReel {
  const watch = verified(p.observations, "avg_watch_time");
  return {
    id: p.media_id,
    cover: httpsOrNull(p.thumbnail_url ?? p.image_url ?? null),
    link: httpsOrNull(p.permalink, /(^|\.)instagram\.com$/),
    published_at: p.published_at,
    views: verified(p.observations, "views"),
    reach: verified(p.observations, "reach"),
    watch_s: watch === null ? null : Math.round(watch / 100) / 10,
    label: labelText(Object.hasOwn(labels, p.media_id) ? labels[p.media_id] : undefined),
  };
}

function reels(snapshot: SocialSnapshot | null, preset: KitPreset, labels: Readonly<Record<string, KitReelLabel>>): KitReel[] {
  const reel = (p: SocialPost) => toReel(p, labels);
  const all = (snapshot?.posts ?? []).filter((p) => p.format === "reel");
  if (preset.reels.length) {
    const byId = new Map(all.map((p) => [p.media_id, p]));
    return preset.reels.map((id) => byId.get(id)).filter((p): p is SocialPost => Boolean(p)).slice(0, MAX_REELS).map(reel);
  }
  // Reels with measured views first, by views; Reels with only a reach after them, by reach (never one mixed ranking)
  const views = (p: SocialPost) => verified(p.observations, "views");
  const reach = (p: SocialPost) => verified(p.observations, "reach");
  return all
    .filter((p) => views(p) !== null || reach(p) !== null)
    .sort((x, y) => {
      const vx = views(x);
      const vy = views(y);
      if (vx !== null && vy !== null) return vy - vx;
      if (vx !== null || vy !== null) return vx !== null ? -1 : 1;
      return (reach(y) ?? 0) - (reach(x) ?? 0);
    })
    .slice(0, MAX_REELS)
    .map(reel);
}

export function buildKit({
  world,
  config,
  presetId,
  geo = null,
  configError = false,
  now = Date.now(),
}: {
  world: WorldPayload;
  config: KitConfig;
  presetId?: string | null;
  geo?: KitGeo | null;
  configError?: boolean;
  now?: number;
}): KitModel {
  const preset = resolvePreset(presetId, config.presets);
  const snapshot = world.instagram.ok ? world.instagram.snapshot : null;
  const hidden: string[] = [];
  const allTiles = tiles(world, snapshot);
  const shownTiles = preset.tiles.map((id) => allTiles.get(id)).filter((t): t is KitTile => Boolean(t));
  const kitReels = reels(snapshot, preset, config.reels);
  const typical = typicalReel(snapshot);
  const kitAudience = audience(world, preset, geo);
  // a preset can pick and order the case studies; unknown ids are skipped
  const cases = preset.cases.length ? preset.cases.map((id) => config.cases.find((c) => c.id === id)).filter((c): c is KitCase => Boolean(c)) : config.cases;

  const sections: KitSection[] = [];
  for (const id of preset.sections) {
    const s = section(id);
    if (s) sections.push(s);
  }
  function section(id: KitSectionId): KitSection | null {
    switch (id) {
      case "proof":
        if (!cases.length) hidden.push(config.cases.length ? "Case studies: none of the preset's cases are in media-kit.json" : "Case studies: none in media-kit.json yet");
        return cases.length ? { id, cases } : null;
      case "numbers":
        if (!shownTiles.length) hidden.push("Numbers: Instagram returned none");
        return shownTiles.length ? { id, tiles: shownTiles } : null;
      case "audience":
        if (!kitAudience) hidden.push("Audience: Instagram returned no audience data");
        return kitAudience ? { id, audience: kitAudience } : null;
      case "reels":
        if (!kitReels.length) hidden.push(preset.reels.length ? "Top Reels: the preset's Reels are not in the current snapshot" : "Top Reels: no Reel with measured views");
        if (snapshot && !typical) hidden.push(`Typical Reel: fewer than ${MIN_TYPICAL} Reels at least ${SETTLED_DAYS} days old with measured views and reach`);
        return kitReels.length || typical ? { id, reels: kitReels, typical } : null;
      case "packages":
        if (!config.packages.length) hidden.push("Packages: none in media-kit.json yet");
        if (!config.addons.length) hidden.push("Add-ons: none in media-kit.json yet");
        return config.packages.length || config.addons.length ? { id, packages: config.packages, addons: config.addons } : null;
    }
  }
  if (!config.tagline) hidden.push("Ana's line under her name: none in media-kit.json yet");
  if (!config.contact) hidden.push("The button: no contact e-mail in media-kit.json yet");
  if (!config.partners.length) hidden.push("Partners: none in media-kit.json yet");
  if (!snapshot) hidden.push("Instagram is not reachable right now: its numbers and Reels are hidden");


  const contact = config.contact
    ? {
        href: `mailto:${config.contact.email}?${[config.contact.subject ? `subject=${encodeURIComponent(config.contact.subject)}` : null, `body=${encodeURIComponent(`${BRIEF_TEMPLATE}\n`)}`].filter(Boolean).join("&")}`,
        label: config.contact.label ?? "Work with Ana",
      }
    : null;
  return {
    preset: { id: preset.id, label: preset.label },
    presets: presetList(config.presets),
    name: config.name ?? "Ana Savu",
    handle: snapshot?.handle ?? null,
    tagline: config.tagline,
    hero: {
      covers: kitReels
        .filter((r): r is KitReel & { cover: string } => r.cover !== null)
        .map((r) => ({ id: r.id, src: r.cover }))
        .slice(0, HERO_COVERS),
      // with a market signal the hero keeps two numbers, so it stays three short facts
      tiles: shownTiles.slice(0, kitAudience?.focus ? 2 : 3),
      signal: kitAudience?.focus ? { share: kitAudience.focus.share, label: kitAudience.focus.label, basis: kitAudience.basis_label } : null,
    },
    partners: config.partners.map((p) => ({ name: p.name, kind: p.kind ? PARTNER_KINDS[p.kind] : null, current: p.current })),
    sections,
    contact,
    as_of: snapshot?.observed_at ?? null,
    stale: world.instagram.ok ? world.instagram.stale : false,
    fresh: Boolean(snapshot) && !(world.instagram.ok && world.instagram.stale) && now - Date.parse(snapshot!.observed_at) <= FRESH_MS,
    hidden,
    case_ids: config.cases.map((c) => c.id),
    config_error: configError,
  };
}
