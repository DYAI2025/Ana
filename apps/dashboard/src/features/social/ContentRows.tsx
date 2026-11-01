"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { ageDays, formatCompact, formatCount, formatDay, formatIndex, formatPercent } from "./format";
import { InspectButton, useObservationSpec } from "./Inspector";
import { StateChip } from "./Instruments";
import { RATE_INPUTS, verified, type Analysis, type PostAnalysis, type RateName, type ThemeId } from "./insights";
import { Glyph } from "./Panels";
import { assignTheme, THEMES, type ThemeOverrides } from "./themes";
import type { CanonicalMetric, PostFormat, SocialSnapshot } from "./types";
import styles from "./social.module.css";

const ROW_METRICS: readonly CanonicalMetric[] = ["reach", "views", "saves", "shares", "comments"];
const DETAIL_METRICS: readonly CanonicalMetric[] = ["reach", "views", "saves", "shares", "likes", "comments", "total_interactions"];
const RATES: readonly RateName[] = ["saves_per_reach", "shares_per_reach", "comments_per_reach", "high_intent_rate"];
const CAPTION_EXCERPT = 110;

export function ContentRows({
  snapshot,
  analysis,
  overrides,
  onOverride,
  openId,
  openSeq,
  onOpen,
}: {
  snapshot: SocialSnapshot;
  analysis: Analysis;
  overrides: ThemeOverrides;
  onOverride: (id: string, themes: readonly ThemeId[] | null) => void;
  openId: string | null;
  /** increments on every selection, including re-selecting the open post */
  openSeq: number;
  onOpen: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<PostFormat | "all">("all");
  const formats = [...new Set(analysis.posts.map((p) => p.post.format))];
  // a post chosen from the map or an evidence link must become visible even when the format filter hides it
  // (state adjusted during render when the selection changes, not in an effect)
  const [seenSeq, setSeenSeq] = useState(openSeq);
  if (openSeq !== seenSeq) {
    setSeenSeq(openSeq);
    const chosen = analysis.posts.find((p) => p.post.media_id === openId);
    if (chosen && filter !== "all" && chosen.post.format !== filter) setFilter("all");
  }
  const rows = analysis.posts.filter((p) => filter === "all" || p.post.format === filter);
  return (
    <section className={`glass ${styles.panel} ${styles.colFull}`} aria-labelledby="content-title" data-testid="content-rows">
      <div className={styles.panelHead}>
        <h2 id="content-title" className={styles.panelTitle}>
          {t("social.content.title")}
        </h2>
        <div className={styles.headRight}>
          <div className={styles.seg} role="group" aria-label={t("social.content.filterLabel")}>
            {(["all", ...formats] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={styles.segButton} onClick={() => setFilter(f)} data-testid={`content-filter-${f}`}>
                {f === "all" ? t("social.content.all") : t(`social.formats.${f}`)}
              </button>
            ))}
          </div>
          <span className={styles.muted} data-testid="content-count">
            {t("social.content.count", { shown: rows.length, total: analysis.posts.length })}
          </span>
        </div>
      </div>
      <div className={styles.rowsHead} aria-hidden="true">
        <span />
        <span>{t("social.content.colPost")}</span>
        <span>{t("social.content.colReach")}</span>
        <span>{t("social.content.colViews")}</span>
        <span>{t("social.content.colSaves")}</span>
        <span>{t("social.content.colShares")}</span>
        <span>{t("social.content.colComments")}</span>
        <span>{t("social.content.colIndex")}</span>
        <span />
      </div>
      <ul className={styles.rows}>
        {rows.map((p) => (
          <ContentRow key={p.post.media_id} p={p} snapshot={snapshot} overrides={overrides} onOverride={onOverride} open={openId === p.post.media_id} onToggle={() => onOpen(openId === p.post.media_id ? null : p.post.media_id)} />
        ))}
      </ul>
    </section>
  );
}

