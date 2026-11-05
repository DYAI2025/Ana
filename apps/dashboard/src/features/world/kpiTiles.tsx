"use client";

import type { useI18n } from "@/components/providers/I18nProvider";
import type { WorldFollows, WorldReelViewing } from "./types";
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
