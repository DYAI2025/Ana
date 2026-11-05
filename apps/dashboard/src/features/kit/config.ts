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
  brand: string;
  title: string | null;
  summary: string | null;
  results: KitCaseResult[];
  /** a public link to the work (https only) */
  link: string | null;
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
  cases: KitCase[];
  packages: KitPackage[];
  addons: KitAddon[];
  presets: Record<string, KitPresetInput>;
}

export const EMPTY_KIT_CONFIG: KitConfig = { name: null, tagline: null, contact: null, cases: [], packages: [], addons: [], presets: {} };

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
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
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
  return { brand, title: str(o.title, 120), summary: str(o.summary, 400), results, link: https(o.link) };
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
  if (Array.isArray(o.reels)) out.reels = [...new Set(list(o.reels, (x) => (typeof x === "string" && /^[0-9A-Za-z_]{1,40}$/.test(x) ? x : null), 6))];
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
    cases: list(o.cases, parseCase, 6),
    packages: list(o.packages, parsePackage, 6),
    addons: list(o.addons, parseAddon, 8),
    presets,
  };
}
