import type { Locale } from "@/lib/locale";

const INTL: Record<Locale, string> = { en: "en-GB", de: "de-DE", it: "it-IT" };

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 0 }).format(value);
}

/** Compact for dense rows: 12.4K / 12,4 Tsd. */
export function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(rate: number, locale: Locale, digits = 2): string {
  return new Intl.NumberFormat(INTL[locale], { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rate);
}

/** A measured value in its unit: a Reel's watch time (ms) in seconds, its skip rate (percent 0-100) as a percentage. */
export function formatObservation(o: { value: number; unit: string }, locale: Locale): string {
  if (o.unit === "ms") return `${new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(o.value / 1000)} s`;
  if (o.unit === "percent") return formatPercent(o.value / 100, locale, 1);
  return formatCount(o.value, locale);
}

export function formatIndex(index: number, locale: Locale): string {
  return `${new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(index)}×`;
}

/**
 * Dates in the viewer's own time zone: cockpit data only exists after the browser's fetch, so there is no server render
 * to disagree with. `timeZone` is for tests; the UI passes none.
 */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
}

export function formatDay(iso: string, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: "2-digit", month: "short", year: "numeric", timeZone }).format(new Date(iso));
}

export function ageDays(iso: string, observedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(iso)) / 86_400_000));
}
