/**
 * Advertising market tiers of the countries Ana's engaged audience comes from. Brands pay for audiences in markets
 * with high purchasing power: an engagement from the United States is worth more to a brand than one from India.
 *
 * ASSUMPTION, not a measurement: the tiers follow the public country-tier list of ASO.dev ("Country Tiers in Digital
 * Advertising", updated 2026-08-22). As an order of magnitude, published Meta CPM estimates for 2026 (adamigo.ai) are
 * about 23 $ in the US, 10 $ in the UK and Germany, 2.60 $ in India. Change the lists here when the team agrees on
 * other tiers; every view and the brief name the source.
 */
import { shares } from "./model";
import type { AudienceSeries } from "./types";

export type MarketTier = 1 | 2 | 3;

export const MARKET_SOURCE = "ASO.dev Country Tiers (2026-08-22)";

export const TIER1 = ["AT", "AU", "BE", "CA", "CH", "DE", "DK", "ES", "FI", "FR", "GB", "IE", "IT", "JP", "LU", "NL", "NO", "NZ", "SE", "US"] as const;

export const TIER2 = [
  "AD", "AR", "BS", "BY", "BR", "BO", "BA", "BN", "BG", "CL", "CN", "CO", "CR", "HR", "CY", "CZ", "DO", "EC", "EG", "EE", "FJ", "GR", "GY", "HK", "HU", "IS", "ID", "IL", "KZ", "LV", "LT", "MO", "MY",
  "MT", "MX", "ME", "MA", "NP", "OM", "PA", "PY", "PE", "PH", "PL", "PT", "PR", "QA", "RO", "RU", "SA", "RS", "SG", "SK", "SI", "ZA", "KR", "TH", "TR", "UA", "AE", "UY", "VU",
] as const;

const T1 = new Set<string>(TIER1);
const T2 = new Set<string>(TIER2);

/** Tier of an ISO 3166-1 alpha-2 code; every country off the two lists counts as tier 3 */
export function tierOf(code: string): MarketTier {
  const c = code.toUpperCase();
  return T1.has(c) ? 1 : T2.has(c) ? 2 : 3;
}

export interface MarketSplit {
  /** shares of the listed engagement (0..1) per tier */
  t1: number;
  t2: number;
  t3: number;
  /** the tier-1 countries, largest first */
  top1: Array<{ key: string; share: number }>;
}

export function marketSplit(series: AudienceSeries): MarketSplit | null {
  const rows = shares(series);
  if (!rows.length) return null;
  const sum = (t: MarketTier) => rows.filter((r) => tierOf(r.key) === t).reduce((s, r) => s + r.share, 0);
  return {
    t1: sum(1),
    t2: sum(2),
    t3: sum(3),
    top1: rows
      .filter((r) => tierOf(r.key) === 1)
      .sort((a, b) => b.share - a.share)
      .slice(0, 5)
      .map((r) => ({ key: r.key, share: r.share })),
  };
}
