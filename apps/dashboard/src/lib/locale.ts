export const LOCALES = ["en", "de", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** A fixture string available in every supported language. */
export type Localized = Readonly<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function pick(value: Localized, locale: Locale): string {
  return value[locale];
}

/** Shorthand for writing localized fixture strings: l("Now", "Jetzt", "Ora"). */
export function l(en: string, de: string, it: string): Localized {
  return { en, de, it };
}
