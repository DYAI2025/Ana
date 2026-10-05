"use client";

import { ArrowRight, GripVertical, X } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PersonBadge } from "@/components/ui/PersonBadge";
import { attr, backlogIssues, columnForStatus, filterByOwner, ownersOf, type OwnerFilter } from "@/features/work/model";
import type { WorkColumn, WorkFailure, WorkIssue } from "@/features/work/types";
import { snapshotOf, useWork } from "@/features/work/WorkProvider";
import { FailureNotice, formatTime, LoadingLine, SourceLine } from "@/features/work/WorkStatus";
import workStyles from "@/features/work/work.module.css";
import styles from "./board.module.css";

const DRAG_TYPE = "application/x-ana-issue";

const cardOf = (key: string) => document.querySelector<HTMLElement>(`[data-ticket-id="${attr(key)}"]`);
const focusIssue = (key: string) => window.requestAnimationFrame(() => cardOf(key)?.focus());

/**
 * After Jira answers, the card may have re-rendered in another column and lost focus. Give focus back only if it
 * is lost — never take it away from wherever the person has moved on to meanwhile.
 */
const restoreFocus = (key: string) =>
  window.requestAnimationFrame(() => {
    const active = document.activeElement;
    if (!active || active === document.body) cardOf(key)?.focus();
  });

const sameOwner = (a: OwnerFilter, b: OwnerFilter) =>
  typeof a === "string" || typeof b === "string" ? a === b : a.accountId === b.accountId;

