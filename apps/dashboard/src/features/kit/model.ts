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
import type { KitAddon, KitCase, KitConfig, KitPackage } from "./config";
import { project, type KitGeo, type KitLand } from "./map";
import { presetList, resolvePreset, type KitPreset, type KitSectionId, type KitTileId } from "./presets";

export type KitValueKind = "count" | "percent" | "seconds";

export interface KitTile {
  id: KitTileId;
  label: string;
  value: number;
  kind: KitValueKind;
  /** how the number is defined, shown small under it */
  note: string;
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
}

export type KitSection =
  | { id: "proof"; cases: KitCase[] }
  | { id: "numbers"; tiles: KitTile[] }
  | { id: "audience"; audience: KitAudience }
  | { id: "reels"; reels: KitReel[] }
  | { id: "packages"; packages: KitPackage[]; addons: KitAddon[] };

export interface KitModel {
  preset: { id: string; label: string };
  presets: Array<{ id: string; label: string }>;
  name: string;
  handle: string | null;
  tagline: string | null;
  hero: { covers: string[]; tiles: KitTile[] };
  sections: KitSection[];
  contact: { href: string; label: string } | null;
  /** when Instagram measured the numbers; null without a snapshot */
  as_of: string | null;
  /** the snapshot is an older one because the last read failed */
  stale: boolean;
  /** what the internal preview says is not shown, and why */
  hidden: string[];
  config_error: boolean;
}

const MAX_COUNTRIES = 8;
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
  const add = (id: KitTileId, label: string, value: number | null, kind: KitValueKind, note: string) => {
    if (value !== null && Number.isFinite(value)) out.set(id, { id, label, value, kind, note });
  };
  const account = snapshot?.account ?? [];
  const pulseFollowers = world.pulse.state === "ok" && typeof world.pulse.followers === "number" ? world.pulse.followers : null;
  add("followers", "Followers", pulseFollowers ?? verified(account, "followers"), "count", "Instagram followers");
  const reach = verified(account, "reach");
  const interactions = verified(account, "total_interactions");
  add("reach", "Accounts reached", reach, "count", "Unique accounts, last 28 days");
  add("views", "Views", verified(account, "views"), "count", "All content, last 28 days");
  add("engaged", "Accounts engaged", verified(account, "accounts_engaged"), "count", "Accounts that interacted, last 28 days");
  add("interactions", "Interactions", interactions, "count", "Likes, comments, saves and shares, last 28 days");
  add("engagement", "Engagement rate", reach && interactions !== null ? (interactions / reach) * 100 : null, "percent", "Interactions per account reached, last 28 days");
  const v = world.reel_viewing;
  if (v.state === "on") {
    add("watch", "Watch time per Reel", v.watch_ms === null ? null : v.watch_ms / 1000, "seconds", `Median of the average watch time, ${v.reels} recent Reels`);
    add("hold", "Stay past 3 seconds", v.skip_pct === null ? null : 100 - v.skip_pct, "percent", `Share of Reel views not skipped in the first 3 s, median of ${v.skip_reels} Reels`);
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
  // the brand's markets first (still by share), then the rest: two labelled groups, never a re-ranked list
  const countries = [...all.filter((c) => c.focus), ...all.filter((c) => !c.focus)].slice(0, MAX_COUNTRIES);
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

function reel(p: SocialPost): KitReel {
  const watch = verified(p.observations, "avg_watch_time");
  return {
    id: p.media_id,
    cover: httpsOrNull(p.thumbnail_url ?? p.image_url ?? null),
    link: httpsOrNull(p.permalink, /(^|\.)instagram\.com$/),
    published_at: p.published_at,
    views: verified(p.observations, "views"),
    reach: verified(p.observations, "reach"),
    watch_s: watch === null ? null : Math.round(watch / 100) / 10,
  };
}

function reels(snapshot: SocialSnapshot | null, preset: KitPreset): KitReel[] {
  const all = (snapshot?.posts ?? []).filter((p) => p.format === "reel");
  if (preset.reels.length) {
    const byId = new Map(all.map((p) => [p.media_id, p]));
    return preset.reels.map((id) => byId.get(id)).filter((p): p is SocialPost => Boolean(p)).slice(0, MAX_REELS).map(reel);
  }
  const score = (p: SocialPost) => verified(p.observations, "views") ?? verified(p.observations, "reach") ?? -1;
  return all
    .filter((p) => score(p) >= 0)
    .sort((x, y) => score(y) - score(x))
    .slice(0, MAX_REELS)
    .map(reel);
}

export function buildKit({ world, config, presetId, geo = null, configError = false }: { world: WorldPayload; config: KitConfig; presetId?: string | null; geo?: KitGeo | null; configError?: boolean }): KitModel {
  const preset = resolvePreset(presetId, config.presets);
  const snapshot = world.instagram.ok ? world.instagram.snapshot : null;
  const hidden: string[] = [];
  const allTiles = tiles(world, snapshot);
  const shownTiles = preset.tiles.map((id) => allTiles.get(id)).filter((t): t is KitTile => Boolean(t));
  const kitReels = reels(snapshot, preset);
  const kitAudience = audience(world, preset, geo);

  const sections: KitSection[] = [];
  for (const id of preset.sections) {
    const s = section(id);
    if (s) sections.push(s);
  }
  function section(id: KitSectionId): KitSection | null {
    switch (id) {
      case "proof":
        if (!config.cases.length) hidden.push("Case studies: none in media-kit.json yet");
        return config.cases.length ? { id, cases: config.cases } : null;
      case "numbers":
        if (!shownTiles.length) hidden.push("Live numbers: Instagram returned none");
        return shownTiles.length ? { id, tiles: shownTiles } : null;
      case "audience":
        if (!kitAudience) hidden.push("Audience: Instagram returned no audience data");
        return kitAudience ? { id, audience: kitAudience } : null;
      case "reels":
        if (!kitReels.length) hidden.push(preset.reels.length ? "Top Reels: the preset's Reels are not in the current snapshot" : "Top Reels: no Reel with measured views");
        return kitReels.length ? { id, reels: kitReels } : null;
      case "packages":
        if (!config.packages.length) hidden.push("Packages: none in media-kit.json yet");
        if (!config.addons.length) hidden.push("Add-ons: none in media-kit.json yet");
        return config.packages.length || config.addons.length ? { id, packages: config.packages, addons: config.addons } : null;
    }
  }
  if (!config.tagline) hidden.push("Ana's line under her name: none in media-kit.json yet");
  if (!config.contact) hidden.push("The button: no contact e-mail in media-kit.json yet");
  if (!snapshot) hidden.push("Instagram is not reachable right now: live numbers and Reels are hidden");

  const contact = config.contact
    ? {
        href: `mailto:${config.contact.email}${config.contact.subject ? `?subject=${encodeURIComponent(config.contact.subject)}` : ""}`,
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
        .map((r) => r.cover)
        .filter((c): c is string => c !== null)
        .slice(0, HERO_COVERS),
      tiles: shownTiles.slice(0, 3),
    },
    sections,
    contact,
    as_of: snapshot?.observed_at ?? null,
    stale: world.instagram.ok ? world.instagram.stale : false,
    hidden,
    config_error: configError,
  };
}
