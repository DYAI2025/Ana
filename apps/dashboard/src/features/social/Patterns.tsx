"use client";

import { useId, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { formatDay, formatIndex } from "./format";
import { StateChip } from "./Instruments";
import { MIN_PATTERN_GROUP_N, MIN_THEME_N, patternObservations, type Analysis, type Comparator, type PatternResult, type PostAnalysis, type ThemeOf } from "./insights";
import { COMMERCIAL_SIGNALS, HYPOTHESES, hypothesisSignals, nextTest, themeSignals, type FamilyOf, type HypothesisSignal } from "./offers";
import styles from "./social.module.css";

type Tab = "observations" | "offers";

export function PatternsPanel({ analysis, themeOf, familyOf, onSelect }: { analysis: Analysis; themeOf: ThemeOf; familyOf: FamilyOf; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("observations");
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
        {tab === "offers" ? <OfferSignals analysis={analysis} themeOf={themeOf} familyOf={familyOf} onSelect={onSelect} /> : null}
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
      {p.highIntentIndex !== null ? ` · ${formatIndex(p.highIntentIndex, locale)}` : ""}
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

function OfferSignals({ analysis, themeOf, familyOf, onSelect }: { analysis: Analysis; themeOf: ThemeOf; familyOf: FamilyOf; onSelect: (id: string) => void }) {
  const { t, locale } = useI18n();
  const signals = hypothesisSignals(analysis, familyOf);
  const themes = themeSignals(analysis, themeOf);
  const test = nextTest(signals);
  const [inspected, setInspected] = useState<string | null>(null);
  const cell = (v: number | null) => (v !== null ? formatIndex(v, locale) : "—");
  return (
    <div className={styles.offers} data-testid="offer-signals">
      <p className={styles.note}>{t("social.offers.intro")}</p>
      <div className={styles.hypotheses}>
        {signals.map((s: HypothesisSignal) => {
          const id = s.hypothesis.id as "H1" | "H4";
          const open = inspected === id;
          return (
            <article key={id} className={styles.hypothesis} data-testid={`hypothesis-${id}`} data-state={s.state}>
              <div className={styles.panelHead}>
                <h3 className={styles.detailTitle}>{t(`social.offers.${id}`)}</h3>
                <StateChip state="HYPOTHESIS" />
              </div>
              <p className={styles.muted}>{t(`social.offers.${id}Desc`)}</p>
              <p className={styles.note}>{t("social.offers.mappedFamilies", { families: s.hypothesis.families.map((f) => t(`social.families.${f}`)).join(", ") })}</p>
              {s.state === "INSUFFICIENT_EVIDENCE" ? (
                <>
                  <StateChip state="INSUFFICIENT_EVIDENCE" />
                  <p className={styles.muted}>{t("social.offers.insufficient", { n: MIN_THEME_N })}</p>
                </>
              ) : (
                <>
                  <p className={styles.mono}>{t("social.offers.medianIndex", { index: cell(s.medianHighIntentIndex), n: s.mapped.length })}</p>
                  <p>
                    {t("social.offers.supporting", { n: s.supporting.length })} · {t("social.offers.contradicting", { n: s.contradicting.length })}
                  </p>
                </>
              )}
              <button type="button" className={styles.linkButton} aria-expanded={open} aria-controls={`inspect-${id}`} onClick={() => setInspected(open ? null : id)} data-testid={`inspect-hypothesis-${id}`}>
                {open ? t("social.offers.closeInspect") : t("social.offers.inspect", { id })}
              </button>
              {open ? (
                <div id={`inspect-${id}`} className={styles.inspection} data-testid={`inspection-${id}`}>
                  <p className={styles.detailTitle}>{t("social.offers.supporting", { n: s.supporting.length })}</p>
                  <p className={styles.chips} data-testid={`supporting-${id}`}>
                    {s.supporting.length ? s.supporting.slice(0, 10).map((p) => <PostLink key={p.post.media_id} p={p} onSelect={onSelect} />) : <span className={styles.muted}>{t("social.patterns.noCounter")}</span>}
                  </p>
                  <p className={styles.detailTitle}>{t("social.offers.contradicting", { n: s.contradicting.length })}</p>
                  <p className={styles.chips} data-testid={`contradicting-${id}`}>
                    {s.contradicting.length ? s.contradicting.slice(0, 10).map((p) => <PostLink key={p.post.media_id} p={p} onSelect={onSelect} />) : <span className={styles.muted}>{t("social.patterns.noCounter")}</span>}
                  </p>
                  <p className={styles.detailTitle}>{t("social.patterns.limits")}</p>
                  <ul className={styles.limits}>
                    <li>{t("social.patterns.limitations.derived-themes")}</li>
                    <li>{t("social.patterns.limitations.single-snapshot")}</li>
                    <li>{t("social.patterns.limitations.no-causality")}</li>
                    <li>{t("social.offers.commercialNote")}</li>
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className={styles.chips}>
        {HYPOTHESES.filter((h) => h.status === "parked").map((h) => (
          <span key={h.id} className={styles.parked} data-testid={`parked-${h.id}`}>
            {t(`social.offers.${h.id as "H2" | "H3"}`)} · {t("social.offers.parked")}
          </span>
        ))}
      </p>
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
                    <td className={styles.mono}>{cell(th.medianHighIntentIndex)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note}>{t("social.offers.tableNote")}</p>
      </div>
      <article className={styles.nextTest} data-testid="next-test" data-state={test.state}>
        <h3 className={styles.detailTitle}>{t("social.offers.nextTestTitle")}</h3>
        <p>{t("social.offers.nextTestBody")}</p>
        <p className={styles.note} data-testid="next-test-n">
          {t("social.offers.nextTestN", { h1: test.nH1, h4: test.nH4, min: MIN_PATTERN_GROUP_N })}
        </p>
        <p className={styles.note}>{test.lean ? t("social.offers.lean", { id: test.lean }) : t("social.offers.noLean")}</p>
      </article>
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
