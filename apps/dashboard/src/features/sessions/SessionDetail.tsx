"use client";

import { ArrowLeft, Copy, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Session } from "@/fixtures/sessions";
import { TEAM } from "@/fixtures/team";
import { formatDate } from "@/lib/format";
import { sessionExport } from "./exportJson";
import { SESSION_TABS, type SessionTab } from "./tabs";
import styles from "./sessions.module.css";

const clock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60)].map((n) => String(n).padStart(2, "0")).join(":");

export function SessionDetail({ session, initialTab }: { session: Session; initialTab: SessionTab }) {
  const { t, text, locale } = useI18n();
  const [tab, setTab] = useState<SessionTab>(initialTab);
  const tabRefs = useRef<Partial<Record<SessionTab, HTMLButtonElement | null>>>({});

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SESSION_TABS.indexOf(tab);
    const nextIndex =
      event.key === "ArrowRight" ? (index + 1) % SESSION_TABS.length : event.key === "ArrowLeft" ? (index - 1 + SESSION_TABS.length) % SESSION_TABS.length : event.key === "Home" ? 0 : event.key === "End" ? SESSION_TABS.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = SESSION_TABS[nextIndex]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={styles.detail}>
      <Link href="/sessions" className={styles.back}>
        <ArrowLeft size={15} aria-hidden="true" /> {t("sessions.backToSessions")}
      </Link>
      <header className={styles.detailHead}>
        <p className="eyebrow">{text(session.kind)}</p>
        <h1 className={styles.detailTitle}>{text(session.title)}</h1>
        <div className={styles.slabMeta}>
          <span>{session.date ? `${formatDate(session.date, locale, { day: "2-digit", month: "long", year: "numeric" })} · ${session.start}–${session.end}` : t("common.prototype")}</span>
          <span className={styles.participants}>
            <span className={styles.metaLabel}>{t("sessions.participants")}:</span>
            {session.participants.map((p) => (
              <Avatar key={p} person={p} size={22} showName />
            ))}
          </span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={t("sessions.tabsLabel")}>
        {SESSION_TABS.map((id) => (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
            data-testid={`tab-${id}`}
          >
            {t(`sessions.tabs.${id}`)}
          </button>
        ))}
      </div>

      <section className={`glass ${styles.panel}`} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} data-testid={`panel-${tab}`}>
        {!session.attached ? (
          <p className={styles.missing}>
            <StatusChip tone="not-connected">{t("common.notConnected")}</StatusChip> {t("sessions.notAttached")}
          </p>
        ) : tab === "watch" ? (
          <Player duration={session.durationSeconds ?? 0} />
        ) : tab === "summary" ? (
          <Summary session={session} />
        ) : tab === "transcript" ? (
          <Transcript session={session} />
        ) : (
          <JsonExport session={session} />
        )}
      </section>
    </div>
  );
}

function Player({ duration }: { duration: number }) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  // playback stops by itself at the end; Play at the end restarts from 00:00:00
  const running = playing && position < duration;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setPosition((p) => Math.min(duration, p + 60)), 250);
    return () => window.clearInterval(timer);
  }, [running, duration]);

  const toggle = () => {
    if (running) {
      setPlaying(false);
      return;
    }
    if (position >= duration) setPosition(0);
    setPlaying(true);
  };

  const progress = duration ? (position / duration) * 100 : 0;
  return (
    <div className={styles.player}>
      <div className={styles.media} aria-hidden="true">
        <span className={styles.mediaGlow} />
      </div>
      <div className={styles.controls}>
        <Button variant="secondary" onClick={toggle} icon={running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />} data-testid="player-toggle">
          {running ? t("sessions.pause") : t("sessions.play")}
        </Button>
        <div className={styles.track} role="progressbar" aria-label={t("sessions.mediaNote")} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} aria-valuetext={`${clock(position)} / ${clock(duration)}`}>
          <span className={styles.fill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.time}>
          {clock(position)} / {clock(duration)}
        </span>
      </div>
      <StatusChip tone="prototype">{t("sessions.mediaNote")}</StatusChip>
    </div>
  );
}

function Summary({ session }: { session: Session }) {
  const { t, text } = useI18n();
  return (
    <div className={styles.summary}>
      <div>
        <h2 className={styles.sectionLabel}>{t("sessions.keyPoints")}</h2>
        <ul className={styles.bullets}>
          {session.keyPoints.map((point, i) => (
            <li key={i}>{text(point)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className={styles.sectionLabel}>{t("sessions.decisions")}</h2>
        <ul className={styles.bullets}>
          {session.decisions.map((decision, i) => (
            <li key={i}>{text(decision)}</li>
          ))}
        </ul>
      </div>
      <div className={styles.summaryWide}>
        <h2 className={styles.sectionLabel}>{t("sessions.nextActions")}</h2>
        <ul className={styles.actions}>
          {session.actions.map((action, i) => (
            <li key={i} className={styles.action}>
              <Avatar person={action.owner} size={24} showName />
              <span>{text(action.task)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.summaryWide}>
        <StatusChip tone="prototype">{t("common.fictional")}</StatusChip>
      </p>
    </div>
  );
}

function Transcript({ session }: { session: Session }) {
  const { t, text } = useI18n();
  return (
    <div>
      <p className={styles.banner}>
        <StatusChip tone="prototype">{t("sessions.transcriptNote")}</StatusChip>
      </p>
      <ol className={styles.transcript}>
        {session.transcript.map((line, i) => (
          <li key={i} className={styles.line}>
            <span className={styles.lineTime}>{line.time}</span>
            <span className={styles.lineSpeaker}>
              <Avatar person={line.speaker} size={22} />
              {TEAM[line.speaker].name}
            </span>
            <span className={styles.lineText}>{text(line.text)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function JsonExport({ session }: { session: Session }) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const json = JSON.stringify(sessionExport(session, locale), null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      notify(t("sessions.copied"));
    } catch {
      notify(t("sessions.copyFailed"));
    }
  };
  return (
    <div>
      <div className={styles.jsonHead}>
        <StatusChip tone="prototype">{t("sessions.jsonNote")}</StatusChip>
        <Button variant="secondary" icon={<Copy size={14} aria-hidden="true" />} onClick={copy}>
          {t("sessions.copyJson")}
        </Button>
      </div>
      <pre className={styles.json} tabIndex={0} role="region" aria-label={t("sessions.jsonNote")} data-testid="session-json">
        <code>{json}</code>
      </pre>
    </div>
  );
}
