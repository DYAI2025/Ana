"use client";

import { Ban, CircleHelp, Database, OctagonX, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import type { FailureState, WorkFailure, WorkSnapshot } from "./types";
import styles from "./work.module.css";

export const FAILURE_ICON: Record<FailureState, typeof Ban> = { ERROR: OctagonX, BLOCKED: Ban, UNKNOWN: CircleHelp };

/** ERROR / BLOCKED / UNKNOWN, carried by label + icon + text — never shown as success, never colour alone. */
export function FailureNotice({
  failure,
  subject,
  actions,
  testId = "work-failure",
  id,
}: {
  failure: WorkFailure;
  subject?: string;
  actions?: ReactNode;
  testId?: string;
  /** Lets another element (a card's state mark) bring this notice into view and focus it. */
  id?: string;
}) {
  const { t } = useI18n();
  const Icon = FAILURE_ICON[failure.state];
  return (
    <div className={styles.failure} role="alert" id={id} tabIndex={id ? -1 : undefined} data-state={failure.state} data-code={failure.code} data-testid={testId}>
      <span className={styles.stateLabel}>
        <Icon size={14} aria-hidden="true" strokeWidth={2.2} />
        {failure.state}
      </span>
      <div className={styles.failureBody}>
        <p className={styles.failureText}>
          {subject ? <strong>{subject} · </strong> : null}
          {t(`work.failures.${failure.code}`)}
        </p>
        {failure.detail ? <p className={styles.failureDetail}>{failure.detail}</p> : null}
      </div>
      {actions ? <div className={styles.failureActions}>{actions}</div> : null}
    </div>
  );
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

/** Provenance of every value on the page: which Jira board and filter, and when it was read. */
export function SourceLine({ snapshot, refreshing, onRefresh }: { snapshot: WorkSnapshot; refreshing: boolean; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  return (
    <div className={styles.source} data-testid="work-source">
      <Database size={14} aria-hidden="true" />
      <span>
        {t("work.sourceLine", {
          board: snapshot.source.boardName,
          boardId: snapshot.source.boardId,
          filterId: snapshot.source.filterId,
          time: formatTime(snapshot.fetchedAt, locale),
        })}
      </span>
      <Button variant="quiet" onClick={onRefresh} disabled={refreshing} icon={<RefreshCw size={14} aria-hidden="true" />} data-testid="work-refresh">
        {refreshing ? t("work.refreshing") : t("work.refresh")}
      </Button>
    </div>
  );
}

export function LoadingLine() {
  const { t } = useI18n();
  return (
    <p className={styles.loading} role="status" data-testid="work-loading">
      {t("work.loading")}
    </p>
  );
}
