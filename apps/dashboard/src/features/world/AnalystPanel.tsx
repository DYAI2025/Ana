"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { useI18n } from "@/components/providers/I18nProvider";
import { QUESTION_MAX, type AnalystAnswer, type AnalystFailure, type AnalystMetric, type AnalystResponse, type AnalystStatus, type GroupBlock, type HypothesisRef } from "./analystTypes";
import type { WorldPost } from "./model";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];

type Availability = "loading" | "on" | "off" | "misconfigured" | "unreadable";
type PanelFailure = AnalystFailure | "unreachable";
type PanelResult = Extract<AnalystResponse, { ok: true }> | { ok: false; reason: PanelFailure };

const FAILURES: ReadonlySet<string> = new Set<AnalystFailure>(["off", "misconfigured", "invalid_question", "busy", "daily_cap", "instagram_unavailable", "no_evidence", "invalid_answer", "provider_timeout", "provider_rate_limited", "provider_refused", "provider_failed"]);

function readResult(body: unknown): PanelResult {
  const b = body as Partial<Extract<AnalystResponse, { ok: true }>> & { reason?: unknown };
  if (b?.ok === true && b.answer && b.status) return b as Extract<AnalystResponse, { ok: true }>;
  if (typeof b?.reason === "string" && FAILURES.has(b.reason)) return { ok: false, reason: b.reason as AnalystFailure };
  return { ok: false, reason: "unreachable" };
}

/**
 * The question and the last answer live with the room, so stepping back from the computer keeps them. Leaving the
 * office discards them: this is no chat and nothing about a question is kept anywhere.
 */
export function useAnalystSession() {
  const [availability, setAvailability] = useState<Availability>("loading");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PanelResult | null>(null);
  const loaded = useRef(false);
  const running = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      running.current?.abort();
    },
    [],
  );

  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch("/api/world/analyst", { cache: "no-store" })
      .then(async (response) => {
        const state = response.ok ? ((await response.json()) as { state?: unknown }).state : null;
        if (state !== "on" && state !== "off" && state !== "misconfigured") throw new Error("unreadable");
        setAvailability(state);
      })
      .catch(() => {
        // the next time the computer opens it asks again
        loaded.current = false;
        setAvailability("unreadable");
      });
  }, []);

  const ask = useCallback(async () => {
    const text = question.trim();
    if (!text || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/world/analyst", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }), signal: controller.signal });
      setResult(readResult(await response.json().catch(() => null)));
    } catch {
      if (!controller.signal.aborted) setResult({ ok: false, reason: "unreachable" });
    } finally {
      running.current = null;
      setPending(false);
    }
  }, [question]);

  return { availability, question, setQuestion, pending, result, load, ask };
}

export type AnalystSession = ReturnType<typeof useAnalystSession>;

const RATES: ReadonlySet<AnalystMetric> = new Set(["er", "ssr"]);

function formats(locale: string) {
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return {
    value: (metric: AnalystMetric, v: number) => (RATES.has(metric) ? percent.format(v) : number.format(v)),
    rate: (v: number) => percent.format(v),
    time: (iso: string) => {
      const at = new Date(iso);
      return Number.isNaN(at.getTime()) ? iso : time.format(at);
    },
  };
}

const valueLabel = (t: T, field: GroupBlock["field"], value: string) => t(`world.works.values.${field}.${value}` as never);

function PostLink({ id, posts, t, onPost }: { id: string; posts: readonly WorldPost[]; t: T; onPost: (id: string) => void }) {
  const post = posts.find((p) => p.id === id);
  // newer than what this page loaded: there is nothing to open yet, and leaving the room would lose the answer
  if (!post) return <span data-testid="analyst-post-unloaded" data-media={id}>{t("world.office.analyst.postNotLoaded")}</span>;
  const label = `${post.published_at?.slice(0, 10) ?? "—"} · ${t(`world.works.values.format.${post.format}` as never)}`;
  return (
    <button type="button" className={styles.analystPost} onClick={() => onPost(id)} data-testid="analyst-post" data-media={id} aria-label={t("world.office.analyst.openPost", { post: label })}>
      {label}
    </button>
  );
}

