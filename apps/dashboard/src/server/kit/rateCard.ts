import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EMPTY_RATE_CARD, parseRateCard, rateCardProblems, type RateCard } from "@/features/kit/rateCard";
import { historyFile } from "@/server/world/audienceHistory";

/**
 * rate-card.json: Ana's internal prices (src/features/kit/rateCard.ts). Next to media-kit.json in the state directory,
 * never in git. Read only by GET /api/rate-card (behind the login); the media kit and the public brand links never read
 * it. Missing = no card (the register shows nothing); unreadable = no card plus a flag the office shows. The team edits
 * it in the office (PUT /api/rate-card -> saveRateCard).
 */
export const rateCardFile = (env: Readonly<Record<string, string | undefined>> = process.env) => path.join(path.dirname(historyFile(env)), "rate-card.json");

export async function readRateCard(file = rateCardFile()): Promise<{ card: RateCard; error: boolean }> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (e) {
    return { card: EMPTY_RATE_CARD, error: (e as NodeJS.ErrnoException)?.code !== "ENOENT" };
  }
  try {
    return { card: parseRateCard(JSON.parse(text)), error: false };
  } catch {
    return { card: EMPTY_RATE_CARD, error: true };
  }
}

// one save at a time in this process: the check against updated_at and the write belong together
let queue: Promise<unknown> = Promise.resolve();

export type SaveResult = { ok: true; card: RateCard } | { ok: false; conflict: true; card: RateCard } | { ok: false; conflict: false; problems: string[] };

/**
 * Saves a card edited in the office. `base` is the updated_at the editor started from: when someone saved in between,
 * nothing is written and the current card comes back (the editor shows it instead of overwriting it). Invalid input is
 * refused, never stored half. Written atomically, readable by the service user only.
 */
export function saveRateCard(raw: unknown, base: string | null, by: string | null, now: Date = new Date(), file = rateCardFile()): Promise<SaveResult> {
  const run = queue.then(async (): Promise<SaveResult> => {
    const problems = rateCardProblems(raw);
    if (problems.length) return { ok: false, conflict: false, problems };
    const current = await readRateCard(file);
    if (current.card.updated_at !== base) return { ok: false, conflict: true, card: current.card };
    const parsed = parseRateCard(raw);
    const card: RateCard = { ...parsed, currency: current.card.currency, updated_at: now.toISOString(), updated_by: by };
    const tmp = `${file}.${process.pid}.${now.getTime()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(card, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmp, file);
    return { ok: true, card };
  });
  queue = run.catch(() => undefined);
  return run;
}
