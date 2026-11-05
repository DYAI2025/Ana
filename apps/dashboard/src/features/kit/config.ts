/**
 * Ana's media kit content that does not come from Instagram (ANA-53): her own line, the contact for the one button,
 * case studies, packages with "from" prices and add-ons, and brand presets. It lives in `media-kit.json` in the
 * dashboard's state directory (src/server/kit/config.ts), never in git: the repository is public.
 *
 * Everything is optional. A section whose content is missing is hidden, never filled with a placeholder; nothing here
 * is invented by the dashboard. The parser is lenient: a bad entry is dropped, the rest of the file still counts.
 */
import { KIT_SECTIONS, KIT_TILES, type KitPresetInput, type KitSectionId, type KitTileId } from "./presets";

export interface KitCaseResult {
  label: string;
  value: string;
}

export interface KitCase {
  /** for a preset's `cases` list; defaults to the brand as a slug ("Hotel A" → "hotel-a") */
  id: string;
  brand: string;
  title: string | null;
  summary: string | null;
  /** what Ana did, e.g. "Concept, filming and editing" */
  role: string | null;
  /** e.g. ["1 Reel", "3 Stories"] */
  deliverables: string[];
  /** when the results were measured, e.g. "30 days after posting, Mar 2026" */
  period: string | null;
  /** where the results come from, e.g. "Instagram Insights" or "brand report" */
  source: string | null;
  /** empty = shown as a collaboration without published results */
  results: KitCaseResult[];
  /** a public link to the work (https only) */
  link: string | null;
}

/** how a brand worked with Ana: never more than she states */
export const PARTNER_KINDS = { paid: "Paid partnership", gifted: "Gifted", ugc: "UGC", affiliate: "Affiliate", partnership: "Brand partnership" } as const;
export type KitPartnerKind = keyof typeof PARTNER_KINDS;

export interface KitPartner {
  name: string;
  kind: KitPartnerKind;
}

/** what a Reel is, for brands: organic content, a brand partnership (with the brand), UGC made for a brand, or a concept */
export const REEL_LABELS = { organic: "Organic", partnership: "Brand partnership", ugc: "UGC", concept: "Concept" } as const;
export type KitReelLabelKind = keyof typeof REEL_LABELS;

export interface KitReelLabel {
  kind: KitReelLabelKind;
  brand: string | null;
}

export interface KitPackage {
  name: string;
  /** as Ana writes it, e.g. "from €1,500" */
  price: string;
  includes: string[];
  note: string | null;
}

export interface KitAddon {
  name: string;
  /** e.g. "+20–50 % of the fee" */
  price: string | null;
  note: string | null;
}

export interface KitContact {
  email: string;
  label: string | null;
  subject: string | null;
}

export interface KitConfig {
  name: string | null;
  /** a line in Ana's own words; never written by the dashboard */
  tagline: string | null;
  contact: KitContact | null;
  /** brands Ana has worked with, names only (no logos) */
  partners: KitPartner[];
  /** labels of Reels by media id */
  reels: Record<string, KitReelLabel>;
  cases: KitCase[];
  packages: KitPackage[];
  addons: KitAddon[];
  presets: Record<string, KitPresetInput>;
}

export const EMPTY_KIT_CONFIG: KitConfig = { name: null, tagline: null, contact: null, partners: [], reels: {}, cases: [], packages: [], addons: [], presets: {} };

const MAX_ITEMS = 12;
const str = (v: unknown, max = 400): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = <T,>(v: unknown, item: (x: unknown) => T | null, max = MAX_ITEMS): T[] => (Array.isArray(v) ? v.map(item).filter((x): x is T => x !== null).slice(0, max) : []);
const https = (v: unknown): string | null => {
  const s = str(v, 500);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};
// plain addresses only: no "?", "&", "#", "%" or "," that would add mailto headers (a hidden bcc) or more recipients
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "case";
const MEDIA_ID = /^[0-9A-Za-z_]{1,40}$/;

function parsePartner(v: unknown): KitPartner | null {
  const o = obj(v);
  const name = str(o?.name, 60);
  if (!o || !name) return null;
  const kind = typeof o.kind === "string" && Object.hasOwn(PARTNER_KINDS, o.kind) ? (o.kind as KitPartnerKind) : o.kind === undefined ? "partnership" : null;
  return kind ? { name, kind } : null;
}