function StatusBlock({ status, t, locale }: { status: AnalystStatus; t: T; locale: string }) {
  const f = formats(locale);
  const { window: w, brain } = status;
  return (
    <section className={styles.analystBlock} data-testid="analyst-status" data-stale={status.stale} data-brain={brain.state} data-brain-reason={brain.reason ?? ""} data-withheld={brain.withheld} data-categories={status.categories}>
      <h4>{t("world.office.analyst.status.title")}</h4>
      <p data-testid="analyst-fetched">{t("world.office.analyst.status.fetched", { time: f.time(status.fetched_at) })}</p>
      {status.stale ? (
        <p className={styles.analystWarning} data-testid="analyst-stale">
          {t("world.office.analyst.status.stale")}
        </p>
      ) : null}
      <p data-testid="analyst-window">{t("world.office.analyst.status.window", { considered: w.considered, total: w.total, from: w.from ?? "—", to: w.to ?? "—" })}</p>
      <p>{t(`world.office.analyst.status.categories.${status.categories}`)}</p>
      <p data-testid="analyst-brain-state">{t(`world.office.analyst.status.brain.${brain.reason ?? brain.state}`)}</p>
      {brain.withheld > 0 ? <p data-testid="analyst-withheld">{t("world.office.analyst.status.withheld", { n: brain.withheld })}</p> : null}
    </section>
  );
}

function refLabel(ref: Exclude<HypothesisRef, { type: "post" }>, t: T): string {
  if (ref.type === "brain") return ref.note_id;
  const group = `${t(`world.office.analyst.fields.${ref.field}`)}: ${valueLabel(t, ref.field, ref.value)} (${t(`world.office.analyst.metrics.${ref.metric}`)}, n ${ref.n})`;
  return ref.small ? `${group}, ${t("world.office.analyst.small")}` : group;
}

