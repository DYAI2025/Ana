import "server-only";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PRESET_ID } from "@/features/kit/config";
import { historyFile } from "@/server/world/audienceHistory";
import { KIT_TOKEN } from "./publicPath";

/**
 * Public brand links of the media kit. kit-links.json in the state directory (never in git: the repository is public)
 * lists each link: an unguessable token, the preset the brand sees, a label for the team and whether it is revoked.
 * kit-link-opens.json counts how often each link was opened, split into views and link previews (Slack, WhatsApp,
 * mail scanners unfurl a link before anyone clicks it). It stores no IP address, no user agent and no cookie.
 *
 *   { "links": [{ "id": "west-1", "token": "<43 chars base64url>", "preset": "west", "label": "English-speaking markets",
 *                 "brand": null, "created_at": "2026-11-06T16:00:00Z", "revoked": false }] }
 */

export interface KitLink {
  id: string;
  token: string;
  preset: string;
  label: string;
  /** the brand the link was made for; null for a link per market */
  brand: string | null;
  created_at: string | null;
  revoked: boolean;
}

export interface KitLinkOpens {
  views: number;
  previews: number;
  first_view_at: string | null;
  last_view_at: string | null;
}

type Env = Readonly<Record<string, string | undefined>>;

export const kitLinksFile = (env: Env = process.env) => path.join(path.dirname(historyFile(env)), "kit-links.json");
export const kitOpensFile = (env: Env = process.env) => path.join(path.dirname(historyFile(env)), "kit-link-opens.json");

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function parseKitLinks(raw: unknown): KitLink[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { links?: unknown }).links) ? (raw as { links: unknown[] }).links : [];
  const out: KitLink[] = [];
  const ids = new Set<string>();
  const tokens = new Set<string>();
  for (const item of list.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id, 40);
    const token = typeof o.token === "string" ? o.token : "";
    const preset = str(o.preset, 40) ?? "default";
    // a malformed entry is dropped, never served: a short or reused token would be guessable or ambiguous
    if (!id || !PRESET_ID.test(id) || ids.has(id) || !KIT_TOKEN.test(token) || tokens.has(token) || !PRESET_ID.test(preset)) continue;
    ids.add(id);
    tokens.add(token);
    out.push({ id, token, preset, label: str(o.label, 80) ?? id, brand: str(o.brand, 80), created_at: str(o.created_at, 40), revoked: o.revoked === true });
  }
  return out;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function readKitLinks(file = kitLinksFile()): Promise<KitLink[]> {
  return parseKitLinks(await readJson(file));
}

/** the active link with this token; constant-time per comparison, so a near miss is not faster than a far one */
export function findLink(links: readonly KitLink[], token: string): KitLink | null {
  if (!KIT_TOKEN.test(token)) return null;
  const want = Buffer.from(token);
  let found: KitLink | null = null;
  for (const link of links) {
    if (timingSafeEqual(Buffer.from(link.token), want)) found = link;
  }
  return found && !found.revoked ? found : null;
}

/** link previews and scanners that open a link before (or without) a person: counted apart from views */
const PREVIEW_AGENT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|linkedin|embedly|outlook|microsoft office|googleimageproxy|proofpoint|mimecast|barracuda/i;

export function isPreviewAgent(userAgent: string | null): boolean {
  return !userAgent || PREVIEW_AGENT.test(userAgent);
}

export async function readOpens(file = kitOpensFile()): Promise<Record<string, KitLinkOpens>> {
  const raw = await readJson(file);
  const out: Record<string, KitLinkOpens> = Object.create(null);
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!PRESET_ID.test(id) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    out[id] = {
      views: Number.isSafeInteger(o.views) && (o.views as number) >= 0 ? (o.views as number) : 0,
      previews: Number.isSafeInteger(o.previews) && (o.previews as number) >= 0 ? (o.previews as number) : 0,
      first_view_at: str(o.first_view_at, 40),
      last_view_at: str(o.last_view_at, 40),
    };
  }
  return out;
}

// one write at a time in this process: two opens in the same moment must both count
let queue: Promise<unknown> = Promise.resolve();

/** counts one open of a link; best effort (a failed write never breaks the page) */
export function recordOpen(id: string, preview: boolean, now: Date = new Date(), file = kitOpensFile()): Promise<void> {
  const run = queue.then(async () => {
    const all = await readOpens(file);
    const cur = all[id] ?? { views: 0, previews: 0, first_view_at: null, last_view_at: null };
    const at = now.toISOString();
    all[id] = preview ? { ...cur, previews: cur.previews + 1 } : { ...cur, views: cur.views + 1, first_view_at: cur.first_view_at ?? at, last_view_at: at };
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all), { mode: 0o600 });
    await fs.rename(tmp, file);
  });
  queue = run.catch(() => undefined);
  return run.catch(() => undefined);
}
