/**
 * Ben's and Vince's day in the Berlin office (client-safe). Decoration, not activity data: like Ana's day, one activity
 * per 20-minute slot from the clock (the same for every viewer), weighted so Ben is mostly at his laptop and Vince is
 * only sometimes at the gym. Both sleep from midnight to 7 in Berlin.
 */
import { ACTIVITY_SLOT_MS, mix } from "./looks";

export const BEN_ACTIVITIES = ["laptop", "wine", "ai"] as const;
export type BenActivity = (typeof BEN_ACTIVITIES)[number];
export const VINCE_ACTIVITIES = ["phone", "computer", "gym"] as const;
export type VinceActivity = (typeof VINCE_ACTIVITIES)[number];

/** relative weights, same order as the lists above */
const BEN_WEIGHTS = [6, 2, 3] as const;
const VINCE_WEIGHTS = [4, 4, 2] as const;

function weighted<T extends string>(items: readonly T[], weights: readonly number[], n: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = n % total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return items[i] as T;
  }
  return items[0] as T;
}

export function berlinHour(now: number): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
}

export interface BerlinDay {
  /** midnight to 7 in Berlin: both asleep */
  night: boolean;
  ben: BenActivity;
  vince: VinceActivity;
  /** when the activities change next (ms) */
  until: number;
}

export function berlinDay(now: number): BerlinDay {
  const slot = Math.floor(now / ACTIVITY_SLOT_MS);
  return {
    night: berlinHour(now) < 7,
    // different salts: Ben's and Vince's picks do not move in lockstep
    ben: weighted(BEN_ACTIVITIES, BEN_WEIGHTS, mix(slot ^ 0x5bd1e995)),
    vince: weighted(VINCE_ACTIVITIES, VINCE_WEIGHTS, mix(slot ^ 0x27d4eb2f)),
    until: (slot + 1) * ACTIVITY_SLOT_MS,
  };
}
