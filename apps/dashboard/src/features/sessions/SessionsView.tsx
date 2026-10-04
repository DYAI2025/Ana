"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { LAST_SESSION_ID, SESSIONS } from "@/fixtures/sessions";
import { formatDate } from "@/lib/format";
import { SESSION_TABS } from "./tabs";
import styles from "./sessions.module.css";

/** Planned first, then held sessions newest first, then undated prototype placeholders. */
const ORDERED = [...SESSIONS].sort((a, b) => {
  const rank = (s: (typeof SESSIONS)[number]) => (s.planned ? 0 : s.date ? 1 : 2);
  return rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? "");
});

export function SessionsView() {
  const { t, text, locale } = useI18n();
  return (
    <div className={styles.page}>
      <PageHeader title={t("sessions.title")} subtitle={t("sessions.subtitle")} />
      <ol className={styles.timeline}>
        {ORDERED.map((session) => (
          <li key={session.id} className={styles.event} data-first={session.id === LAST_SESSION_ID ? "true" : undefined} data-planned={session.planned ? "true" : undefined}>
            <span className={styles.node} aria-hidden="true" />
            <p className={styles.when}>{session.date ? formatDate(session.date, locale, { day: "2-digit", month: "short", year: "numeric" }) : t("common.prototype")}</p>
            <article className={`glass ${styles.slab}`} data-testid={`session-${session.id}`}>
              <p className="eyebrow">{text(session.kind)}</p>
              <h2 className={styles.slabTitle}>
                <Link href={`/sessions/${session.id}`} className={styles.slabLink}>
                  {text(session.title)}
                </Link>
              </h2>
              <div className={styles.slabMeta}>
                {session.start ? (
                  <span>
                    {session.start}–{session.end}
                  </span>
                ) : null}
                <span className={styles.avatars}>
                  {session.participants.map((p) => (
                    <Avatar key={p} person={p} size={22} />
                  ))}
                </span>
                {session.planned ? <StatusChip tone="local">{t("sessions.planned")}</StatusChip> : null}
                {session.attached ? <StatusChip tone="prototype">{t("common.fictional")}</StatusChip> : <StatusChip tone="not-connected">{t("sessions.notAttached")}</StatusChip>}
              </div>
              {session.attached ? (
                <div className={styles.quick}>
                  {SESSION_TABS.map((tab) => (
                    <Link key={tab} href={`/sessions/${session.id}?tab=${tab}`} className={styles.quickLink}>
                      {t(`sessions.tabs.${tab}`)}
                    </Link>
                  ))}
                  <Link href={`/sessions/${session.id}`} className={styles.openLink} aria-label={`${t("sessions.open")}: ${text(session.title)}`}>
                    {t("common.open")} <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
