/**
 * Ana's internal rate card: what the team quotes a brand and the lowest it accepts. It is never part of the media kit
 * a brand sees (the kit names the formats and says "Rates on request"); the dashboard shows it in Ana's office, at the
 * register on her desk, behind the same login as everything else. The file is rate-card.json in the state directory
 * (src/server/kit/rateCard.ts), never in git: the repository is public.
 *
 *   { "currency": "USD",
 *     "rates": [{ "id": "reel", "name": "Instagram Reel", "quote": 1500, "minimum": null,
 *                 "includes": ["Crossposted to TikTok, Facebook and YouTube Shorts"], "note": "Fixed rate" }],
 *     "addons": [{ "name": "Usage rights", "tiers": [{ "label": "30 days", "value": "+30 %" }], "note": "Of the content fee" }],
 *     "tips": ["Name our price first."],
 *     "updated_at": "2026-11-07T00:30:00.000Z", "updated_by": "ben@example.com" }
 *
 * The team edits it in the office (PUT /api/rate-card); updated_at guards against two people saving over each other.
 * A minimum is only kept when it is set and not above the quote: the card never shows a floor nobody named.
 */

export interface RateCardRate {
  id: string;
  name: string;
  /** what we name first */
  quote: number;
  /** the lowest we accept; null: none set (the quote is the rate) */
  minimum: number | null;
  includes: string[];
  note: string | null;
}

export interface RateCardTier {
  label: string;
  value: string;
}

export interface RateCardAddon {
  name: string;
  tiers: RateCardTier[];
  note: string | null;
}

export interface RateCard {
  currency: string;
  rates: RateCardRate[];
  addons: RateCardAddon[];
  tips: string[];
  /** when the card was last saved in the office; null: never (written by hand on the server) */
  updated_at: string | null;
  /** who saved it (the dashboard login's e-mail); null when unknown */
  updated_by: string | null;
}

export const RATE_CARD_LIMITS = { rates: 12, includes: 6, addons: 8, tiers: 6, tips: 4 } as const;

export const EMPTY_RATE_CARD: RateCard = { currency: "USD", rates: [], addons: [], tips: [], updated_at: null, updated_by: null };

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_AMOUNT = 10_000_000;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const amount = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_AMOUNT ? v : null);
function list<T>(v: unknown, parse: (x: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    const p = parse(x);
    if (p !== null) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

function parseRate(v: unknown): RateCardRate | null {
  const o = obj(v);
  const id = str(o?.id, 40);
  const name = str(o?.name, 60);
  const quote = amount(o?.quote);
  if (!o || !id || !ID.test(id) || !name || quote === null) return null;
  const min = amount(o.minimum);
  return { id, name, quote, minimum: min !== null && min <= quote ? min : null, includes: list(o.includes, (x) => str(x, 120), RATE_CARD_LIMITS.includes), note: str(o.note, 200) };
}

function parseTier(v: unknown): RateCardTier | null {
  const o = obj(v);
  const label = str(o?.label, 40);
  const value = str(o?.value, 40);
  return label && value ? { label, value } : null;
}

function parseAddon(v: unknown): RateCardAddon | null {
  const o = obj(v);
  const name = str(o?.name, 60);
  if (!o || !name) return null;
  return { name, tiers: list(o.tiers, parseTier, RATE_CARD_LIMITS.tiers), note: str(o.note, 200) };
}

export function parseRateCard(raw: unknown): RateCard {
  const o = obj(raw);
  if (!o) return EMPTY_RATE_CARD;
  const currency = typeof o.currency === "string" && CURRENCY.test(o.currency) ? o.currency : "USD";
  const ids = new Set<string>();
  const rates = list(o.rates, parseRate, RATE_CARD_LIMITS.rates).filter((r) => (ids.has(r.id) ? false : (ids.add(r.id), true)));
  return {
    currency,
    rates,
    addons: list(o.addons, parseAddon, RATE_CARD_LIMITS.addons),
    tips: list(o.tips, (x) => str(x, 240), RATE_CARD_LIMITS.tips),
    updated_at: str(o.updated_at, 40),
    updated_by: str(o.updated_by, 120),
  };
}

/** "$1,500" (whole amounts without cents) */
export function formatAmount(value: number, currency: string, locale = "en-US"): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value);
}

/** what the register's display shows: the Reel's quote (the first rate when there is no Reel), or nothing */
export function registerDisplay(card: RateCard, locale = "en-US"): string | null {
  const r = card.rates.find((x) => x.id === "reel") ?? card.rates[0];
  return r ? formatAmount(r.quote, card.currency, locale) : null;
}

/**
 * Why a card sent from the office editor would not be stored as sent: the parser drops what is invalid without a word,
 * so a save checks first that nothing would be lost (a format without a name or a price, a minimum above the quote).
 * Empty list = it is stored exactly as sent.
 */
export function rateCardProblems(raw: unknown): string[] {
  const o = obj(raw);
  if (!o) return ["not a rate card"];
  const out: string[] = [];
  const rates = Array.isArray(o.rates) ? o.rates : [];
  const addons = Array.isArray(o.addons) ? o.addons : [];
  const tips = Array.isArray(o.tips) ? o.tips : [];
  if (rates.length > RATE_CARD_LIMITS.rates) out.push(`at most ${RATE_CARD_LIMITS.rates} formats`);
  if (addons.length > RATE_CARD_LIMITS.addons) out.push(`at most ${RATE_CARD_LIMITS.addons} add-ons`);
  if (tips.length > RATE_CARD_LIMITS.tips) out.push(`at most ${RATE_CARD_LIMITS.tips} tips`);
  const ids = new Set<string>();
  rates.forEach((r, i) => {
    const x = obj(r);
    const label = `format ${i + 1}`;
    if (!x || !str(x.name, 60)) out.push(`${label}: name missing`);
    if (!x || typeof x.id !== "string" || !ID.test(x.id) || ids.has(x.id)) out.push(`${label}: id missing or used twice`);
    else ids.add(x.id);
    if (!x || amount(x.quote) === null) out.push(`${label}: quote must be a number above 0`);
    if (x && x.minimum !== null && x.minimum !== undefined) {
      const min = amount(x.minimum);
      const q = amount(x.quote);
      if (min === null || (q !== null && min > q)) out.push(`${label}: minimum must be above 0 and not above the quote`);
    }
    if (x && Array.isArray(x.includes) && x.includes.length > RATE_CARD_LIMITS.includes) out.push(`${label}: at most ${RATE_CARD_LIMITS.includes} lines`);
  });
  addons.forEach((a, i) => {
    const x = obj(a);
    if (!x || !str(x.name, 60)) out.push(`add-on ${i + 1}: name missing`);
    const tiers = x && Array.isArray(x.tiers) ? x.tiers : [];
    if (tiers.length > RATE_CARD_LIMITS.tiers) out.push(`add-on ${i + 1}: at most ${RATE_CARD_LIMITS.tiers} steps`);
    if (tiers.some((t) => !parseTier(t))) out.push(`add-on ${i + 1}: every step needs a label and a value`);
  });
  return out;
}

/** a new format's id from its name: "Instagram Reel" -> "instagram-reel", unique among the ids taken */
export function rateId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "format";
  let id = /^[a-z0-9]/.test(base) ? base : `f-${base}`;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 32)}-${n}`;
  return id;
}