function Answer({ answer, posts, t, locale, onPost }: { answer: AnalystAnswer; posts: readonly WorldPost[]; t: T; locale: string; onPost: (id: string) => void }) {
  const f = formats(locale);
  return (
    <>
      {answer.measured.length ? (
        <section className={styles.analystBlock} data-testid="analyst-measured">
          <h4>{t("world.office.analyst.measured")}</h4>
          <ul>
            {answer.measured.map((m) => (
              <li key={`${m.media_id}-${m.metric}`} data-media={m.media_id} data-metric={m.metric} data-value={m.value ?? "null"}>
                <PostLink id={m.media_id} posts={posts} t={t} onPost={onPost} /> {t(`world.office.analyst.metrics.${m.metric}`)}: <strong>{m.value === null ? t("world.office.analyst.notMeasured") : f.value(m.metric, m.value)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {answer.categories.length ? (
        <section className={styles.analystBlock} data-testid="analyst-categories">
          <h4>{t("world.office.analyst.categories")}</h4>
          <ul>
            {answer.categories.map((c) => (
              <li key={`${c.media_id}-${c.field}`} data-media={c.media_id} data-field={c.field} data-value={c.value}>
                <PostLink id={c.media_id} posts={posts} t={t} onPost={onPost} /> {t(`world.office.analyst.fields.${c.field}`)}: <strong>{valueLabel(t, c.field, c.value)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {answer.groups.length ? (
        <section className={styles.analystBlock} data-testid="analyst-groups">
          <h4>{t("world.office.analyst.groups")}</h4>
          <ul>
            {answer.groups.map((g) => (
              <li key={`${g.field}-${g.value}-${g.metric}`} data-field={g.field} data-value={g.value} data-metric={g.metric} data-median={g.median} data-n={g.n} data-small={g.small}>
                {t("world.office.analyst.groupRow", { field: t(`world.office.analyst.fields.${g.field}`), value: valueLabel(t, g.field, g.value), metric: t(`world.office.analyst.metrics.${g.metric}`), median: f.rate(g.median), n: g.n })}
                {g.small ? <em> {t("world.office.analyst.small")}</em> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {answer.brain.length ? (
        <section className={styles.analystBlock} data-testid="analyst-brain">
          <h4>{t("world.office.analyst.brain")}</h4>
          {answer.brain.map((b) => (
            <article key={b.note_id} data-note={b.note_id} data-sources={b.source_ids.join(",")} data-status={b.status} data-origin={b.origin} data-index-state={b.index_state}>
              <p>{b.text}</p>
              <p className={styles.note}>{t("world.office.analyst.brainMeta", { note: b.note_id, sources: b.source_ids.join(", "), status: b.status, origin: b.origin, at: f.time(b.at) })}</p>
              <p className={styles.note}>{t("world.office.analyst.brainUncertain")}</p>
            </article>
          ))}
        </section>
      ) : null}
      {answer.hypotheses.length ? (
        <section className={`${styles.analystBlock} ${styles.analystHypotheses}`} data-testid="analyst-hypotheses">
          <h4>{t("world.office.analyst.hypotheses")}</h4>
          <ul>
            {answer.hypotheses.map((h) => (
              <li key={h.text}>
                {h.text}
                <span className={styles.analystRefs}>
                  {t("world.office.analyst.refs")}{" "}
                  {h.refs.map((r) => (r.type === "post" ? <PostLink key={r.media_id} id={r.media_id} posts={posts} t={t} onPost={onPost} /> : <span key={refLabel(r, t)}>{refLabel(r, t)} </span>))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {answer.rejected > 0 ? (
        <p className={styles.note} data-testid="analyst-rejected" data-count={answer.rejected}>
          {t("world.office.analyst.rejected", { n: answer.rejected })}
        </p>
      ) : null}
    </>
  );
}

/** The text analyst on Ana's office computer (Jira ANAK-3): one question, one answer, every block with its source. */
export function AnalystPanel({ session, posts, t, locale, onPost }: { session: AnalystSession; posts: readonly WorldPost[]; t: T; locale: string; onPost: (id: string) => void }) {
  const { availability, question, setQuestion, pending, result, load, ask } = session;
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  // the send button is disabled while a question runs: focus that was on it must not fall out of the room
  useEffect(() => {
    if (!pending && document.activeElement === document.body) questionRef.current?.focus();
  }, [pending]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask();
  };

  if (availability === "loading") return <p data-testid="analyst-loading">{t("world.office.analyst.loading")}</p>;
  if (availability !== "on") {
    return (
      <p className={styles.note} data-testid="analyst-off" data-state={availability}>
        {t(`world.office.analyst.${availability}`)}
      </p>
    );
  }

  return (
    <div className={styles.analyst}>
      <p>{t("world.office.computerBody")}</p>
      <form className={styles.analystForm} onSubmit={submit}>
        <label htmlFor="analyst-question">{t("world.office.analyst.question")}</label>
        <textarea ref={questionRef} id="analyst-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={QUESTION_MAX} rows={3} aria-describedby="analyst-question-hint" data-testid="analyst-question" />
        <p id="analyst-question-hint" className={styles.note}>
          {t("world.office.analyst.questionHint", { n: question.length, max: QUESTION_MAX })}
        </p>
        <button type="submit" className={styles.officeBack} disabled={pending || question.trim().length === 0} data-testid="analyst-send">
          {t("world.office.analyst.send")}
        </button>
      </form>
      <div aria-live="polite" className={styles.analyst}>
        {pending ? <p data-testid="analyst-pending">{t("world.office.analyst.sending")}</p> : null}
        {result && !result.ok ? (
          <p className={styles.analystWarning} role="alert" data-testid="analyst-error" data-reason={result.reason}>
            {t(`world.office.analyst.errors.${result.reason}`)}
          </p>
        ) : null}
        {result?.ok ? (
          <>
            <Answer answer={result.answer} posts={posts} t={t} locale={locale} onPost={onPost} />
            <StatusBlock status={result.status} t={t} locale={locale} />
          </>
        ) : null}
      </div>
    </div>
  );
}
