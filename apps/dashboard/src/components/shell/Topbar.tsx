"use client";

import { Database, FlaskConical, Camera, Search, Unplug } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { PEOPLE } from "@/fixtures/team";
import { LOCALES, type Locale } from "@/lib/locale";
import { activeViewFor } from "@/lib/views";
import { useWorkPhase } from "@/features/work/WorkProvider";
import { useSocialPhase } from "@/features/social/phase";
import { translate } from "@/i18n/translate";
import styles from "./shell.module.css";

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { notify } = useToast();
  const pathname = usePathname();
  const view = activeViewFor(pathname);
  // the Social cockpit reads live Instagram data (ANA-38): never label it as prototype
  const instagramLive = pathname.startsWith("/pulse/social/instagram");
  const socialPhase = useSocialPhase();
  // "live" only while the adapter reports CONNECTED (Owner decision 26 Oct 2026); EMPTY is a verified read of nothing
  const igLabel =
    socialPhase === "CONNECTED"
      ? t("top.liveInstagram")
      : socialPhase === "EMPTY"
        ? t("top.liveInstagramEmpty")
        : socialPhase === "STALE"
          ? t("top.liveInstagramStale")
          : socialPhase === "ERROR" || socialPhase === "PERMISSION_REQUIRED"
            ? t("top.liveInstagramDown")
            : t("top.liveInstagramReading");
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
        {instagramLive ? (
          <span className={styles.prototypeFlag} title={t("top.liveInstagramDetail")} data-testid="prototype-flag" data-live="instagram" data-social={socialPhase ?? "LOADING"}>
            {socialPhase === "ERROR" || socialPhase === "PERMISSION_REQUIRED" ? <Unplug size={13} aria-hidden="true" /> : <Camera size={13} aria-hidden="true" />}
            {igLabel}
            <span className="visually-hidden"> — {t("top.liveInstagramDetail")}</span>
          </span>
        ) : view === "board" ? (
          // Board and Backlog are live Jira: say so where they are, and only while Jira actually answers
          <span className={styles.prototypeFlag} title={jiraDetail} data-testid="prototype-flag" data-live="jira" data-jira={workPhase ?? "loading"}>
            {jiraUp || workPhase === "loading" ? <Database size={13} aria-hidden="true" /> : <Unplug size={13} aria-hidden="true" />}
            {jiraLabel}
            <span className="visually-hidden"> — {jiraDetail}</span>
          </span>
        ) : view === "now" || view === "brain" ? null : (
          // the ASADA home carries no prototype flag (ANA-42): it shows no prototype data, only honest Under Construction;
          // nor does the Brain (ANA-35): it shows the Brain projection or an honest BLOCKED/UNKNOWN, never prototype data
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
