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
 *     "tips": ["Name our price first."] }
 *
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
}

export const EMPTY_RATE_CARD: RateCard = { currency: "USD", rates: [], addons: [], tips: [] };

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
  return { id, name, quote, minimum: min !== null && min <= quote ? min : null, includes: list(o.includes, (x) => str(x, 120), 6), note: str(o.note, 200) };
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
  return { name, tiers: list(o.tiers, parseTier, 6), note: str(o.note, 200) };
}

export function parseRateCard(raw: unknown): RateCard {
  const o = obj(raw);
  if (!o) return EMPTY_RATE_CARD;
  const currency = typeof o.currency === "string" && CURRENCY.test(o.currency) ? o.currency : "USD";
  const ids = new Set<string>();
  const rates = list(o.rates, parseRate, 12).filter((r) => (ids.has(r.id) ? false : (ids.add(r.id), true)));
  return { currency, rates, addons: list(o.addons, parseAddon, 8), tips: list(o.tips, (x) => str(x, 240), 4) };
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
