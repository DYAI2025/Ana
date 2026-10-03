"use client";

import { ArrowRight, GripVertical } from "lucide-react";
import { useEffect, useId, useState, type DragEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PEOPLE, TEAM, type PersonId } from "@/fixtures/team";
import { COLUMNS, type ColumnId, type Ticket } from "@/fixtures/work";
import { filterTickets } from "@/state/prototype";
import styles from "./board.module.css";

type Owner = PersonId | "all";
const DRAG_TYPE = "application/x-ana-ticket";

export function BoardView({ highlight }: { highlight?: string }) {
  const { t, text } = useI18n();
  const { state, dispatch } = usePrototype();
  const { notify } = useToast();
  const [owner, setOwner] = useState<Owner>("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ColumnId | null>(null);
  const [settled, setSettled] = useState<{ id: string; done: boolean } | null>(null);
  const hintId = useId();

  const visible = filterTickets(state.tickets, owner);

  useEffect(() => {
    if (!highlight) return;
    document.querySelector<HTMLElement>(`[data-ticket-id="${highlight}"]`)?.focus();
  }, [highlight]);

  const announce = (id: string, column: ColumnId) => {
    notify(column === "done" ? t("board.movedDone") : t("board.moved", { column: t(`board.columns.${column}`) }));
    setSettled({ id, done: column === "done" });
    window.setTimeout(() => setSettled((s) => (s?.id === id ? null : s)), 900);
  };

  const move = (ticket: Ticket, column: ColumnId) => {
    if (ticket.column === column) return;
    dispatch({ type: "moveTicket", id: ticket.id, column });
    announce(ticket.id, column);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, ticket: Ticket) => {
    if (!event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const target = COLUMNS[COLUMNS.indexOf(ticket.column) + (event.key === "ArrowRight" ? 1 : -1)];
    if (!target) return;
    move(ticket, target);
    // the ticket re-renders in another column: keep keyboard focus on it
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ticket-id="${ticket.id}"]`)?.focus());
  };

  const onDrop = (event: DragEvent<HTMLElement>, column: ColumnId) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    const ticket = state.tickets.find((x) => x.id === id);
    if (ticket) move(ticket, column);
    setOver(null);
    setDragging(null);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("board.title")}
        subtitle={t("board.subtitle")}
        actions={
          <ButtonLink href="/backlog" trailingIcon={<ArrowRight size={15} aria-hidden="true" />} data-testid="open-backlog">
            {t("board.openBacklog")} · {state.backlog.length}
          </ButtonLink>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.filter} role="group" aria-label={t("board.filterLabel")}>
          {(["all", ...PEOPLE] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={styles.filterButton}
              aria-pressed={owner === option}
              onClick={() => setOwner(option)}
              data-testid={`filter-${option}`}
            >
              {option === "all" ? t("common.all") : <Avatar person={option} size={20} showName />}
            </button>
          ))}
        </div>
        <p id={hintId} className={styles.hint}>
          {t("board.hint")}
        </p>
      </div>

      <div className={styles.board}>
        {COLUMNS.map((column) => {
          const tickets = visible.filter((x) => x.column === column);
          const headingId = `col-${column}`;
          return (
            <section
              key={column}
              className={styles.column}
              aria-labelledby={headingId}
              data-drop-target={over === column ? "true" : undefined}
              data-testid={`column-${column}`}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (over !== column) setOver(column);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((o) => (o === column ? null : o));
              }}
              onDrop={(event) => onDrop(event, column)}
            >
              <header className={styles.columnHead}>
                <h2 id={headingId} className={styles.columnTitle}>
                  {t(`board.columns.${column}`)}
                </h2>
                <span className={styles.count} aria-label={t("board.columnCount", { count: tickets.length })}>
                  {String(tickets.length).padStart(2, "0")}
                </span>
              </header>
              <ul className={styles.tickets}>
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <article
                      className={`glass ${styles.ticket}`}
                      tabIndex={0}
                      draggable
                      data-ticket-id={ticket.id}
                      data-owner={ticket.owner}
                      data-dragging={dragging === ticket.id ? "true" : undefined}
                      data-settled={settled?.id === ticket.id ? (settled.done ? "done" : "moved") : undefined}
                      data-highlight={highlight === ticket.id ? "true" : undefined}
                      aria-describedby={hintId}
                      aria-label={`${text(ticket.title)}. ${t("board.ticketMoveHint", { owner: TEAM[ticket.owner].name, column: t(`board.columns.${ticket.column}`) })}`}
                      onKeyDown={(event) => onKeyDown(event, ticket)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, ticket.id);
                        event.dataTransfer.setData("text/plain", ticket.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(ticket.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      data-testid="ticket"
                    >
                      <div className={styles.ticketTop}>
                        <span className={styles.category}>{text(ticket.category)}</span>
                        <GripVertical size={14} aria-hidden="true" className={styles.grip} />
                      </div>
                      <h3 className={styles.ticketTitle}>{text(ticket.title)}</h3>
                      <div className={styles.ticketFoot}>
                        <Avatar person={ticket.owner} size={22} showName />
                        <span className={styles.key}>{ticket.key}</span>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
              {tickets.length === 0 ? (
                <p className={styles.empty}>{owner === "all" ? t("board.emptyColumn") : t("board.emptyFiltered", { owner: TEAM[owner].name })}</p>
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
