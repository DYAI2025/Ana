"use client";

import { ArrowLeft, CircleCheck, Lightbulb, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PersonBadge } from "@/components/ui/PersonBadge";
import type { MessageKey } from "@/i18n/translate";
import { attr, backlogIssues, normalizeSummary, SUMMARY_MAX, validateIdeaSummary } from "@/features/work/model";
import type { WorkFailure, WorkIssue } from "@/features/work/types";
import { snapshotOf, useWork } from "@/features/work/WorkProvider";
import { FailureNotice, formatTime, LoadingLine, SourceLine } from "@/features/work/WorkStatus";
import styles from "./backlog.module.css";

type Submission =
  | { phase: "idle" }
  | { phase: "pending"; requestId: string; summary: string }
  | { phase: "failed"; requestId: string; summary: string; failure: WorkFailure }
  | { phase: "created"; issue: WorkIssue; replayed: boolean };

export function BacklogView({ highlight }: { highlight?: string }) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const { state, refreshing, refresh, createIdea } = useWork();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [submission, setSubmission] = useState<Submission>({ phase: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const snapshot = snapshotOf(state);
  const loaded = snapshot !== null;
  const canWrite = state.phase === "ready";
  const busy = submission.phase === "pending";

  useEffect(() => {
    if (highlight && loaded) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-backlog-key="${attr(highlight)}"]`)?.focus());
  }, [highlight, loaded]);

  const open = () => {
    setFormOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const close = () => {
    if (busy) return;
    setFormOpen(false);
    setTitle("");
    setError(null);
    if (submission.phase === "failed") setSubmission({ phase: "idle" });
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const submit = async (event: Pick<FormEvent, "preventDefault">) => {
    event.preventDefault();
    if (busy || !canWrite) return;
    const problem = validateIdeaSummary(title);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    const summary = normalizeSummary(title);
    // the same idea keeps its request id across retries, so Jira can never receive it twice
    const requestId = submission.phase === "failed" && submission.summary === summary ? submission.requestId : crypto.randomUUID();
    setError(null);
    setSubmission({ phase: "pending", requestId, summary });
    const result = await createIdea(requestId, summary);
    if (result.ok) {
      setSubmission({ phase: "created", issue: result.issue, replayed: Boolean(result.replayed) });
      notify(t("backlog.created", { key: result.issue.key }));
      setTitle("");
      setFormOpen(false);
      window.requestAnimationFrame(() => openerRef.current?.focus());
    } else {
      setSubmission({ phase: "failed", requestId, summary, failure: result.failure });
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const header = (
    <PageHeader
      title={t("backlog.title")}
      subtitle={t("backlog.subtitle")}
      actions={
        <>
          <ButtonLink href="/board" variant="quiet" icon={<ArrowLeft size={15} aria-hidden="true" />}>
            {t("backlog.backToBoard")}
          </ButtonLink>
          <Button ref={openerRef} variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={open} disabled={!canWrite} data-testid="add-idea">
            {t("backlog.addIdea")}
          </Button>
        </>
      }
    />
  );

  if (state.phase === "loading") {
    return (
      <div className={styles.page} data-work-phase="loading">
        {header}
        <LoadingLine />
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className={styles.page} data-work-phase="failed">
        {header}
        <FailureNotice failure={state.failure} actions={<Button onClick={() => void refresh()} data-testid="work-retry">{t("work.retry")}</Button>} />
      </div>
    );
  }

  const items = backlogIssues(state.snapshot);
  const created = submission.phase === "created" ? submission.issue : null;

  return (
    <div className={styles.page} data-work-phase={state.phase}>
      {header}
      <SourceLine snapshot={state.snapshot} refreshing={refreshing} onRefresh={() => void refresh()} />

      {state.phase === "stale" ? (
        <FailureNotice
          failure={state.failure}
          testId="work-stale"
          subject={t("work.staleNote", { time: formatTime(state.snapshot.fetchedAt, locale) })}
          actions={<Button onClick={() => void refresh()} data-testid="work-retry">{t("work.retry")}</Button>}
        />
      ) : null}

      <div className={styles.layout}>
        <div>
          {created ? (
            <p className={styles.created} role="status" data-testid="idea-created">
              <CircleCheck size={16} aria-hidden="true" />
              <span>
                {t("backlog.created", { key: created.key })}{" "}
                <a href={created.url} target="_blank" rel="noreferrer">
                  {t("work.openInJira", { key: created.key })}
                </a>
              </span>
            </p>
          ) : null}

          {formOpen ? (
            <form id={formId} className={`glass ${styles.form}`} onSubmit={submit} noValidate data-testid="idea-form" aria-busy={busy ? true : undefined}>
              <div className={styles.formHead}>
                <h2 className={styles.formTitle}>{t("backlog.addIdeaTitle")}</h2>
              </div>
              <label className={styles.label} htmlFor={`${formId}-title`}>
                {t("backlog.ideaLabel")}
              </label>
              <textarea
                ref={inputRef}
                id={`${formId}-title`}
                className={styles.input}
                rows={2}
                maxLength={SUMMARY_MAX}
                placeholder={t("backlog.ideaPlaceholder")}
                value={title}
                readOnly={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${formId}-note${error ? ` ${formId}-error` : ""}`}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) void submit(e);
                  if (e.key === "Escape") close();
                }}
                data-testid="idea-input"
              />
              {error ? (
                <p id={`${formId}-error`} className={styles.error} role="alert">
                  {t(error)}
                </p>
              ) : null}
              <p id={`${formId}-note`} className={styles.note}>
                {t("backlog.ideaNote")}
              </p>
              {submission.phase === "failed" ? <FailureNotice failure={submission.failure} testId="idea-failure" /> : null}
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" disabled={busy || !canWrite} data-testid="idea-submit">
                  {busy
                    ? t("backlog.creating")
                    : submission.phase === "failed" && submission.failure.state === "UNKNOWN"
                      ? t("work.checkAgain")
                      : submission.phase === "failed"
                        ? t("work.retry")
                        : t("backlog.addIdea")}
                </Button>
                <Button variant="quiet" onClick={close} disabled={busy}>
                  {t("common.cancel")}
                </Button>
              </div>
              {busy ? (
                <p className="visually-hidden" role="status">
                  {t("backlog.creating")}
                </p>
              ) : null}
            </form>
          ) : null}

          <p className={styles.count}>{t("backlog.count", { count: items.length })}</p>
          {items.length === 0 ? <p className={styles.empty}>{t("backlog.empty")}</p> : null}
          <ol className={styles.list} data-testid="backlog-list">
            {items.map((item, index) => (
              <li
                key={item.key}
                className={styles.row}
                data-kind={item.isIdea ? "idea" : "backlog"}
                data-backlog-key={item.key}
                data-highlight={created?.key === item.key || highlight === item.key ? "true" : undefined}
                tabIndex={highlight === item.key ? -1 : undefined}
                data-testid="backlog-item"
              >
                <span className={styles.index} aria-hidden="true">
                  {item.isIdea ? <Lightbulb size={15} /> : String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{item.summary}</span>
                  <span className={styles.rowMeta}>
                    <a href={item.url} target="_blank" rel="noreferrer" className={styles.rowKey} aria-label={t("work.openInJira", { key: item.key })}>
                      {item.key}
                    </a>
                    {" · "}
                    {item.isIdea ? t("work.idea") : item.issueType}
                    {" · "}
                    {item.status.name}
                  </span>
                </span>
                <PersonBadge person={item.assignee} unassignedLabel={t("work.unassigned")} size={22} showName />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