function parseReelLabels(v: unknown): Record<string, KitReelLabel> {
  const o = obj(v);
  const out: Record<string, KitReelLabel> = {};
  if (!o) return out;
  for (const [id, raw] of Object.entries(o).slice(0, 60)) {
    const x = obj(raw);
    if (!x || !MEDIA_ID.test(id) || typeof x.kind !== "string" || !Object.hasOwn(REEL_LABELS, x.kind)) continue;
    const kind = x.kind as KitReelLabelKind;
    out[id] = { kind, brand: kind === "organic" || kind === "concept" ? null : str(x.brand, 60) };
  }
  return out;
}

const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const PRESET_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CODE = /^[A-Z]{2}$/;

function parseCase(v: unknown): KitCase | null {
  const o = obj(v);
  const brand = str(o?.brand, 80);
  if (!o || !brand) return null;
  const results = list(o.results, (r) => {
    const x = obj(r);
    const label = str(x?.label, 60);
    const value = str(x?.value, 30);
    return label && value ? { label, value } : null;
  }, 4);
  const ownId = str(o.id, 40);
  const id = ownId && PRESET_ID.test(ownId) ? ownId : slug(brand);
  return {
    id,
    brand,
    title: str(o.title, 120),
    summary: str(o.summary, 400),
    role: str(o.role, 120),
    deliverables: list(o.deliverables, (x) => str(x, 80), 8),
    period: str(o.period, 80),
    source: str(o.source, 80),
    results,
    link: https(o.link),
  };
}

function parsePackage(v: unknown): KitPackage | null {
  const o = obj(v);
  const name = str(o?.name, 60);
  const price = str(o?.price, 40);
  if (!o || !name || !price) return null;
  return { name, price, includes: list(o.includes, (x) => str(x, 120), 8), note: str(o.note, 200) };
}

function parseAddon(v: unknown): KitAddon | null {
  const o = obj(v);
  const name = str(o?.name, 60);
  if (!o || !name) return null;
  return { name, price: str(o.price, 60), note: str(o.note, 200) };
}

function parseContact(v: unknown): KitContact | null {
  const o = obj(v);
  const email = str(o?.email, 120);
  if (!o || !email || !EMAIL.test(email)) return null;
  return { email, label: str(o.label, 40), subject: str(o.subject, 120) };
}

function parsePreset(v: unknown): KitPresetInput | null {
  const o = obj(v);
  if (!o) return null;
  const out: KitPresetInput = {};
  const base = str(o.base, 40);
  if (base && PRESET_ID.test(base)) out.base = base;
  const label = str(o.label, 60);
  if (label) out.label = label;
  if (o.lead === "engaged" || o.lead === "followers") out.lead = o.lead;
  const focusLabel = str(o.focus_label, 60);
  if (focusLabel) out.focus_label = focusLabel;
  if (Array.isArray(o.focus)) out.focus = [...new Set(list(o.focus, (x) => (typeof x === "string" && CODE.test(x.trim().toUpperCase()) ? x.trim().toUpperCase() : null), 60))];
  if (Array.isArray(o.sections)) out.sections = [...new Set(list(o.sections, (x) => (KIT_SECTIONS.includes(x as KitSectionId) ? (x as KitSectionId) : null)))];
  if (Array.isArray(o.tiles)) out.tiles = [...new Set(list(o.tiles, (x) => (KIT_TILES.includes(x as KitTileId) ? (x as KitTileId) : null)))];
  if (Array.isArray(o.reels)) out.reels = [...new Set(list(o.reels, (x) => (typeof x === "string" && MEDIA_ID.test(x) ? x : null), 6))];
  if (Array.isArray(o.cases)) out.cases = [...new Set(list(o.cases, (x) => (typeof x === "string" && PRESET_ID.test(x) ? x : null), 6))];
  return out;
}

export function parseKitConfig(raw: unknown): KitConfig {
  const o = obj(raw);
  if (!o) return EMPTY_KIT_CONFIG;
  const presets: Record<string, KitPresetInput> = {};
  const p = obj(o.presets);
  if (p) {
    for (const [id, v] of Object.entries(p).slice(0, 40)) {
      const parsed = PRESET_ID.test(id) ? parsePreset(v) : null;
      if (parsed) presets[id] = parsed;
    }
  }
  return {
    name: str(o.name, 60),
    tagline: str(o.tagline, 200),
    contact: parseContact(o.contact),
    partners: list(o.partners, parsePartner, 12),
    reels: parseReelLabels(o.reels),
    cases: list(o.cases, parseCase, 6),
    packages: list(o.packages, parsePackage, 6),
    addons: list(o.addons, parseAddon, 8),
    presets,
  };
}
