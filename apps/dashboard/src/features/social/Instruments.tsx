"use client";

import { useId } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { ageDays, formatCount, formatDay, formatIndex, formatPercent } from "./format";
import { InspectButton, useObservationSpec, type InspectorSpec } from "./Inspector";
import { MATURE_AGE_DAYS, median, MIN_GROUP_N, RATE_INPUTS, type Analysis, type HeroReading } from "./insights";
import type { CanonicalMetric, Observation, SocialSnapshot } from "./types";
import styles from "./social.module.css";

const DOMAIN_MAX = 2;
const SWEEP = 270;
const CX = 125;
const CY = 122;
const R = 92;

function point(index: number) {
  const theta = ((-SWEEP / 2 + (Math.min(index, DOMAIN_MAX) / DOMAIN_MAX) * SWEEP) * Math.PI) / 180;
  return { x: CX + R * Math.sin(theta), y: CY - R * Math.cos(theta) };
}

function arc(from: number, to: number) {
  const a = point(from);
  const b = point(to);
  const large = ((to - from) / DOMAIN_MAX) * SWEEP > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function HeroInstrument({ hero, snapshot }: { hero: HeroReading | null; snapshot: SocialSnapshot }) {
  const { t, locale } = useI18n();
  const gradientId = useId();
  const metalId = useId();
  if (!hero) {
    return (
      <section className={`glass ${styles.panel} ${styles.colHero}`} aria-labelledby="hero-title" data-testid="hero" data-state="INSUFFICIENT_EVIDENCE">
        <p className={styles.eyebrow}>{t("social.hero.eyebrow")}</p>
        <h2 id="hero-title" className={styles.panelTitle}>
          {t("social.hero.title")}
        </h2>
        <StateChip state="INSUFFICIENT_EVIDENCE" />
        <p className={styles.muted}>{t("social.hero.none", { min: MIN_GROUP_N, days: MATURE_AGE_DAYS })}</p>
      </section>
    );
  }
  const { post, group } = hero;
  const index = post.reachIndex!;
  const formatName = t(`social.formats.${group.format}`);
  const marker = point(index);
  const baseline = point(1);
  const reachObs = post.post.observations.find((o) => o.metric_name === "reach")!;
  const spec: InspectorSpec = {
    label: t("social.metrics.reach_index"),
    native: "reach",
    unit: t("social.inspector.units.ratio"),
    calculation: t("social.hero.definition"),
    period: t("social.inspector.periods.lifetime"),
    baseline: t("social.hero.baseline", { n: group.n, format: formatName }),
    source: reachObs.source_reference,
    version: reachObs.provider_api_version,
    observedAt: snapshot.observed_at,
    availability: t("social.states.DERIVED"),
  };
  return (
    <section className={`glass ${styles.panel} ${styles.colHero}`} aria-labelledby="hero-title" data-testid="hero" data-state="CONNECTED">
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>{t("social.hero.eyebrow")}</p>
          <h2 id="hero-title" className={styles.panelTitle}>
            {t("social.hero.title")}
          </h2>
        </div>
        <InspectButton spec={spec} testId="inspect-hero" />
      </div>
      <div className={styles.heroGrid}>
        <figure className={styles.heroFigure}>
          <svg viewBox="0 0 250 232" role="img" aria-label={`${t("social.hero.scaleLabel", { min: formatIndex(0, locale), max: formatIndex(DOMAIN_MAX, locale) })}: ${formatIndex(index, locale)}`}>
            <defs>
              <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c7c9ca" stopOpacity="0.55" />
                <stop offset="0.5" stopColor="#9da1a4" stopOpacity="0.35" />
                <stop offset="1" stopColor="#c7c9ca" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#c4ad91" />
                <stop offset="0.6" stopColor="#8e97a3" />
                <stop offset="1" stopColor="#bd3a23" />
              </linearGradient>
            </defs>
            <path d={arc(0, DOMAIN_MAX)} fill="none" stroke={`url(#${metalId})`} strokeWidth="9" strokeLinecap="round" />
            <path d={arc(0, Math.min(index, DOMAIN_MAX))} fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" />
            {/* 1.00× baseline marker: always visible */}
            <line x1={CX} y1={CY} x2={baseline.x} y2={baseline.y} stroke="#6a7482" strokeWidth="1.5" strokeDasharray="2 3" />
            <text x={baseline.x} y={baseline.y - 17} textAnchor="middle" className={styles.gaugeTick}>
              {formatIndex(1, locale)}
            </text>
            <circle cx={marker.x} cy={marker.y} r="9.5" fill="#a8321c" opacity="0.18" />
            <circle cx={marker.x} cy={marker.y} r="4.6" fill="#a8321c" />
            <text x={CX} y={CY + 14} textAnchor="middle" className={styles.heroValue} data-testid="hero-value">
              {formatIndex(index, locale)}
            </text>
          </svg>
          <figcaption className={styles.heroReadout}>
            {index > DOMAIN_MAX ? (
              <span className={styles.overflow} data-testid="hero-overflow">
                {t("social.hero.overflow", { value: formatIndex(index, locale) })}
              </span>
            ) : null}
            <span className={styles.muted}>{t("social.hero.baseline", { n: group.n, format: formatName })}</span>
          </figcaption>
        </figure>
        <dl className={styles.heroSide}>
          <div>
            <dt>{t("social.hero.reached")}</dt>
            <dd className={styles.mono}>{formatCount(post.reach!, locale)}</dd>
          </div>
          <div>
            <dt>{t("social.hero.median")}</dt>
            <dd className={styles.mono}>{formatCount(group.medianReach!, locale)}</dd>
          </div>
          <div>
            <dt>{t(`social.formats.${post.post.format}`)}</dt>
            <dd>
              {post.post.published_at ? t("social.hero.published", { date: formatDay(post.post.published_at, locale) }) : null}
              <br />
              {post.post.published_at ? t("social.hero.age", { days: ageDays(post.post.published_at, snapshot.observed_at) }) : null}
            </dd>
          </div>
        </dl>
      </div>
      <p className={styles.formulaLine}>
        <span className={styles.mono}>{t("social.hero.definition")}</span>
      </p>
    </section>
  );
}

export function StateChip({ state }: { state: string }) {
  const { t } = useI18n();
  return (
    <span className={styles.stateChip} data-state-chip={state}>
      <span className={styles.stateDot} aria-hidden="true" />
      {t(`social.states.${state as "CONNECTED"}`)}
    </span>
  );
}

const CLUSTER: Array<{ metric: CanonicalMetric; key: "followers" | "reach28" | "views28" | "engaged28" | "interactions28" }> = [
  { metric: "followers", key: "followers" },
  { metric: "reach", key: "reach28" },
  { metric: "views", key: "views28" },
  { metric: "accounts_engaged", key: "engaged28" },
  { metric: "total_interactions", key: "interactions28" },
];

export function MetricCluster({ snapshot, analysis }: { snapshot: SocialSnapshot; analysis: Analysis }) {
  const { t, locale } = useI18n();
  const specOf = useObservationSpec();
  // the largest format whose high-intent median rests on enough posts with verified saves and shares
  const reels = analysis.groups.filter((g) => g.nHighIntent >= MIN_GROUP_N).sort((a, b) => b.nHighIntent - a.nHighIntent)[0];
  const rates = reels ? analysis.posts.filter((p) => p.post.format === reels.format && p.excluded === null).map((p) => p.rates.high_intent_rate).filter((v): v is number => v !== null) : [];
  const rateMedian = reels ? median(rates) : null;
  const maxRate = Math.max(...rates, 0.0001);
  return (
    <section className={`${styles.panel} ${styles.panelBare} ${styles.colCluster}`} aria-labelledby="cluster-title" data-testid="cluster">
      <h2 id="cluster-title" className={styles.panelTitle}>
        {t("social.cluster.title")}
      </h2>
      <ul className={styles.clusterGrid}>
        {CLUSTER.map(({ metric, key }) => {
          const o = snapshot.account.find((x: Observation) => x.metric_name === metric);
          const label = t(`social.cluster.${key}`);
          return (
            <li key={key} className={styles.clusterItem} data-testid={`cluster-${key}`} data-availability={o?.availability_state ?? "UNAVAILABLE"}>
              <div className={styles.clusterHead}>
                <span className={styles.clusterLabel}>{label}</span>
                {o ? <InspectButton spec={specOf(o, label)} testId={`inspect-${key}`} /> : null}
              </div>
              {o && o.value !== null ? (
                <span className={styles.clusterValue}>{formatCount(o.value, locale)}</span>
              ) : (
                <StateChip state={o?.availability_state ?? "UNAVAILABLE"} />
              )}
              <span className={styles.clusterFoot}>{t("social.cluster.noChange")}</span>
            </li>
          );
        })}
        <li className={styles.clusterItem} data-testid="cluster-high-intent" data-availability={rateMedian === null ? "INSUFFICIENT_EVIDENCE" : "DERIVED"}>
          <div className={styles.clusterHead}>
            <span className={styles.clusterLabel}>{reels ? t("social.cluster.highIntent", { format: t(`social.formats.${reels.format}`), n: rates.length }) : t("social.cluster.highIntentNone")}</span>
            {rateMedian !== null && reels ? (
              <InspectButton
                testId="inspect-high-intent"
                spec={{
                  label: t("social.metrics.high_intent_rate"),
                  native: RATE_INPUTS.high_intent_rate,
                  unit: t("social.inspector.units.ratio"),
                  calculation: t("social.formulas.highIntentMedian", { n: rates.length }),
                  period: t("social.inspector.periods.lifetime"),
                  baseline: t("social.inspector.none"),
                  source: "instagram:media/*/insights#saved,shares,reach",
                  version: snapshot.provider_api_version,
                  observedAt: snapshot.observed_at,
                  availability: t("social.states.DERIVED"),
                }}
              />
            ) : null}
          </div>
          {rateMedian !== null ? (
            <>
              <span className={styles.clusterValue}>{formatPercent(rateMedian, locale)}</span>
              <span className={styles.meter} aria-hidden="true">
                <span className={styles.meterFill} style={{ width: `${Math.round((rateMedian / maxRate) * 100)}%` }} />
              </span>
            </>
          ) : (
            <StateChip state="INSUFFICIENT_EVIDENCE" />
          )}
          <span className={styles.clusterFoot}>{t("social.cluster.noChange")}</span>
        </li>
      </ul>
    </section>
  );
}
