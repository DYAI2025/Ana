/** Number formats of the media kit (ANA-53), shared by the server page and the client counters. English for brands. */
import type { KitValueKind } from "./model";

export const KIT_LOCALE = "en";
const compact = new Intl.NumberFormat(KIT_LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const grouped = new Intl.NumberFormat(KIT_LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(KIT_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(KIT_LOCALE, { maximumFractionDigits: 0 });

/** "share" is a 0..1 share shown as a whole percent, like the audience bars; "percent" is 0..100 with one decimal */
export function formatValue(value: number, kind: KitValueKind): string {
  if (kind === "percent") return `${oneDecimal.format(value)}%`;
  if (kind === "share") return `${whole.format(value * 100)}%`;
  if (kind === "seconds") return `${oneDecimal.format(value)} s`;
  return value >= 10_000 ? compact.format(value) : grouped.format(value);
}
