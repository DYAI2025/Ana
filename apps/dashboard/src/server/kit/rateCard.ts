import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EMPTY_RATE_CARD, parseRateCard, type RateCard } from "@/features/kit/rateCard";
import { historyFile } from "@/server/world/audienceHistory";

/**
 * rate-card.json: Ana's internal prices (src/features/kit/rateCard.ts). Next to media-kit.json in the state directory,
 * never in git. Read only by GET /api/rate-card (behind the login); the media kit and the public brand links never read
 * it. Missing = no card (the register shows nothing); unreadable = no card plus a flag the office shows.
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
