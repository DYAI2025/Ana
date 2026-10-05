"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Presentation, UserRound, Video, type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { EVENT_TYPES, PROTOTYPE_MONTH, type CalendarEvent, type EventType } from "@/fixtures/calendar";
import type { MessageKey } from "@/i18n/translate";
import { formatDate, formatMonth } from "@/lib/format";
import { validateEvent } from "@/state/prototype";
import { addMonths, isoDate, monthGrid, type YearMonth } from "./month";
import styles from "./calendar.module.css";

export const TYPE_ICON: Readonly<Record<EventType, LucideIcon>> = { session: Video, workshop: Presentation, focus: Clock, personal: UserRound };

function monthOf(date: string): YearMonth {
  const [y, m] = date.split("-").map(Number);
  // never let a malformed date reach Intl formatting (it throws on Invalid Date)
  return Number.isInteger(y) && Number.isInteger(m) && m! >= 1 && m! <= 12 ? { year: y!, month: m! } : PROTOTYPE_MONTH;
}

export function CalendarView({ highlight }: { highlight?: string }) {
  const { t, text, locale } = useI18n();
  const { state, dispatch } = usePrototype();
  const { notify } = useToast();
  const highlighted = state.events.find((e) => e.id === highlight);
  const [ym, setYm] = useState<YearMonth>(highlighted ? monthOf(highlighted.date) : PROTOTYPE_MONTH);
  const [selectedDate, setSelectedDate] = useState<string | null>(highlighted?.date ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [draft, setDraft] = useState({ title: "", date: isoDate(PROTOTYPE_MONTH.year, PROTOTYPE_MONTH.month, 16), start: "10:00", end: "11:00", type: "session" as EventType });
  const [recent, setRecent] = useState<string | null>(highlight ?? null);
  const titleRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  /** whatever opened the form (header button or agenda button) gets focus back when it closes */
  const openerRef = useRef<HTMLElement | null>(null);
  const formId = useId();

  const weeks = monthGrid(ym.year, ym.month);
  const weekdays = t("calendar.weekdays").split(",");
  const inMonth = state.events
    .filter((e) => e.date.startsWith(`${ym.year}-${String(ym.month).padStart(2, "0")}`))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const shown = selectedDate ? state.events.filter((e) => e.date === selectedDate).sort((a, b) => a.start.localeCompare(b.start)) : inMonth;
  const changeMonth = (delta: number) => {
    setYm((v) => addMonths(v, delta));
    setSelectedDate(null);
  };
  const closeForm = () => {
    setFormOpen(false);
    setError(null);
    const opener = openerRef.current;
    window.requestAnimationFrame(() => (opener && document.contains(opener) ? opener : addRef.current)?.focus());
  };

  // the opener is passed in explicitly (Safari/Firefox do not focus clicked buttons, so activeElement is unreliable)
  const openForm = (opener: HTMLElement, date?: string) => {
    openerRef.current = opener;
    setDraft((d) => ({ ...d, date: date ?? selectedDate ?? d.date }));
    setFormOpen(true);
    setError(null);
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const candidate = { ...draft, createdBy: "ana" as const };
    const problem = validateEvent(candidate);
    if (problem) {
      setError(problem);
      // focus the field the message is about
      const field =
        problem === "calendar.dateRequired" ? dateRef : problem === "calendar.endBeforeStart" ? endRef : problem === "calendar.timeRequired" ? (/^\d{2}:\d{2}$/.test(draft.start) ? endRef : startRef) : titleRef;
      field.current?.focus();
      return;
    }
    const id = `event-${state.seq + 1}`;
    dispatch({ type: "addEvent", event: candidate });
    notify(t("calendar.eventAdded"));
    setYm(monthOf(draft.date));
    setSelectedDate(draft.date);
    setRecent(id);
    setDraft((d) => ({ ...d, title: "" }));
    closeForm();
  };

  const eventLabel = (e: CalendarEvent) => `${e.start}–${e.end} · ${text(e.title)} · ${t(`calendar.types.${e.type}`)}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        actions={
          <>
            <div className={styles.monthNav}>
              <button type="button" className={styles.navButton} onClick={() => changeMonth(-1)} aria-label={t("calendar.prev")} data-testid="cal-prev">
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <h2 className={styles.monthLabel} aria-live="polite" data-testid="cal-month">
                {formatMonth(ym.year, ym.month, locale)}
              </h2>
              <button type="button" className={styles.navButton} onClick={() => changeMonth(1)} aria-label={t("calendar.next")} data-testid="cal-next">
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <Button ref={addRef} variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={(e) => (formOpen ? closeForm() : openForm(e.currentTarget))} aria-expanded={formOpen} aria-controls={formId} data-testid="cal-add">
              {t("calendar.addEvent")}
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={`glass ${styles.month}`}>
          <table className={styles.grid} aria-label={formatMonth(ym.year, ym.month, locale)}>
            <thead>
              <tr>
                {weekdays.map((d) => (
                  <th key={d} scope="col" className={styles.weekday}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]!.date}>
                  {week.map((day) => {
                    const events = state.events.filter((e) => e.date === day.date);
                    const isSelected = selectedDate === day.date;
                    return (
                      <td key={day.date} className={styles.cell} data-in-month={day.inMonth ? "true" : "false"}>
                        <button
                          type="button"
                          className={styles.day}
                          aria-pressed={isSelected}
                          aria-label={[formatDate(day.date, locale, { weekday: "long", day: "numeric", month: "long" }), ...events.map(eventLabel)].join(", ")}
                          onClick={() => setSelectedDate(isSelected ? null : day.date)}
                          data-date={day.date}
                        >
                          <span className={styles.dayNumber}>{day.inMonth ? Number(day.date.slice(8)) : formatDate(day.date, locale, { day: "numeric", month: "short" })}</span>
                          {events.map((e) => {
                            const Icon = TYPE_ICON[e.type];
                            return (
                              <span key={e.id} className={`${styles.chip} ${styles[`type_${e.type}`]}`} title={eventLabel(e)} data-recent={recent === e.id ? "true" : undefined} data-testid="cal-event">
                                <Icon size={11} aria-hidden="true" />
                                <span className={styles.chipText}>
                                  <span className={styles.chipTime}>{e.start} </span>
                                  {text(e.title)}
                                </span>
                              </span>
                            );
                          })}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className={styles.side}>
          {formOpen ? (
            <form id={formId} className={`glass ${styles.form}`} onSubmit={submit} noValidate data-testid="cal-form">
              <div className={styles.formHead}>
                <h2 className={styles.formTitle}>{t("calendar.addEventTitle")}</h2>
              </div>
              <label className={styles.field}>
                <span>{t("calendar.eventTitle")}</span>
                <input
                  ref={titleRef}
                  value={draft.title}
                  placeholder={t("calendar.eventTitlePlaceholder")}
                  onChange={(e) => {
                    setDraft({ ...draft, title: e.target.value });
                    setError(null);
                  }}
                  aria-invalid={error === "calendar.titleRequired" ? true : undefined}
                  data-testid="cal-title"
                />
              </label>
              <label className={styles.field}>
                <span>{t("calendar.date")}</span>
                <input ref={dateRef} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required aria-invalid={error === "calendar.dateRequired" ? true : undefined} data-testid="cal-date" />
              </label>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>{t("calendar.start")}</span>
                  <input ref={startRef} type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-invalid={error === "calendar.timeRequired" && !/^\d{2}:\d{2}$/.test(draft.start) ? true : undefined} data-testid="cal-start" />
                </label>
                <label className={styles.field}>
                  <span>{t("calendar.end")}</span>
                  <input ref={endRef} type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-invalid={error === "calendar.endBeforeStart" || (error === "calendar.timeRequired" && !/^\d{2}:\d{2}$/.test(draft.end)) ? true : undefined} data-testid="cal-end" />
                </label>
              </div>
              <label className={styles.field}>
                <span>{t("calendar.type")}</span>
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EventType })}>
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`calendar.types.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p className={styles.error} role="alert">
                  {t(error)}
                </p>
              ) : null}
              <StatusChip tone="local">{t("calendar.localNote")}</StatusChip>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" data-testid="cal-submit">
                  {t("calendar.addEvent")}
                </Button>
                <Button variant="quiet" onClick={closeForm}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}

          <section className={`glass ${styles.agenda}`} data-testid="cal-agenda">
            <h2 className={styles.agendaTitle}>
              <CalendarDays size={15} aria-hidden="true" />
              <span>{selectedDate ? formatDate(selectedDate, locale, { weekday: "long", day: "numeric", month: "long" }) : t("calendar.upcoming")}</span>
            </h2>
            <StatusChip tone="prototype">{t("common.fictional")}</StatusChip>
            {shown.length === 0 ? <p className={styles.empty}>{t("calendar.noEvents")}</p> : null}
            <ul className={styles.agendaList}>
              {shown.map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <li key={e.id} className={styles.agendaItem} data-recent={recent === e.id ? "true" : undefined} aria-label={eventLabel(e)}>
                    <span className={`${styles.agendaIcon} ${styles[`type_${e.type}`]}`} aria-hidden="true">
                      <Icon size={14} />
                    </span>
                    <span className={styles.agendaMain}>
                      <span className={styles.agendaName}>{text(e.title)}</span>
                      <span className={styles.agendaMeta}>
                        {formatDate(e.date, locale, { day: "2-digit", month: "short" })} · {e.start}–{e.end} · {t(`calendar.types.${e.type}`)}
                      </span>
                    </span>
                    {e.local ? <StatusChip tone="local">{t("common.newLocal")}</StatusChip> : null}
                  </li>
                );
              })}
            </ul>
            {selectedDate ? (
              <Button variant="secondary" icon={<Plus size={14} aria-hidden="true" />} onClick={(e) => openForm(e.currentTarget, selectedDate)}>
                {t("calendar.addEvent")}
              </Button>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
