/** Local prototype search over fixture + in-session content. No server, no external index. */
import { BRAIN_NODES } from "@/fixtures/brain";
import { SOURCE_GROUPS, TOOLS } from "@/fixtures/connections";
import { SESSIONS } from "@/fixtures/sessions";
import { TEAM } from "@/fixtures/team";
import { translate, type MessageKey } from "@/i18n/translate";
import { LOCALES, pick, type Locale, type Localized } from "@/lib/locale";
import type { PrototypeState } from "@/state/prototype";
import { VIEW_HREF, type ViewId } from "./views";

export const SEARCH_GROUPS = ["view", "ticket", "idea", "session", "concept", "event", "tool", "source"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface SearchEntry {
  id: string;
  group: SearchGroup;
  label: string;
  detail: string;
  href: string;
  /** normalized text matched against the query: label + detail + every language variant */
  haystack: string;
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const allLanguages = (value: Localized | string) => (typeof value === "string" ? [value] : LOCALES.map((loc) => value[loc]));
const show = (value: Localized | string, locale: Locale) => (typeof value === "string" ? value : pick(value, locale));
const allTranslations = (key: MessageKey) => LOCALES.map((loc) => translate(loc, key));

function entry(group: SearchGroup, id: string, label: string, detail: string, href: string, extra: string[] = []): SearchEntry {
  return { id: `${group}:${id}`, group, label, detail, href, haystack: normalize([label, detail, ...extra].join(" ")) };
}

const VIEW_ORDER: readonly ViewId[] = ["now", "board", "backlog", "sessions", "brain", "whiteboard", "calendar", "pulse", "vault", "toolbox"];

export function buildSearchIndex(state: PrototypeState, locale: Locale): SearchEntry[] {
  const t = (key: MessageKey) => translate(locale, key);
  const entries: SearchEntry[] = [];

  for (const view of VIEW_ORDER) {
    entries.push(entry("view", view, t(`nav.${view}`), t("search.groups.view"), VIEW_HREF[view], allTranslations(`nav.${view}`)));
  }

  for (const ticket of state.tickets) {
    const owner = TEAM[ticket.owner].name;
    entries.push(
      entry("ticket", ticket.id, show(ticket.title, locale), `${ticket.key} · ${owner} · ${t(`board.columns.${ticket.column}`)}`, `/board?ticket=${ticket.id}`, [
        ...allLanguages(ticket.title),
        ...allLanguages(ticket.category),
      ]),
    );
  }

  for (const item of state.backlog) {
    const kind = t(item.kind === "idea" ? "backlog.kindIdea" : "backlog.kindBacklog");
    const owner = item.owner ? ` · ${TEAM[item.owner].name}` : "";
    entries.push(entry("idea", item.id, show(item.title, locale), `${kind}${owner}`, "/backlog", allLanguages(item.title)));
  }

  for (const session of SESSIONS) {
    entries.push(
      entry("session", session.id, show(session.title, locale), [show(session.kind, locale), session.date ?? t("common.prototype")].join(" · "), `/sessions/${session.id}`, [
        ...allLanguages(session.title),
        ...allLanguages(session.kind),
      ]),
    );
  }

  for (const node of BRAIN_NODES) {
    entries.push(entry("concept", node.id, show(node.label, locale), t(`brain.types.${node.type}`), `/brain?node=${node.id}`, allLanguages(node.label)));
  }

  for (const event of state.events) {
    entries.push(
      entry("event", event.id, show(event.title, locale), `${event.date} · ${event.start}–${event.end}`, `/calendar?event=${event.id}`, allLanguages(event.title)),
    );
  }

  for (const tool of TOOLS) {
    entries.push(entry("tool", tool.id, show(tool.name, locale), show(tool.purpose, locale), `/toolbox?tool=${tool.id}`, [...allLanguages(tool.name), ...allLanguages(tool.purpose)]));
  }

  for (const group of SOURCE_GROUPS) {
    for (const source of group.sources) {
      const key = typeof source === "string" ? source : source.en;
      entries.push(entry("source", `${group.id}-${key}`, show(source, locale), `${t(`pulse.${group.id}`)} · ${t("common.notConnected")}`, "/pulse", allLanguages(source)));
    }
  }

  return entries;
}

function rank(entry: SearchEntry, query: string, tokens: string[]): number {
  const label = normalize(entry.label);
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  if (tokens.every((token) => label.includes(token))) return 2;
  return 3;
}

/** Every query word must match. Empty query → the page list. Results are never truncated here. */
export function searchEntries(entries: readonly SearchEntry[], rawQuery: string): SearchEntry[] {
  const query = normalize(rawQuery);
  if (query === "") return entries.filter((e) => e.group === "view");
  const tokens = query.split(" ");
  return entries
    .map((entry, order) => ({ entry, order }))
    .filter(({ entry }) => tokens.every((token) => entry.haystack.includes(token)))
    .map(({ entry, order }) => ({ entry, order, score: rank(entry, query, tokens) }))
    .sort((a, b) => a.score - b.score || SEARCH_GROUPS.indexOf(a.entry.group) - SEARCH_GROUPS.indexOf(b.entry.group) || a.order - b.order)
    .map(({ entry }) => entry);
}

export interface ResultGroup {
  group: SearchGroup;
  items: SearchEntry[];
  /** flat index of the group's first item, for keyboard navigation across groups */
  start: number;
}

export function groupResults(results: readonly SearchEntry[]): ResultGroup[] {
  const groups: ResultGroup[] = [];
  let start = 0;
  for (const group of SEARCH_GROUPS) {
    const items = results.filter((r) => r.group === group);
    if (items.length === 0) continue;
    groups.push({ group, items, start });
    start += items.length;
  }
  return groups;
}
