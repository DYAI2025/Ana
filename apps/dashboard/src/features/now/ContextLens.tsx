"use client";

import { ArrowRight, BookOpenText, FileJson, FileText, PlayCircle, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { RECENT_KNOWLEDGE, SOURCE_GROUPS } from "@/fixtures/connections";
import { getSession, LAST_SESSION_ID } from "@/fixtures/sessions";
import { TEAM } from "@/fixtures/team";
import { formatDate } from "@/lib/format";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { columnCounts } from "@/state/prototype";
import styles from "./lens.module.css";

export type LensId = "work" | "session" | "business" | "knowledge" | "community";

const CLOSE_MS = 280;

export function ContextLens({ lens, onClose }: { lens: LensId | null; onClose: () => void }) {
  // `closing` is visual only (exit animation). Modal ownership — focus trap, Escape, focus return —
  // lasts for the whole time the dialog is mounted and ends only when the lens is removed.
  const [closing, setClosing] = useState(false);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | null>(null);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return; // already closing: no second timer, no second cleanup
    if (reduced) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      onClose();
    }, CLOSE_MS);
  }, [onClose, reduced]);

  // leaving the page mid-animation must not fire a stale close later
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  useFocusTrap(panel, lens !== null, requestClose);

  if (!lens) return null;
  const shown = lens;

  return (
    <div className={styles.layer} data-state={closing ? "closing" : "open"}>
      <div className={styles.backdrop} onClick={requestClose} aria-hidden="true" />
      <aside ref={panel} className={`glass ${styles.lens}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="context-lens" data-lens={shown}>
        <span className={styles.sweep} aria-hidden="true" />
        <LensBody lens={shown} titleId={titleId} onClose={requestClose} />
      </aside>
    </div>
  );
}

function LensHeader({ eyebrow, title, titleId, onClose }: { eyebrow: string; title: string; titleId: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </div>
      <button type="button" className={styles.close} onClick={onClose} aria-label={t("common.close")} data-testid="lens-close">
        <X size={16} aria-hidden="true" />
      </button>
    </header>
  );
}

function LensBody({ lens, titleId, onClose }: { lens: LensId; titleId: string; onClose: () => void }) {
  const { t, text, locale } = useI18n();
  const { state } = usePrototype();
  const counts = columnCounts(state.tickets);

  if (lens === "work") {
    const moving = state.tickets.filter((ticket) => ticket.column === "doing" || ticket.column === "review");
    return (
      <>
        <LensHeader eyebrow={t("now.work")} title={t("lens.workIntro")} titleId={titleId} onClose={onClose} />
        <div className={styles.body}>
          <p className={styles.stateLine}>
            <span className={styles.dot} aria-hidden="true" />
            {t("lens.workState", { active: counts.doing, review: counts.review, done: counts.done })}
          </p>
          <h3 className={styles.sectionLabel}>{t("lens.currentWork")}</h3>
          <ul className={styles.rows}>
            {moving.map((ticket) => (
              <li key={ticket.id} className={styles.row}>
                <Avatar person={ticket.owner} size={28} />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{text(ticket.title)}</span>
                  <span className={styles.rowMeta}>{TEAM[ticket.owner].name}</span>
                </span>
                <span className={styles.rowTag}>{t(`board.columns.${ticket.column}`)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <ButtonLink href="/board" variant="primary" trailingIcon={<ArrowRight size={15} aria-hidden="true" />}>
              {t("lens.openBoard")}
            </ButtonLink>
            <ButtonLink href="/backlog">{t("lens.backlogCount", { count: state.backlog.length })}</ButtonLink>
          </div>
        </div>
      </>
    );
  }

  if (lens === "session") {
    const session = getSession(LAST_SESSION_ID)!;
    const artifacts = [
      { tab: "watch", icon: PlayCircle },
      { tab: "summary", icon: FileText },
      { tab: "transcript", icon: ScrollText },
      { tab: "json", icon: FileJson },
    ] as const;
    return (
      <>
        <LensHeader eyebrow={text(session.kind)} title={text(session.title)} titleId={titleId} onClose={onClose} />
        <div className={styles.body}>
          <p className={styles.intro}>{t("lens.sessionIntro")}</p>
          <p className={styles.stateLine}>
            {formatDate(session.date!, locale, { day: "2-digit", month: "long", year: "numeric" })} · {session.start}–{session.end}
          </p>
          <div className={styles.people}>
            {session.participants.map((p) => (
              <Avatar key={p} person={p} size={26} showName />
            ))}
          </div>
          <h3 className={styles.sectionLabel}>{t("lens.sessionArtifacts")}</h3>
          <div className={styles.tiles}>
            {artifacts.map(({ tab, icon: Icon }) => (
              <Link key={tab} href={`/sessions/${session.id}?tab=${tab}`} className={styles.tile} data-testid={`lens-session-${tab}`}>
                <Icon size={18} aria-hidden="true" />
                {t(`sessions.tabs.${tab}`)}
              </Link>
            ))}
          </div>
          <div className={styles.note}>
            <StatusChip tone="prototype">{t("common.fictional")}</StatusChip>
          </div>
        </div>
      </>
    );
  }

  if (lens === "knowledge") {
    return (
      <>
        <LensHeader eyebrow={t("now.knowledge")} title={t("lens.knowledgeIntro")} titleId={titleId} onClose={onClose} />
        <div className={styles.body}>
          <h3 className={styles.sectionLabel}>{t("lens.recentItems")}</h3>
          <ul className={styles.rows}>
            {RECENT_KNOWLEDGE.map((item) => (
              <li key={item.id}>
                <Link href={`/brain?node=${item.id}`} className={`${styles.row} ${styles.rowLink}`}>
                  <span className={styles.rowIcon} aria-hidden="true">
                    <BookOpenText size={15} />
                  </span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{text(item.label)}</span>
                  </span>
                  <span className={styles.rowTag}>{t(`brain.types.${item.type}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <ButtonLink href="/brain" variant="primary" trailingIcon={<ArrowRight size={15} aria-hidden="true" />}>
              {t("lens.openBrain")}
            </ButtonLink>
            <ButtonLink href={`/sessions/${LAST_SESSION_ID}?tab=summary`}>{t("sessions.tabs.summary")}</ButtonLink>
          </div>
          <div className={styles.note}>
            <StatusChip tone="prototype">{t("common.fictional")}</StatusChip>
          </div>
        </div>
      </>
    );
  }

  const group = SOURCE_GROUPS.find((g) => g.id === (lens === "business" ? "sales" : "community"))!;
  const heading = lens === "business" ? t("now.business") : t("now.community");
  return (
    <>
      <LensHeader eyebrow={heading} title={t(lens === "business" ? "lens.businessIntro" : "lens.communityIntro")} titleId={titleId} onClose={onClose} />
      <div className={styles.body}>
        <h3 className={styles.sectionLabel}>{t("lens.potentialSources")}</h3>
        <ul className={styles.rows}>
          {group.sources.map((source) => (
            <li key={typeof source === "string" ? source : source.en} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{text(source)}</span>
              </span>
              <StatusChip tone="not-connected">{t("common.notConnected")}</StatusChip>
            </li>
          ))}
        </ul>
        <p className={styles.intro}>{t("lens.connectSetupLater")}</p>
        <div className={styles.actions}>
          <ButtonLink href="/pulse" variant="primary" trailingIcon={<ArrowRight size={15} aria-hidden="true" />}>
            {t("lens.openPulse")}
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
