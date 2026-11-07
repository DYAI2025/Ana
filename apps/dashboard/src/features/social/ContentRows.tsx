"use client";

import { ArrowDown, ArrowUp, ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { TAG_MIN_CONFIDENCE, type Theme } from "@/features/world/postTags";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { ageDays, formatCompact, formatCount, formatDay, formatDecimal, formatIndex, formatObservation, formatPercent } from "./format";
import { InspectButton, useObservationSpec } from "./Inspector";
import { StateChip } from "./Instruments";
import { MATURE_AGE_DAYS, RATE_INPUTS, type Analysis, type PostAnalysis, type RateName, type ThemeId } from "./insights";
import {
  categoryOf,
  categoryOptions,
  distributionOf,
  filterRows,
  keyOf,
  MIN_CATEGORY_N,
  NO_FILTERS,
  OVERVIEW_RATES,
  perHundred,
  SORT_KEYS,
  sortRows,
  summarize,
  type CategoryKey,
  type CategoryState,
  type CategorySummary,
  type Distribution,
  type Filters,
  type OverviewRate,
  type SortDir,
  type SortKey,
} from "./overview";
import { Glyph } from "./Panels";
import { assignTheme, THEMES, type ThemeOverrides } from "./themes";
import type { CanonicalMetric, SocialCategories, SocialSnapshot } from "./types";
import styles from "./social.module.css";

const DETAIL_METRICS: readonly CanonicalMetric[] = ["reach", "views", "saves", "shares", "likes", "comments", "total_interactions"];
/** Reels only (ANA-51): how long people watch and how many skip in the first 3 s */
const REEL_METRICS: readonly CanonicalMetric[] = ["avg_watch_time", "skip_rate"];
const RATES: readonly RateName[] = ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach", "high_intent_rate"];
const CAPTION_EXCERPT = 110;
const DISTRIBUTIONS: readonly Distribution[] = ["feed", "trial", "unknown"];
const COL_OF_RATE: Readonly<Record<OverviewRate, "colLikeRate" | "colShareRate" | "colSaveRate" | "colCommentRate">> = {
  likes_per_reach: "colLikeRate",
  shares_per_reach: "colShareRate",
  saves_per_reach: "colSaveRate",
  comments_per_reach: "colCommentRate",
};
/** a rate shown to Ana: a percentage with one decimal (4.2%) */
const RATE_DIGITS = 1;

type Sort = { key: SortKey; dir: SortDir };
const DEFAULT_SORT: Sort = { key: "date", dir: "desc" };

export function ContentRows({
  snapshot,
  analysis,
  categories,
  overrides,
  onOverride,
  openId,
  openSeq,
  onOpen,
}: {
  snapshot: SocialSnapshot;
  analysis: Analysis;
  /** Haiku categories from the server (ANA-60); absent or "off" = category not available */
  categories: SocialCategories | null;
  overrides: ThemeOverrides;
  onOverride: (id: string, themes: readonly ThemeId[] | null) => void;
  openId: string | null;
  /** increments on every selection, including re-selecting the open post */
  openSeq: number;
  onOpen: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const all = analysis.posts;
  const formats = [...new Set(all.map((p) => p.post.format))];
  const distributions = DISTRIBUTIONS.filter((d) => all.some((p) => distributionOf(p) === d));
  const options = useMemo(() => categoryOptions(all, categories), [all, categories]);
  const categoriesOn = categories?.state === "on";
  // a post chosen from the map or an evidence link must become visible even when a filter hides it
  // (state adjusted during render when the selection changes, not in an effect)
  const [seenSeq, setSeenSeq] = useState(openSeq);
  if (openSeq !== seenSeq) {
    setSeenSeq(openSeq);
    const chosen = all.find((p) => p.post.media_id === openId);
    if (chosen && filterRows([chosen], { ...filters, category: categories?.state === "on" ? filters.category : "all" }, categories).length === 0) setFilters(NO_FILTERS);
  }
  // a chosen category that no longer exists (categories turned off, or a refreshed snapshot without that theme) must
  // not keep filtering invisibly: it reads as "all"
  const category = categoriesOn && (filters.category === "all" || options.includes(filters.category)) ? filters.category : "all";
  const active = useMemo<Filters>(() => ({ ...filters, category }), [filters, category]);
  const filtered = useMemo(() => filterRows(all, active, categories), [all, active, categories]);
  const rows = useMemo(() => sortRows(filtered, sort.key, sort.dir), [filtered, sort]);
  const summary = useMemo(() => summarize(filtered, categories), [filtered, categories]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const dirLabel = (key: SortKey, dir: SortDir) => (key === "date" ? t(`social.overview.dirDate.${dir}`) : t(`social.overview.dir.${dir}`));
  // a new column starts with the highest (newest) values first; the active column flips its direction
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const categoryLabel = (k: CategoryKey) => (k === "uncategorised" ? t("social.overview.uncategorised") : t(`world.works.values.theme.${k}`));

  return (
    <section className={`glass ${styles.panel} ${styles.colFull}`} aria-labelledby="content-title" data-testid="content-rows">
      <div className={styles.panelHead}>
        <h2 id="content-title" className={styles.panelTitle}>
          {t("social.content.title")}
        </h2>
        <span className={styles.muted} data-testid="content-count" aria-live="polite">
          {t("social.content.count", { shown: rows.length, total: all.length })}
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.seg} role="group" aria-label={t("social.content.filterLabel")}>
          {(["all", ...formats] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filters.format === f} className={styles.segButton} onClick={() => set({ format: f })} data-testid={`content-filter-${f}`}>
              {f === "all" ? t("social.content.all") : t(`social.formats.${f}`)}
            </button>
          ))}
        </div>
        <div className={styles.seg} role="group" aria-label={t("social.overview.distributionFilter")} data-testid="distribution-filter">
          {(["all", ...distributions] as const).map((d) => (
            <button key={d} type="button" aria-pressed={filters.distribution === d} className={styles.segButton} onClick={() => set({ distribution: d })} data-testid={`distribution-filter-${d}`}>
              {d === "all" ? t("social.content.all") : t(`social.overview.distribution.${d}`)}
            </button>
          ))}
        </div>
        {categoriesOn ? (
          <label className={styles.selectField}>
            <span>{t("social.overview.categoryFilter")}</span>
            <select value={category} onChange={(e) => set({ category: e.target.value as Filters["category"] })} data-testid="category-filter">
              <option value="all">{t("social.overview.allCategories")}</option>
              {options.map((k) => (
                <option key={k} value={k}>
                  {categoryLabel(k)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={styles.selectField}>
          <span>{t("social.overview.sortLabel")}</span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":") as [SortKey, SortDir];
              setSort({ key, dir });
            }}
            data-testid="sort-select"
          >
            {SORT_KEYS.flatMap((key) =>
              (["desc", "asc"] as const).map((dir) => (
                <option key={`${key}:${dir}`} value={`${key}:${dir}`}>
                  {t("social.overview.sortOption", { column: t(`social.overview.sortBy.${key}`), dir: dirLabel(key, dir) })}
                </option>
              )),
            )}
          </select>
        </label>
      </div>
      {distributions.includes("trial") ? <p className={styles.note}>{t("social.overview.trialNote")}</p> : null}

      <CategorySummaryPanel summary={summary} n={filtered.length} on={categoriesOn} active={category} onPick={(k) => set({ category: category === k ? "all" : k })} label={categoryLabel} />

      <details className={styles.explain} data-testid="rates-explained">
        <summary>{t("social.overview.explainTitle")}</summary>
        <ul>
          {(["reach", ...OVERVIEW_RATES, "median"] as const).map((k) => (
            <li key={k}>{t(`social.overview.explain.${k}`)}</li>
          ))}
        </ul>
      </details>

      <p className="visually-hidden" aria-live="polite" data-testid="sort-status" data-sort={`${sort.key}:${sort.dir}`}>
        {t("social.overview.sortedBy", { column: t(`social.overview.sortBy.${sort.key}`), dir: dirLabel(sort.key, sort.dir) })}
      </p>
      <div className={styles.rowsHead} role="group" aria-label={t("social.overview.sortLabel")}>
        <span />
        <SortHead k="date" sort={sort} onSort={toggleSort} label={t("social.content.colPost")} />
        <span>{t("social.content.colCategory")}</span>
        <SortHead k="reach" sort={sort} onSort={toggleSort} label={t("social.content.colReach")} />
        {OVERVIEW_RATES.map((r) => (
          <SortHead key={r} k={r} sort={sort} onSort={toggleSort} label={t(`social.content.${COL_OF_RATE[r]}`)} />
        ))}
        <span />
      </div>
      <ul className={styles.rows}>
        {rows.map((p) => (
          <ContentRow
            key={p.post.media_id}
            p={p}
            snapshot={snapshot}
            category={categoryOf(p.post.media_id, categories)}
            categoryLabel={categoryLabel}
            overrides={overrides}
            onOverride={onOverride}
            open={openId === p.post.media_id}
            onToggle={() => onOpen(openId === p.post.media_id ? null : p.post.media_id)}
          />
        ))}
      </ul>
    </section>
  );
}

function SortHead({ k, sort, onSort, label }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; label: string }) {
  const { t } = useI18n();
  const active = sort.key === k;
  const column = t(`social.overview.sortBy.${k}`);
  // the accessible name starts with the visible label (WCAG 2.5.3); only the post column sorts by something else (date)
  const name = label === column ? undefined : t("social.overview.sortButtonNamed", { label, column });
  return (
    <button type="button" className={styles.sortHead} aria-pressed={active} onClick={() => onSort(k)} aria-label={name} title={t("social.overview.sortButton", { column })} data-testid={`sort-${k}`} data-dir={active ? sort.dir : undefined}>
      <span>{label}</span>
      {active ? sort.dir === "desc" ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" /> : null}
    </button>
  );
}

function CategorySummaryPanel({ summary, n, on, active, onPick, label }: { summary: CategorySummary[]; n: number; on: boolean; active: Filters["category"]; onPick: (k: CategoryKey) => void; label: (k: CategoryKey) => string }) {
  const { t, locale } = useI18n();
  if (!on) {
    return (
      <section className={styles.summary} aria-labelledby="summary-title" data-testid="category-summary" data-state="unavailable">
        <h3 id="summary-title" className={styles.detailTitle}>
          {t("social.overview.summaryTitle")}
        </h3>
        <p className={styles.muted}>
          <strong>{t("social.overview.unavailable")}.</strong> {t("social.overview.unavailableNote")}
        </p>
      </section>
    );
  }
  return (
    <section className={styles.summary} aria-labelledby="summary-title" data-testid="category-summary" data-state="on">
      <h3 id="summary-title" className={styles.detailTitle}>
        {t("social.overview.summaryTitle")}
      </h3>
      <p className={styles.note}>{t("social.overview.summaryNote", { n, min: Math.round(TAG_MIN_CONFIDENCE * 100) })}</p>
      {summary.length === 0 ? <p className={styles.muted}>{t("social.overview.summaryEmpty")}</p> : null}
      <ul className={styles.summaryList}>
        {summary.map((s) => (
          <li key={s.key} className={styles.summaryItem} data-testid="summary-category" data-category={s.key} data-n={s.n}>
            <button type="button" className={styles.summaryPick} aria-pressed={active === s.key} onClick={() => onPick(s.key)} data-testid="summary-pick" title={active === s.key ? t("social.overview.summaryFilterOff") : t("social.overview.summaryFilter", { category: label(s.key) })}>
              <span className={styles.summaryName}>{label(s.key)}</span>
              <span className={styles.summaryMeta} data-testid="summary-n">
                {s.n === 1 ? t("social.overview.summaryPostsOne") : t("social.overview.summaryPosts", { n: s.n })}
              </span>
            </button>
            <p className={styles.summaryMeta} data-testid="summary-formats">
              {t("social.overview.summaryFormats", { formats: s.formats.map((f) => `${t(`social.formats.${f.format}`)} ${f.n}`).join(" · ") })}
              {s.young ? ` · ${t("social.overview.summaryYoung", { n: s.young })}` : ""}
            </p>
            <dl className={styles.summaryRates}>
              {OVERVIEW_RATES.map((r) => {
                const v = s.rates[r];
                return (
                  <div key={r} data-testid={`summary-${r}`} data-n={v.n}>
                    <dt>{t(`social.content.${COL_OF_RATE[r]}`)}</dt>
                    <dd>
                      {v.median !== null ? (
                        <>
                          <span className={styles.mono}>{formatPercent(v.median, locale, RATE_DIGITS)}</span> <span className={styles.summaryMeta}>{t("social.overview.summaryRateN", { n: v.n })}</span>
                        </>
                      ) : (
                        <span className={styles.missing} title={t("social.overview.tooFewNote", { min: MIN_CATEGORY_N })}>
                          {t("social.overview.tooFew")}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
      {summary.some((s) => OVERVIEW_RATES.some((r) => s.rates[r].median === null)) ? <p className={styles.note}>{t("social.overview.tooFewNote", { min: MIN_CATEGORY_N })}</p> : null}
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

function CategoryCell({ category, label }: { category: CategoryState; label: (k: CategoryKey) => string }) {
  const { t } = useI18n();
  const k = keyOf(category);
  return (
    <span className={styles.rowMetric} data-testid="row-category" data-category={category.kind === "theme" ? category.theme : category.kind}>
      <span className={styles.rowMetricLabel}>{t("social.content.colCategory")}</span>
      {category.kind === "theme" ? <span className={styles.categoryChip}>{label(category.theme as Theme)}</span> : <span className={styles.missing}>{k ? label(k) : t("social.overview.unavailable")}</span>}
    </span>
  );
}

function ContentRow({
  p,
  snapshot,
  category,
  categoryLabel,
  overrides,
  onOverride,
  open,
  onToggle,
}: {
  p: PostAnalysis;
  snapshot: SocialSnapshot;
  category: CategoryState;
  categoryLabel: (k: CategoryKey) => string;
  overrides: ThemeOverrides;
  onOverride: (id: string, themes: readonly ThemeId[] | null) => void;
  open: boolean;
  onToggle: () => void;
}) {
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
  // Meta's is_shared_to_feed false: a trial Reel, shown to non-followers only (unknown flag = not labelled)
  const trial = distributionOf(p) === "trial";
  // lifetime counts keep growing for the first days (MATURE_AGE_DAYS): such posts are marked, never hidden
  const growing = p.ageDays !== null && !p.mature;
  const reachObs = post.observations.find((x) => x.metric_name === "reach");
  // a rate is missing when its inputs are not verified or reach is 0: named, never 0 (ANA-38 AC8)
  const missingState = reachObs?.availability_state === "NOT_FETCHED" ? "NOT_FETCHED" : "UNAVAILABLE";
  return (
    <li ref={ref} className={styles.row} data-testid="content-row" data-media-id={post.media_id} data-format={post.format} data-insights={post.insights_state} data-trial={trial ? "true" : undefined} data-growing={growing ? "true" : undefined}>
      <div className={styles.rowMain}>
        <Thumb p={p} />
        <div className={styles.rowText}>
          <span className={styles.rowMeta}>
            {t(`social.formats.${post.format}`)} · {post.published_at ? formatDay(post.published_at, locale) : "—"}
            {trial ? <span data-testid="row-trial"> · {t("social.content.trial")}</span> : null}
            {growing ? (
              <span className={styles.growing} data-testid="row-growing" title={t("social.overview.growingNote", { days: MATURE_AGE_DAYS })}>
                {" "}
                · {t("social.overview.growing")}
              </span>
            ) : null}
          </span>
          <span className={styles.rowCaption} data-caption>
            {excerpt || t("social.content.noCaption")}
          </span>
        </div>
        <CategoryCell category={category} label={categoryLabel} />
        <span className={styles.rowMetric} data-metric="reach" data-availability={reachObs?.availability_state ?? "UNAVAILABLE"}>
          <span className={styles.rowMetricLabel}>{t("social.content.colReach")}</span>
          {p.reach !== null ? <span className={styles.mono}>{formatCompact(p.reach, locale)}</span> : <span className={styles.missing}>{t(`social.states.${reachObs?.availability_state ?? "UNAVAILABLE"}`)}</span>}
        </span>
        {OVERVIEW_RATES.map((r) => {
          const v = p.rates[r];
          return (
            <span key={r} className={styles.rowMetric} data-rate={r} data-availability={v === null ? missingState : "DERIVED"} data-value={v ?? undefined}>
              <span className={styles.rowMetricLabel}>{t(`social.content.${COL_OF_RATE[r]}`)}</span>
              {v !== null ? <span className={styles.mono}>{formatPercent(v, locale, RATE_DIGITS)}</span> : <span className={styles.missing}>{t(`social.states.${missingState}`)}</span>}
            </span>
          );
        })}
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
              <div>
                <dt>{t("social.content.reachIndex")}</dt>
                <dd data-testid="row-index">
                  {p.reachIndex !== null ? (
                    <span className={`${styles.mono} ${p.reachIndex < 1 ? styles.low : ""}`}>{formatIndex(p.reachIndex, locale)}</span>
                  ) : (
                    <span className={styles.missing}>{p.excluded ? t(`social.content.excluded.${p.excluded}`) : "—"}</span>
                  )}
                </dd>
              </div>
            </dl>
            <h3 className={styles.detailTitle}>{t("social.overview.plainTitle")}</h3>
            <ul className={styles.plainList} data-testid="rates-plain">
              {OVERVIEW_RATES.map((r) => {
                const v = p.rates[r];
                return (
                  <li key={r} data-testid={`plain-${r}`}>
                    {v !== null ? t(`social.overview.plain.${r}`, { x: formatDecimal(perHundred(v), locale) }) : `${t(`social.content.${COL_OF_RATE[r]}`)}: ${t(`social.states.${missingState}`)}`}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h3 className={styles.detailTitle}>{t("social.content.providerMetrics")}</h3>
            <ul className={styles.metricGrid}>
              {DETAIL_METRICS.map((m) => {
                const o = post.observations.find((x) => x.metric_name === m);
                return (
                  <li key={m} className={styles.metricCell} data-metric={m} data-availability={o?.availability_state ?? "UNAVAILABLE"}>
                    <span className={styles.cellLabel}>{metricLabel(m)}</span>
                    {o && o.value !== null ? <span className={styles.mono}>{formatCount(o.value, locale)}</span> : <StateChip state={o?.availability_state ?? "UNAVAILABLE"} />}
                    {o ? <InspectButton spec={specOf(o, metricLabel(m))} testId={`inspect-${m}`} /> : null}
                  </li>
                );
              })}
            </ul>
            {post.format === "reel" ? (
              <>
                <h3 className={styles.detailTitle}>{t("social.content.reelViewing")}</h3>
                <ul className={styles.metricGrid} data-testid="reel-viewing">
                  {REEL_METRICS.map((m) => {
                    const o = post.observations.find((x) => x.metric_name === m);
                    return (
                      <li key={m} className={styles.metricCell} data-availability={o?.availability_state ?? "UNAVAILABLE"} data-testid={`reel-${m}`}>
                        <span className={styles.cellLabel}>{metricLabel(m)}</span>
                        {o && o.value !== null ? <span className={styles.mono}>{formatObservation({ value: o.value, unit: o.unit }, locale)}</span> : <StateChip state={o?.availability_state ?? "UNAVAILABLE"} />}
                        {o ? <InspectButton spec={specOf(o, metricLabel(m))} testId={`inspect-${m}`} /> : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
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
            <p className={styles.chips} data-testid="offer-themes">
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