function Thumb({ p }: { p: PostAnalysis }) {
  const [broken, setBroken] = useState(false);
  const picture = p.post.thumbnail_url ?? p.post.image_url ?? null;
  if (picture && !broken) {
    // Instagram CDN URL, rendered as-is (no proxy, no copy); decorative because the caption follows
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.thumb} src={picture} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <svg className={styles.thumb} viewBox="0 0 52 52" aria-hidden="true">
      <Glyph format={p.post.format} x={26} y={27} size={9} />
    </svg>
  );
}

function ContentRow({ p, snapshot, overrides, onOverride, open, onToggle }: { p: PostAnalysis; snapshot: SocialSnapshot; overrides: ThemeOverrides; onOverride: (id: string, themes: readonly ThemeId[] | null) => void; open: boolean; onToggle: () => void }) {
  const { t, locale } = useI18n();
  const specOf = useObservationSpec();
  const ref = useRef<HTMLLIElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const themeEditId = useId();
  const [editing, setEditing] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    // opened from elsewhere (map, evidence link): bring keyboard focus to the opened post
    if (ref.current && !ref.current.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
  }, [open, reduced]);
  const post = p.post;
  const caption = post.caption ?? "";
  const excerpt = caption.length > CAPTION_EXCERPT ? `${caption.slice(0, CAPTION_EXCERPT).trimEnd()}…` : caption;
  const theme = assignTheme(post, overrides);
  const detailId = `detail-${post.media_id}`;
  const metricLabel = (m: CanonicalMetric) => t(`social.metrics.${m as "reach"}`);
  return (
    <li ref={ref} className={styles.row} data-testid="content-row" data-media-id={post.media_id} data-format={post.format} data-insights={post.insights_state}>
      <div className={styles.rowMain}>
        <Thumb p={p} />
        <div className={styles.rowText}>
          <span className={styles.rowMeta}>
            {t(`social.formats.${post.format}`)} · {post.published_at ? formatDay(post.published_at, locale) : "—"}
          </span>
          <span className={styles.rowCaption} data-caption>
            {excerpt || t("social.content.noCaption")}
          </span>
        </div>
        {ROW_METRICS.map((m) => {
          const v = verified(post, m);
          const o = post.observations.find((x) => x.metric_name === m);
          return (
            <span key={m} className={styles.rowMetric} data-metric={m} data-availability={o?.availability_state ?? "UNAVAILABLE"}>
              <span className={styles.rowMetricLabel}>{metricLabel(m)}</span>
              {v !== null ? <span className={styles.mono}>{formatCompact(v, locale)}</span> : <span className={styles.missing}>{t(`social.states.${o?.availability_state ?? "UNAVAILABLE"}`)}</span>}
            </span>
          );
        })}
        <span className={styles.rowIndex}>
          <span className={styles.rowMetricLabel}>{t("social.content.colIndex")}</span>
          <span data-testid="row-index">
            {p.reachIndex !== null ? (
              <span className={`${styles.mono} ${p.reachIndex < 1 ? styles.low : ""}`}>{formatIndex(p.reachIndex, locale)}</span>
            ) : (
              <span className={styles.missing}>{p.excluded ? t(`social.content.excluded.${p.excluded}`) : "—"}</span>
            )}
          </span>
        </span>
        <span className={styles.rowActions}>
          {post.permalink ? (
            <a className={styles.iconButton} href={post.permalink} target="_blank" rel="noreferrer noopener" aria-label={t("social.content.open")} data-testid="row-permalink">
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : null}
          <button ref={toggleRef} type="button" className={styles.iconButton} aria-expanded={open} aria-controls={detailId} onClick={onToggle} aria-label={open ? t("social.content.hideDetails") : t("social.content.details")} data-testid="row-toggle">
            <ChevronDown size={16} aria-hidden="true" className={open ? styles.chevOpen : undefined} />
          </button>
        </span>
      </div>
      {open ? (
        <div id={detailId} className={styles.detail} data-testid="row-detail">
          <div className={styles.detailCaption}>
            <p className={styles.detailCaptionText} data-caption>
              {caption || t("social.content.noCaption")}
            </p>
            <p className={styles.note}>{t("social.content.captionLocal")}</p>
            <dl className={styles.kv}>
              <div>
                <dt>{t("social.content.published")}</dt>
                <dd>{post.published_at ? formatDay(post.published_at, locale) : "—"}</dd>
              </div>
              <div>
                <dt>{t("social.content.ageLabel")}</dt>
                <dd>{post.published_at ? t("social.content.ageDays", { days: ageDays(post.published_at, snapshot.observed_at) }) : "—"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className={styles.detailTitle}>{t("social.content.providerMetrics")}</h3>
            <ul className={styles.metricGrid}>
              {DETAIL_METRICS.map((m) => {
                const o = post.observations.find((x) => x.metric_name === m);
                return (
                  <li key={m} className={styles.metricCell} data-availability={o?.availability_state ?? "UNAVAILABLE"}>
                    <span className={styles.cellLabel}>{metricLabel(m)}</span>
                    {o && o.value !== null ? <span className={styles.mono}>{formatCount(o.value, locale)}</span> : <StateChip state={o?.availability_state ?? "UNAVAILABLE"} />}
                    {o ? <InspectButton spec={specOf(o, metricLabel(m))} testId={`inspect-${m}`} /> : null}
                  </li>
                );
              })}
            </ul>
            <h3 className={styles.detailTitle}>{t("social.content.derivedRates")}</h3>
            <ul className={styles.metricGrid}>
              {RATES.map((r) => {
                const v = p.rates[r];
                return (
                  <li key={r} className={`${styles.metricCell} ${styles.derivedCell}`} data-testid={`rate-${r}`}>
                    <span className={styles.cellLabel}>{t(`social.metrics.${r}`)}</span>
                    {v !== null ? <span className={styles.mono}>{formatPercent(v, locale)}</span> : <StateChip state="INSUFFICIENT_EVIDENCE" />}
                    <InspectButton
                      testId={`inspect-rate-${r}`}
                      spec={{
                        label: t(`social.metrics.${r}`),
                        native: RATE_INPUTS[r],
                        unit: t("social.inspector.units.ratio"),
                        calculation: t(`social.formulas.${r}`),
                        period: t("social.inspector.periods.lifetime"),
                        baseline: t("social.inspector.none"),
                        source: `instagram:media/${post.media_id}/insights`,
                        version: snapshot.provider_api_version,
                        observedAt: snapshot.observed_at,
                        availability: v === null ? t("social.states.INSUFFICIENT_EVIDENCE") : t("social.states.DERIVED"),
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          <div className={styles.detailSide}>
            <h3 className={styles.detailTitle}>{t("social.content.themes")}</h3>
            <p className={styles.chips}>
              {theme.themes.length ? theme.themes.map((th) => <span key={th} className={styles.themeChip}>{t(`social.themes.${th}`)}</span>) : <span className={styles.muted}>{t("social.content.themeNone")}</span>}
            </p>
            <p className={styles.note} data-testid="theme-provenance" data-source={theme.source}>
              {theme.source === "derived-keyword" ? t("social.content.themeDerived", { words: theme.matched.join(", ") }) : theme.source === "manual-session" ? t("social.content.themeManual") : t("social.content.themeNone")}
            </p>
            <button type="button" className={styles.linkButton} aria-expanded={editing} aria-controls={themeEditId} onClick={() => setEditing((e) => !e)} data-testid="edit-themes">
              {editing ? t("social.content.doneThemes") : t("social.content.editThemes")}
            </button>
            {editing ? (
              <fieldset id={themeEditId} className={styles.themeEdit}>
                <legend className="visually-hidden">{t("social.content.editThemes")}</legend>
                {THEMES.map((th) => (
                  <label key={th} className={styles.checkbox}>
                    <input type="checkbox" checked={theme.themes.includes(th)} onChange={(e) => onOverride(post.media_id, e.target.checked ? [...theme.themes, th] : theme.themes.filter((x) => x !== th))} />
                    {t(`social.themes.${th}`)}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