export function BoardView({ highlight }: { highlight?: string }) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const { state, refreshing, pending, refresh, move } = useWork();
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [settled, setSettled] = useState<{ key: string; done: boolean } | null>(null);
  const [notice, setNotice] = useState<{ failure: WorkFailure; key: string } | null>(null);
  const hintId = useId();
  const snapshot = snapshotOf(state);
  const loaded = snapshot !== null;
  const canWrite = state.phase === "ready";

  // focus the requested issue once it is on the board, not again on every later refresh
  useEffect(() => {
    if (highlight && loaded) focusIssue(highlight);
  }, [highlight, loaded]);

  const header = (
    <PageHeader
      title={t("board.title")}
      subtitle={t("board.subtitle")}
      actions={
        <ButtonLink href="/backlog" trailingIcon={<ArrowRight size={15} aria-hidden="true" />} data-testid="open-backlog">
          {t("board.openBacklog")}
          {snapshot ? ` · ${backlogIssues(snapshot).length}` : ""}
        </ButtonLink>
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

  const { columns } = state.snapshot;
  const issues = state.snapshot.issues;
  const visible = filterByOwner(issues, owner);
  const { people, hasUnassigned } = ownersOf(issues);
  const options: OwnerFilter[] = ["all", ...people.map((person) => ({ accountId: person.accountId })), ...(hasUnassigned ? (["unassigned"] as const) : [])];

  /** Where an issue is shown: its Jira column, or — while a move is being written — the requested column. */
  const shownColumnId = (issue: WorkIssue) => pending[issue.key]?.toColumnId ?? columnForStatus(columns, issue.status.id)?.id;

  const moveTo = async (issue: WorkIssue, target: WorkColumn, viaKeyboard: boolean) => {
    const from = columns.find((column) => column.id === shownColumnId(issue));
    if (!from || from.id === target.id || !canWrite || pending[issue.key]) return;
    setNotice(null);
    const result = await move(issue, from, target);
    if (result.ok) {
      notify(t("board.moved", { key: issue.key, column: target.name }));
      setSettled({ key: issue.key, done: result.issue.status.category === "done" });
      window.setTimeout(() => setSettled((s) => (s?.key === issue.key ? null : s)), 900);
    } else {
      setNotice({ failure: result.failure, key: issue.key });
    }
    if (viaKeyboard) restoreFocus(issue.key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, issue: WorkIssue) => {
    if (!event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const index = columns.findIndex((column) => column.id === shownColumnId(issue));
    const target = columns[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (!target) return;
    void moveTo(issue, target, true);
    // the issue re-renders in another column: keep keyboard focus on it
    focusIssue(issue.key);
  };

  const onDrop = (event: DragEvent<HTMLElement>, column: WorkColumn) => {
    event.preventDefault();
    const key = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    const issue = issues.find((x) => x.key === key);
    setOver(null);
    setDragging(null);
    if (issue) void moveTo(issue, column, false);
  };

  const ownerName = (filter: OwnerFilter) =>
    filter === "all" ? t("common.all") : filter === "unassigned" ? t("work.unassigned") : (people.find((p) => p.accountId === filter.accountId)?.displayName ?? "");

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

      {notice ? (
        <FailureNotice
          failure={notice.failure}
          subject={notice.key}
          testId="move-failure"
          actions={
            <Button variant="quiet" onClick={() => setNotice(null)} icon={<X size={14} aria-hidden="true" />}>
              {t("work.dismiss")}
            </Button>
          }
        />
      ) : null}

      {state.snapshot.unmapped.length > 0 ? (
        <p className={workStyles.note} data-testid="work-unmapped">
          {t("work.unmapped", {
            count: state.snapshot.unmapped.length,
            boardId: state.snapshot.source.boardId,
            statuses: [...new Set(state.snapshot.unmapped.map((issue) => issue.status.name))].join(", "),
            keys: state.snapshot.unmapped.map((issue) => issue.key).join(", "),
          })}
        </p>
      ) : null}
      {state.snapshot.truncated ? (
        <p className={workStyles.note} data-testid="work-truncated">
          {t("work.truncated", { count: issues.length })}
        </p>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.filter} role="group" aria-label={t("board.filterLabel")}>
          {options.map((option) => {
            const id = typeof option === "string" ? option : option.accountId;
            return (
              <button
                key={id}
                type="button"
                className={styles.filterButton}
                aria-pressed={sameOwner(owner, option)}
                onClick={() => setOwner(option)}
                data-testid={`filter-${typeof option === "string" ? option : "person"}`}
                data-owner={id}
              >
                {typeof option === "string" ? ownerName(option) : <PersonBadge person={people.find((p) => p.accountId === option.accountId)!} unassignedLabel={t("work.unassigned")} size={20} showName />}
              </button>
            );
          })}
        </div>
        <p id={hintId} className={styles.hint}>
          {canWrite ? t("board.hint") : t("board.movesPaused")}
        </p>
      </div>

      <div className={styles.board} style={{ "--columns": columns.length } as CSSProperties} data-testid="board-columns">
        {columns.map((column) => {
          const shown = visible.filter((issue) => shownColumnId(issue) === column.id);
          const headingId = `col-${column.id}`;
          return (
            <section
              key={column.id}
              className={styles.column}
              aria-labelledby={headingId}
              data-drop-target={over === column.id ? "true" : undefined}
              data-testid={`column-${column.id}`}
              data-column-name={column.name}
              data-backlog={column.isBacklog ? "true" : undefined}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (over !== column.id) setOver(column.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((o) => (o === column.id ? null : o));
              }}
              onDrop={(event) => onDrop(event, column)}
            >
              <header className={styles.columnHead}>
                <h2 id={headingId} className={styles.columnTitle}>
                  {column.name}
                </h2>
                <span className={styles.count}>
                  <span aria-hidden="true">{String(shown.length).padStart(2, "0")}</span>
                  <span className="visually-hidden">{t("board.columnCount", { count: shown.length })}</span>
                </span>
              </header>
              <ul className={styles.tickets}>
                {shown.map((issue) => {
                  const isPending = Boolean(pending[issue.key]);
                  const ownerLabel = issue.assignee?.displayName ?? t("work.unassigned");
                  return (
                    <li key={issue.key}>
                      <article
                        className={`glass ${styles.ticket}`}
                        tabIndex={0}
                        draggable={canWrite && !isPending}
                        data-ticket-id={issue.key}
                        data-owner={issue.assignee?.accountId ?? "unassigned"}
                        data-status-id={issue.status.id}
                        data-pending={isPending ? "true" : undefined}
                        data-idea={issue.isIdea ? "true" : undefined}
                        data-dragging={dragging === issue.key ? "true" : undefined}
                        data-settled={settled?.key === issue.key ? (settled.done ? "done" : "moved") : undefined}
                        data-highlight={highlight === issue.key ? "true" : undefined}
                        aria-busy={isPending ? true : undefined}
                        aria-describedby={hintId}
                        aria-label={t("board.ticketLabel", { key: issue.key, summary: issue.summary, status: isPending ? t("board.syncing") : issue.status.name, owner: ownerLabel })}
                        onKeyDown={(event) => onKeyDown(event, issue)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(DRAG_TYPE, issue.key);
                          event.dataTransfer.setData("text/plain", issue.key);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(issue.key);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        data-testid="ticket"
                      >
                        <div className={styles.ticketTop}>
                          <span className={styles.category}>{issue.isIdea ? t("work.idea") : issue.issueType}</span>
                          <GripVertical size={14} aria-hidden="true" className={styles.grip} />
                        </div>
                        <h3 className={styles.ticketTitle}>{issue.summary}</h3>
                        <p className={styles.status} data-testid="ticket-status">
                          {isPending ? t("board.syncing") : issue.status.name}
                        </p>
                        <div className={styles.ticketFoot}>
                          <PersonBadge person={issue.assignee} unassignedLabel={t("work.unassigned")} size={22} showName />
                          <a
                            className={styles.key}
                            href={issue.url}
                            target="_blank"
                            rel="noreferrer"
                            draggable={false}
                            aria-label={t("work.openInJira", { key: issue.key })}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {issue.key}
                          </a>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
              {shown.length === 0 ? (
                <p className={styles.empty}>{owner === "all" ? t("board.emptyColumn") : t("board.emptyFiltered", { owner: ownerName(owner) })}</p>
              ) : null}
              <p className={styles.dropHint} aria-hidden="true">
                {t("board.dropHere")}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
