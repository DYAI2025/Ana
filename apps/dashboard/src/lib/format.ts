import type { Locale } from "./locale";

const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", de: "de-DE", it: "it-IT" };

/** Formats a YYYY-MM-DD date in UTC so server and browser render the same string. */
export function formatDate(iso: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export function formatMonth(year: number, month: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
