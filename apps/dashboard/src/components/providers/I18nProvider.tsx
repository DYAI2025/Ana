"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { translate, type MessageKey, type MessageParams } from "@/i18n/translate";
import { DEFAULT_LOCALE, isLocale, pick, type Locale, type Localized } from "@/lib/locale";

export const LOCALE_STORAGE_KEY = "ana.locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Render fixture text: localized objects pick the active language, plain strings pass through. */
  text: (value: Localized | string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/* The chosen language lives in localStorage (REQ-F-005: persist selection); this tiny store
   keeps React in sync with it, and falls back to memory when storage is blocked. */
const listeners = new Set<() => void>();
let memoryLocale: Locale | null = null;

function readLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage blocked */
  }
  return memoryLocale ?? DEFAULT_LOCALE;
}

function writeLocale(next: Locale) {
  memoryLocale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* storage blocked: the choice still applies for this tab */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => writeLocale(next), []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      text: (value) => (typeof value === "string" ? value : pick(value, locale)),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
