import type { Locale } from "@/lib/locale";
import { de } from "./de";
import { en, type Messages } from "./en";
import { it } from "./it";

export const dictionaries: Readonly<Record<Locale, Messages>> = { en, de, it };

type Join<K extends string, P extends string> = `${K}.${P}`;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

/** Every dot-path in the dictionary, e.g. "nav.now" or "work.failures.stale". */
export type MessageKey = Paths<Messages>;
export type MessageParams = Readonly<Record<string, string | number>>;

export function flattenKeys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : flattenKeys(value as object, `${prefix}${key}.`),
  );
}

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function format(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Missing keys render as the key itself so gaps stay visible rather than silently blank. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key;
  return format(template, params);
}
