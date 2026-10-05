"use client";

import { Database, FlaskConical, Search, Unplug } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { PEOPLE } from "@/fixtures/team";
import { LOCALES, type Locale } from "@/lib/locale";
import { activeViewFor } from "@/lib/views";
import { useWorkPhase } from "@/features/work/WorkProvider";
import { translate } from "@/i18n/translate";
import styles from "./shell.module.css";

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { notify } = useToast();
  const view = activeViewFor(usePathname());
  const workPhase = useWorkPhase();
  const jiraUp = workPhase === "ready";
  const jiraLabel = jiraUp ? t("top.liveFlag") : workPhase === "loading" || workPhase === null ? t("top.liveFlagReading") : t("top.liveFlagDown");
  const jiraDetail = workPhase === "stale" || workPhase === "failed" ? t("top.liveFlagDownDetail") : t("top.liveFlagDetail");

  const choose = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    notify(translate(next, "top.languageChanged"));
  };

  return (
    <header className={styles.topbar}>
      <p className={styles.context}>
        <span className={styles.contextApp}>{t("app.title")}</span>
        {view ? (
          <>
            <span aria-hidden="true" className={styles.contextSep}>
              /
            </span>
            <span>{t(`nav.${view}`)}</span>
          </>
        ) : null}
      </p>
      <div className={styles.topActions} data-testid="topbar-actions">
        {view === "board" ? (
          // Board and Backlog are live Jira: say so where they are, and only while Jira actually answers
          <span className={styles.prototypeFlag} title={jiraDetail} data-testid="prototype-flag" data-live="jira" data-jira={workPhase ?? "loading"}>
            {jiraUp || workPhase === "loading" ? <Database size={13} aria-hidden="true" /> : <Unplug size={13} aria-hidden="true" />}
            {jiraLabel}
            <span className="visually-hidden"> — {jiraDetail}</span>
          </span>
        ) : (
          <span className={styles.prototypeFlag} title={t("top.prototypeFlagDetail")} data-testid="prototype-flag">
            <FlaskConical size={13} aria-hidden="true" />
            {t("top.prototypeFlag")}
            <span className="visually-hidden"> — {t("top.prototypeFlagDetail")}</span>
          </span>
        )}
        <div className={styles.language} role="group" aria-label={t("top.language")}>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={locale === option}
              className={styles.languageButton}
              onClick={() => choose(option)}
              data-testid={`lang-${option}`}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={styles.team} role="group" aria-label={t("top.team")}>
          {PEOPLE.map((person) => (
            <Avatar key={person} person={person} size={28} />
          ))}
        </div>
        <button type="button" className={styles.searchButton} onClick={onOpenSearch} aria-label={t("top.searchShortcut")} data-testid="search-open">
          <Search size={16} aria-hidden="true" />
          <span className={styles.searchLabel}>{t("top.search")}</span>
          <kbd className={styles.kbd}>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
