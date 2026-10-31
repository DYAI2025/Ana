"use client";

import { useId, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { formatDay, formatIndex } from "./format";
import { StateChip } from "./Instruments";
import { MATURE_AGE_DAYS, MIN_PATTERN_GROUP_N, MIN_THEME_N, patternObservations, type Analysis, type Comparator, type PatternResult, type PostAnalysis, type ThemeOf } from "./insights";
import { COMMERCIAL_SIGNALS, engagementComparison, HYPOTHESES, hypothesisEvidence, themeSignals, type Decision, type EligiblePost, type HypothesisEvidence, type TopicalFitOf } from "./offers";
import type { CandidateHypothesis } from "./themes";
import styles from "./social.module.css";

type Tab = "observations" | "offers";

export function PatternsPanel({ analysis, themeOf, fitOf, stale, onSelect }: { analysis: Analysis; themeOf: ThemeOf; fitOf: TopicalFitOf; stale: boolean; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("observations");
  // the analyst's next-evidence choice per hypothesis: this session only, nothing is collected, sent or stored
  const [decisions, setDecisions] = useState<Partial<Record<CandidateHypothesis, Decision>>>({});
  const base = useId();
  const tabs: Tab[] = ["observations", "offers"];
  return (
    <section className={`glass ${styles.panel} ${styles.colMain}`} aria-labelledby={`${base}-title`} data-testid="patterns">
      <div className={styles.panelHead}>
        <h2 id={`${base}-title`} className={styles.panelTitle}>
          {t("social.patterns.title")}
        </h2>
        <div role="tablist" aria-label={t("social.patterns.title")} className={styles.seg}>
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${base}-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`${base}-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={styles.segButton}
              data-testid={`tab-${id}`}
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const next = tabs[(tabs.indexOf(id) + 1) % tabs.length]!;
                  setTab(next);
                  document.getElementById(`${base}-tab-${next}`)?.focus();
                }
              }}
            >
              {id === "observations" ? t("social.patterns.tabObservations") : t("social.patterns.tabOffers")}
            </button>
          ))}
        </div>
      </div>
      {/* both panels exist so every tab's aria-controls resolves; the inactive one is hidden */}
      <div role="tabpanel" id={`${base}-panel-observations`} aria-labelledby={`${base}-tab-observations`} hidden={tab !== "observations"}>
        {tab === "observations" ? <Observations analysis={analysis} themeOf={themeOf} onSelect={onSelect} /> : null}
      </div>
      <div role="tabpanel" id={`${base}-panel-offers`} aria-labelledby={`${base}-tab-offers`} hidden={tab !== "offers"}>
        {tab === "offers" ? <OfferSignals analysis={analysis} themeOf={themeOf} fitOf={fitOf} stale={stale} decisions={decisions} onDecide={(h, d) => setDecisions((x) => ({ ...x, [h]: d }))} onSelect={onSelect} /> : null}
      </div>
    </section>
  );
}

function PostLink({ p, onSelect }: { p: PostAnalysis | undefined; onSelect: (id: string) => void }) {
  const { t, locale } = useI18n();
  if (!p) return null;
  return (
    <button type="button" className={styles.linkButton} onClick={() => onSelect(p.post.media_id)} data-testid="evidence-post">
      {t(`social.formats.${p.post.format}`)} · {p.post.published_at ? formatDay(p.post.published_at, locale) : "—"}
      {p.contentActionIndex !== null ? ` · ${formatIndex(p.contentActionIndex, locale)}` : ""}
    </button>
  );
}

function useComparatorText() {
  const { t } = useI18n();
  return (c: Comparator) =>
    c.kind === "format-median" ? t("social.comparators.formatMedian", { n: c.n, format: t(`social.formats.${c.format}`) }) : t("social.comparators.withinFormat", { n: c.n });
}

function Observations({ analysis, themeOf, onSelect }: { analysis: Analysis; themeOf: ThemeOf; onSelect: (id: string) => void }) {
  const { t, locale } = useI18n();
  const comparatorText = useComparatorText();
  const results = patternObservations(analysis, themeOf);
  const post = (id: string) => analysis.posts.find((p) => p.post.media_id === id);
  return (
    <ul className={styles.observations}>
      {results.map((r: PatternResult) => {
        const kind = r.state === "OBSERVED" ? r.evidence.kind : r.kind;
        return (
          <li key={kind} className={styles.observation} data-testid={`observation-${kind}`} data-state={r.state}>
            <div className={styles.panelHead}>
              <h3 className={styles.detailTitle}>{t(`social.patterns.kinds.${kind}`)}</h3>
              <StateChip state={r.state === "OBSERVED" ? "DERIVED" : "INSUFFICIENT_EVIDENCE"} />
            </div>
            {r.state === "INSUFFICIENT_EVIDENCE" ? (
              <p className={styles.muted}>{t(`social.patterns.reasons.${r.reason}`)}</p>
            ) : (
              <>
                <p className={styles.observationLead}>
                  {r.evidence.subject.type === "theme"
                    ? t("social.patterns.subjectTheme", { theme: t(`social.themes.${r.evidence.subject.theme}`) })
                    : t("social.patterns.subjectPost", { date: post(r.evidence.subject.mediaId)?.post.published_at ? formatDay(post(r.evidence.subject.mediaId)!.post.published_at!, locale) : "—" })}
                  {" · "}
                  <span className={styles.mono}>{t("social.patterns.index", { index: formatIndex(r.evidence.index, locale) })}</span>
                </p>
                <dl className={styles.kv}>
                  <div>
                    <dt>{t("social.patterns.sampleLabel")}</dt>
                    <dd className={styles.mono}>{r.evidence.sampleN}</dd>
                  </div>
                  <div>
                    <dt>{t("social.patterns.formula")}</dt>
                    <dd>{t(`social.formulas.${r.evidence.formula}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("social.patterns.comparator")}</dt>
                    <dd>{comparatorText(r.evidence.comparator)}</dd>
                  </div>
                  <div>
                    <dt>{t("social.patterns.windowLabel")}</dt>
                    <dd>{t("social.patterns.window", { from: formatDay(r.evidence.window.from, locale), to: formatDay(r.evidence.window.to, locale) })}</dd>
                  </div>
                </dl>
                <details className={styles.evidence}>
                  <summary>
                    {t("social.patterns.sources")} ({r.evidence.sourcePosts.length})
                  </summary>
                  <p className={styles.chips}>
                    {r.evidence.sourcePosts.slice(0, 12).map((id) => (
                      <PostLink key={id} p={post(id)} onSelect={onSelect} />
                    ))}
                  </p>
                  <p className={styles.detailTitle}>{t("social.patterns.counter")}</p>
                  <p className={styles.chips}>
                    {r.evidence.counterexamples.length ? r.evidence.counterexamples.slice(0, 6).map((id) => <PostLink key={id} p={post(id)} onSelect={onSelect} />) : <span className={styles.muted}>{t("social.patterns.noCounter")}</span>}
                  </p>
                  <p className={styles.detailTitle}>{t("social.patterns.limits")}</p>
                  <ul className={styles.limits}>
                    {r.evidence.limitations.map((l) => (
                      <li key={l}>{t(`social.patterns.limitations.${l}`)}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OfferSignals({
  analysis,
  themeOf,
  fitOf,
  stale,
  decisions,
  onDecide,
  onSelect,
}: {
  analysis: Analysis;
  themeOf: ThemeOf;
  fitOf: TopicalFitOf;
  stale: boolean;
  decisions: Partial<Record<CandidateHypothesis, Decision>>;
  onDecide: (h: CandidateHypothesis, d: Decision) => void;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const evidence = hypothesisEvidence(analysis, fitOf, { stale });
  const themes = themeSignals(analysis, themeOf);
  const comparison = engagementComparison(evidence);
  const [inspected, setInspected] = useState<string | null>(null);
  const cell = (v: number | null) => (v !== null ? formatIndex(v, locale) : "—");
  return (
    <div className={styles.offers} data-testid="offer-signals">
      <p className={styles.note}>{t("social.offers.intro")}</p>
      <div className={styles.hypotheses}>
        {evidence.map((e) => (
          <HypothesisCard key={e.hypothesis.id} e={e} open={inspected === e.hypothesis.id} onToggle={() => setInspected(inspected === e.hypothesis.id ? null : e.hypothesis.id)} decision={decisions[e.hypothesis.id]} onDecide={(d) => onDecide(e.hypothesis.id, d)} onSelect={onSelect} />
        ))}
      </div>
      <p className={styles.chips}>
        {HYPOTHESES.filter((h) => h.status === "parked").map((h) => (
          <span key={h.id} className={styles.parked} data-testid={`parked-${h.id}`}>
            {t(`social.offers.${h.id as "H2" | "H3"}`)} · {t("social.offers.parked")}
          </span>
        ))}
      </p>
      <article className={styles.nextTest} data-testid="engagement-comparison" data-state={comparison.state}>
        <h3 className={styles.detailTitle}>{t("social.offers.comparisonTitle")}</h3>
        <p className={styles.note} data-testid="comparison-n">
          {t("social.offers.comparisonN", { h1: comparison.nH1Only, h4: comparison.nH4Only, both: comparison.nBoth, min: MIN_PATTERN_GROUP_N })}
        </p>
        {comparison.state === "DESCRIPTIVE" ? (
          <p className={styles.mono} data-testid="comparison-values">
            {t("social.offers.comparisonValues", { h1: cell(comparison.medianH1Only), h4: cell(comparison.medianH4Only), d: formatSigned(comparison.difference!, locale) })}
          </p>
        ) : (
          <StateChip state="INSUFFICIENT_EVIDENCE" />
        )}
        <p className={styles.note}>{t("social.offers.comparisonNote")}</p>
      </article>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.detailTitle}>{t("social.offers.themeTable")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("social.offers.colTheme")}</th>
              <th scope="col">{t("social.offers.colN")}</th>
              <th scope="col">{t("social.offers.colSaves")}</th>
              <th scope="col">{t("social.offers.colShares")}</th>
              <th scope="col">{t("social.offers.colIndex")}</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((th) => (
              <tr key={th.theme} data-testid={`theme-row-${th.theme}`} data-state={th.state}>
                <th scope="row">{t(`social.themes.${th.theme}`)}</th>
                <td className={styles.mono}>{th.n}</td>
                {th.state === "INSUFFICIENT_EVIDENCE" ? (
                  <td colSpan={3}>
                    <StateChip state="INSUFFICIENT_EVIDENCE" />
                  </td>
                ) : (
                  <>
                    <td className={styles.mono}>{cell(th.medianSavesIndex)}</td>
                    <td className={styles.mono}>{cell(th.medianSharesIndex)}</td>
                    <td className={styles.mono}>{cell(th.medianContentActionIndex)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note}>{t("social.offers.tableNote")}</p>
      </div>
      <div data-testid="commercial">
        <h3 className={styles.detailTitle}>{t("social.offers.commercialTitle")}</h3>
        <ul className={styles.commercial}>
          {COMMERCIAL_SIGNALS.map((c) => (
            <li key={c} data-testid={`commercial-${c}`} data-state="NOT_CONNECTED">
              <span>{t(`social.offers.commercial.${c}`)}</span>
              <StateChip state="NOT_CONNECTED" />
            </li>
          ))}
        </ul>
        <p className={styles.note}>{t("social.offers.commercialNote")}</p>
      </div>
    </div>
  );
}

/** Signed difference in index points, e.g. "+0.30" (never a percentage). */
function formatSigned(v: number, locale: string) {
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(v);
  return s;
}

function HypothesisCard({ e, open, onToggle, decision, onDecide, onSelect }: { e: HypothesisEvidence; open: boolean; onToggle: () => void; decision: Decision | undefined; onDecide: (d: Decision) => void; onSelect: (id: string) => void }) {
  const { t, locale } = useI18n();
  const id = e.hypothesis.id;
  const base = useId();
  const tf = e.topicalFit;
  const res = e.contentResonance;
  const options: Decision[] = ["ABSTAIN", ...e.nextActions];
  // a step chosen before the evidence changed (e.g. a session correction) no longer offered → nothing chosen
  const chosen = decision !== undefined && options.includes(decision) ? decision : undefined;
  return (
    <article className={styles.hypothesis} data-testid={`hypothesis-${id}`} data-topical={tf.state} data-resonance={res.state}>
      <div className={styles.panelHead}>
        <h3 className={styles.detailTitle}>{t(`social.offers.${id}`)}</h3>
        <StateChip state="HYPOTHESIS" />
      </div>
      <p className={styles.muted}>{t(`social.offers.${id}Desc`)}</p>
      <p className={styles.note}>{t(`social.offers.${id}Rule`)}</p>
      <ul className={styles.lanes} aria-label={t("social.offers.lanesLabel", { id })}>
        <li className={styles.lane} data-testid={`lane-${id}-TOPICAL_FIT`} data-state={tf.state}>
          <span className={styles.laneHead}>
            {t("social.offers.lanes.TOPICAL_FIT")}
            <StateChip state={tf.state} />
          </span>
          <span className={styles.note}>
            {tf.state === "UNCLASSIFIED" ? t("social.offers.topicalNone") : t("social.offers.topicalSummary", { n: tf.eligible.length, derived: tf.nDerived, manual: tf.nManual, overlap: tf.nOverlap })}
          </span>
          <span className={styles.note}>{t("social.offers.durableReview")}</span>
        </li>
        <li className={styles.lane} data-testid={`lane-${id}-CONTENT_RESONANCE`} data-state={res.state}>
          <span className={styles.laneHead}>
            {t("social.offers.lanes.CONTENT_RESONANCE")}
            <StateChip state={res.state} />
          </span>
          <span className={styles.note}>
            {res.state === "OBSERVED"
              ? t("social.offers.resonanceSummary", { index: formatIndex(res.medianIndex!, locale), n: res.nIndexed, of: res.nEligible })
              : t("social.offers.resonanceInsufficient", { n: res.nIndexed, of: res.nEligible, min: MIN_THEME_N })}
          </span>
          <span className={styles.note}>{t("social.offers.resonanceNotNeed")}</span>
        </li>
        <li className={styles.lane} data-testid={`lane-${id}-AUDIENCE_NEED`} data-state={e.audienceNeed.state}>
          <span className={styles.laneHead}>
            {t("social.offers.lanes.AUDIENCE_NEED")}
            <StateChip state="NOT_CONNECTED" />
          </span>
          <span className={styles.note}>{t("social.offers.audienceNote")}</span>
        </li>
        <li className={styles.lane} data-testid={`lane-${id}-COMMERCIAL_OUTCOME`} data-state={e.commercialOutcome.state}>
          <span className={styles.laneHead}>
            {t("social.offers.lanes.COMMERCIAL_OUTCOME")}
            <StateChip state="NOT_CONNECTED" />
          </span>
          <span className={styles.note}>{t("social.offers.commercialNote")}</span>
        </li>
      </ul>
      <fieldset className={styles.decision} data-testid={`decision-${id}`} data-suggested={e.suggested} data-chosen={chosen ?? ""}>
        <legend>{t("social.offers.decisionLegend")}</legend>
        <p className={styles.note} data-testid={`suggested-${id}`}>
          {t("social.offers.suggested", { action: t(`social.offers.actions.${e.suggested}`) })}
        </p>
        {options.map((o) => (
          <label key={o} className={styles.checkbox}>
            <input type="radio" name={`${base}-decision`} value={o} checked={chosen === o} onChange={() => onDecide(o)} data-testid={`decide-${id}-${o}`} />
            {t(`social.offers.actions.${o}`)}
          </label>
        ))}
        <p className={styles.note} role="status" data-testid={`decision-note-${id}`}>
          {chosen ? t("social.offers.decisionChosen", { action: t(`social.offers.actions.${chosen}`) }) : t("social.offers.decisionNone")}
        </p>
      </fieldset>
      <button type="button" className={styles.linkButton} aria-expanded={open} aria-controls={`${base}-inspect`} onClick={onToggle} data-testid={`inspect-hypothesis-${id}`}>
        {open ? t("social.offers.closeInspect") : t("social.offers.inspect", { id })}
      </button>
      {open ? (
        <div id={`${base}-inspect`} className={styles.inspection} data-testid={`inspection-${id}`}>
          <p className={styles.detailTitle}>{t("social.offers.eligibleTitle", { n: tf.eligible.length })}</p>
          <ul className={styles.limits} data-testid={`eligible-${id}`} data-count={tf.eligible.length}>
            {tf.eligible.length ? tf.eligible.slice(0, 12).map((x) => <FitRow key={x.p.post.media_id} x={x} onSelect={onSelect} />) : <li className={styles.muted}>{t("social.offers.topicalNone")}</li>}
          </ul>
          {tf.sessionExcluded.length ? (
            <>
              <p className={styles.detailTitle}>{t("social.offers.excludedTitle", { n: tf.sessionExcluded.length })}</p>
              <ul className={styles.limits} data-testid={`session-excluded-${id}`}>
                {tf.sessionExcluded.map((x) => (
                  <FitRow key={x.p.post.media_id} x={x} onSelect={onSelect} />
                ))}
              </ul>
            </>
          ) : null}
          <p className={styles.detailTitle}>{t("social.offers.aboveTitle", { n: res.aboveMedian.length })}</p>
          <p className={styles.chips} data-testid={`above-${id}`}>
            {res.aboveMedian.length ? res.aboveMedian.slice(0, 10).map((x) => <PostLink key={x.p.post.media_id} p={x.p} onSelect={onSelect} />) : <span className={styles.muted}>{t("social.patterns.noCounter")}</span>}
          </p>
          <p className={styles.detailTitle}>{t("social.offers.belowTitle", { n: res.belowMedian.length })}</p>
          <p className={styles.chips} data-testid={`below-${id}`}>
            {res.belowMedian.length ? res.belowMedian.slice(0, 10).map((x) => <PostLink key={x.p.post.media_id} p={x.p} onSelect={onSelect} />) : <span className={styles.muted}>{t("social.patterns.noCounter")}</span>}
          </p>
          <p className={styles.note}>{t("social.offers.belowNote")}</p>
          <dl className={styles.kv} data-testid={`disclosure-${id}`}>
            <div>
              <dt>{t("social.offers.discFormats")}</dt>
              <dd>{res.formats.length ? res.formats.map((f) => t("social.offers.discFormat", { format: t(`social.formats.${f.format}`), n: f.nIndexed, of: f.nEligible, group: f.groupN })).join(" · ") : "—"}</dd>
            </div>
            <div>
              <dt>{t("social.offers.discUnindexed")}</dt>
              <dd data-testid={`unindexed-${id}`}>{res.unindexed.length ? res.unindexed.map((u) => `${t(`social.offers.unindexed.${u.reason}`)}: ${u.n}`).join(" · ") : t("social.patterns.noCounter")}</dd>
            </div>
            <div>
              <dt>{t("social.offers.discObserved")}</dt>
              <dd>{formatDay(res.observedAt, locale)}</dd>
            </div>
            <div>
              <dt>{t("social.offers.discPeriod")}</dt>
              <dd>{t("social.offers.discPeriodValue", { days: MATURE_AGE_DAYS })}</dd>
            </div>
            <div>
              <dt>{t("social.offers.discAges")}</dt>
              <dd>{res.ageDays ? t("social.offers.discAgesValue", { min: Math.floor(res.ageDays.min), max: Math.floor(res.ageDays.max) }) : "—"}</dd>
            </div>
          </dl>
          <p className={styles.detailTitle}>{t("social.patterns.limits")}</p>
          <ul className={styles.limits} data-testid={`limits-${id}`}>
            {res.limitations.map((l) => (
              <li key={l} data-limit={l}>
                {t(`social.offers.limitations.${l}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function FitRow({ x, onSelect }: { x: EligiblePost; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <li data-testid="fit-row" data-media-id={x.p.post.media_id} data-source={x.fit.source} data-overlap={x.overlap}>
      <PostLink p={x.p} onSelect={onSelect} />{" "}
      <span className={styles.note}>
        {x.fit.source === "manual-session" ? t(x.fit.eligible ? "social.offers.reasonIncluded" : "social.offers.reasonExcluded", { words: x.fit.matched.join(", ") || "—" }) : t("social.offers.reasonDerived", { words: x.fit.matched.join(", ") })}
        {x.overlap ? ` · ${t("social.offers.overlap")}` : ""}
      </span>
    </li>
  );
}
