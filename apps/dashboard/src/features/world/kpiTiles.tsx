"use client";

import type { useI18n } from "@/components/providers/I18nProvider";
import type { WorldContactTaps, WorldFollows, WorldOnlineHours, WorldPlace, WorldReachSplit, WorldReelViewing } from "./types";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];

const one = (locale: string) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = (locale: string) => new Intl.NumberFormat(locale);
const signed = (v: number, f: Intl.NumberFormat) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${f.format(Math.abs(v))}`;
const dayLabel = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const arrow = (d: number) => (d > 0 ? "▲" : d < 0 ? "▼" : "");

/**
 * Under the follower count: gained and lost in the last 24 h (Meta follows_and_unfollows, up to 48 h late). `current`
 * is false when the last audience read failed: an older answer is not shown as "the last 24 h".
 */
export function FollowsLine({ follows, current, t, locale }: { follows: WorldFollows; current: boolean; t: T; locale: string }) {
  if (follows.state !== "ok" || !current) {
    return (
      <small className={styles.kpiDelta} data-testid="world-kpi-follows" data-direction="none" title={t("world.kpi.followsNote")}>
        {t("world.kpi.followsNone")}
      </small>
    );
  }
  const f = whole(locale);
  const known = follows.gained !== null && follows.lost !== null;
  const net = known ? (follows.gained as number) - (follows.lost as number) : 0;
  const direction = !known ? "unknown" : net > 0 ? "up" : net < 0 ? "down" : "flat";
  return (
    <small className={styles.kpiDelta} data-testid="world-kpi-follows" data-direction={direction} data-good={known ? String(net >= 0) : undefined} title={t("world.kpi.followsNote")}>
      {known && net !== 0 ? <span aria-hidden="true">{arrow(net)}</span> : null}
      {t("world.kpi.follows", { gained: `+${follows.gained === null ? "?" : f.format(follows.gained)}`, lost: `−${follows.lost === null ? "?" : f.format(follows.lost)}` })}
    </small>
  );
}

function Delta({ id, now, before, day, unit, lowerIsBetter, t, locale }: { id: string; now: number; before: number | null; day: string; unit: string; lowerIsBetter: boolean; t: T; locale: string }) {
  if (before === null) return null;
  const d = Math.round((now - before) * 10) / 10;
  const good = d === 0 ? true : lowerIsBetter ? d < 0 : d > 0;
  return (
    <small className={styles.kpiDelta} data-testid={`world-kpi-${id}-delta`} data-good={String(good)}>
      {d !== 0 ? <span aria-hidden="true">{arrow(d)}</span> : null}
      {t("world.kpi.vsDay", { delta: `${signed(d, one(locale))} ${unit}`, day: dayLabel(day, locale) })}
    </small>
  );
}

const compact = (locale: string) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });

/**
 * Share of the 28-day reach that does not follow Ana (Meta reach by follow_type; ANA-56). The share comes from the two
 * groups Meta reports, never from the deduplicated total. `current` is false when the last audience read failed.
 */
export function ReachSplitTile({ split, current, t, locale }: { split: WorldReachSplit; current: boolean; t: T; locale: string }) {
  const ok = current && split.state === "ok" && split.followers !== null && split.non_followers !== null && split.followers + split.non_followers > 0;
  const sum = ok ? (split.followers as number) + (split.non_followers as number) : 0;
  const share = ok ? Math.round(((split.non_followers as number) / sum) * 100) : null;
  return (
    <div data-testid="world-kpi-new-people" data-state={ok ? "ok" : split.state} title={t("world.kpi.newPeopleNote")}>
      <span>{t("world.kpi.newPeople")}</span>
      <b>{share === null ? "—" : `${share} %`}</b>
      <small className={styles.kpiDelta} data-testid="world-kpi-new-people-split">
        {share === null
          ? t("world.kpi.newPeopleNone")
          : t("world.kpi.newPeopleSplit", { fresh: compact(locale).format(split.non_followers as number), followers: compact(locale).format(split.followers as number) })}
      </small>
    </div>
  );
}

/** the UTC hour with the most followers online on average; null when no hour has a value */
export function peakUtcHour(utcHours: readonly (number | null)[]): number | null {
  let best: number | null = null;
  utcHours.forEach((v, h) => {
    if (v !== null && (best === null || v > (utcHours[best] as number))) best = h;
  });
  return best;
}

/** "21:00" for a UTC hour in the given time zone (Ana's place, else the viewer's own), on the date `at` */
export function hourIn(utcHour: number, timeZone: string | null, locale: string, at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), utcHour));
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).format(d);
}

/**
 * When Ana's followers are online most (Meta online_followers, mean per hour; ANA-56), in the time of Ana's place when
 * it has a time zone, otherwise in the viewer's own time, and said which one it is. `placeLabel` is the place name as
 * the world view shows it.
 */
export function OnlineTile({ online, current, place, placeLabel, t, locale, now = new Date() }: { online: WorldOnlineHours; current: boolean; place: WorldPlace | null; placeLabel: string | null; t: T; locale: string; now?: Date }) {
  const peak = current && online.state === "ok" ? peakUtcHour(online.utc_hours) : null;
  const tz = place?.tz ?? null;
  // a country code label ("TH") is shown as the country name, as everywhere else in the world view
  const where = placeLabel ?? place?.label ?? null;
  return (
    <div data-testid="world-kpi-online" data-state={peak === null ? online.state : "ok"} title={t("world.kpi.onlineNote", { days: online.days })}>
      <span>{t("world.kpi.onlinePeak")}</span>
      <b>{peak === null ? "—" : hourIn(peak, tz, locale, now)}</b>
      <small className={styles.kpiDelta} data-testid="world-kpi-online-where">
        {peak === null
          ? t("world.kpi.onlineNone")
          : tz && where
            ? t("world.kpi.onlineAt", { place: where, n: whole(locale).format(online.utc_hours[peak] as number) })
            : t("world.kpi.onlineAtLocal", { n: whole(locale).format(online.utc_hours[peak] as number) })}
      </small>
    </div>
  );
}

/** Contact-button taps (Meta profile_links_taps; not the bio link). Shown only when there were any (ANA-56 R1.5). */
export function ContactTapsTile({ taps, current, t, locale }: { taps: WorldContactTaps; current: boolean; t: T; locale: string }) {
  if (!current || taps.state !== "ok" || !taps.total) return null;
  return (
    <div data-testid="world-kpi-contact-taps" title={t("world.kpi.contactTapsNote")}>
      <span>{t("world.kpi.contactTaps")}</span>
      <b>{whole(locale).format(taps.total)}</b>
    </div>
  );
}

/** Two tiles: median watch time and skips in the first 3 s over Ana's measured Reels, each against the day before. */
export function ViewingTiles({ viewing, t, locale }: { viewing: WorldReelViewing; t: T; locale: string }) {
  if (viewing.state !== "on") return null;
  const f = one(locale);
  const watchS = viewing.watch_ms === null ? null : viewing.watch_ms / 1000;
  const prev = viewing.previous;
  const tile = (id: "watch" | "skip", label: string, value: number | null, unit: string, before: number | null, lowerIsBetter: boolean) => (
    <div data-testid={`world-kpi-${id}`} title={t("world.kpi.reelNote", { n: id === "watch" ? viewing.reels : viewing.skip_reels })}>
      <span>{label}</span>
      <b>{value === null ? "—" : `${f.format(value)} ${unit}`}</b>
      {value === null ? null : prev ? (
        <Delta id={id} now={value} before={before} day={prev.day} unit={id === "skip" ? t("world.kpi.points") : unit} lowerIsBetter={lowerIsBetter} t={t} locale={locale} />
      ) : (
        <small className={styles.kpiDelta} data-testid={`world-kpi-${id}-delta`}>
          {viewing.store_error ? t("world.kpi.storeError") : t("world.kpi.fromTomorrow")}
        </small>
      )}
    </div>
  );
  return (
    <>
      {tile("watch", t("world.kpi.watch"), watchS, "s", prev?.watch_ms == null ? null : prev.watch_ms / 1000, false)}
      {tile("skip", t("world.kpi.skip"), viewing.skip_pct, "%", prev?.skip_pct ?? null, true)}
    </>
  );
}
