"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/providers/I18nProvider";
import { ago, byColumn, COLUMNS, isTeam, MAX_PICTURE_BYTES, NAMES, officeApi, PICTURE_TYPES, pictureUrl, type Assignee, type Attachment, type Column, type Entry, type Person, type Ticket, type TicketSummary } from "./api";
import styles from "./office.module.css";

type T = ReturnType<typeof useI18n>["t"];

function Who({ person, t }: { person: Assignee | Person; t: T }) {
  if (person === "none") return <span className={styles.who}>{t("officeBoard.nobody")}</span>;
  return (
    <span className={styles.who}>
      <span className={styles.dot} style={{ background: `var(--person-${person})` }} aria-hidden="true" />
      {NAMES[person]}
    </span>
  );
}

function When({ iso, t, locale }: { iso: string; t: T; locale: string }) {
  const [now] = useState(() => Date.now());
  const a = ago(iso, now);
  const exact = new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <time dateTime={iso} title={exact} className={styles.when}>
      {t(`officeBoard.ago.${a.key}`, { n: a.n })}
    </time>
  );
}

function Pictures({ items, t, onOpen }: { items: readonly Attachment[]; t: T; onOpen: (a: Attachment) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.pictures}>
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" className={styles.thumb} onClick={() => onOpen(a)} data-testid="berlin-thumb">
            {/* a private picture behind the login: plain img, no Next image optimisation */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pictureUrl(a.id, "thumb")} alt={t("officeBoard.ticket.pictureAlt", { name: NAMES[a.uploadedBy] })} loading="lazy" width={Math.min(a.width, 200)} height={Math.round((Math.min(a.width, 200) / a.width) * a.height)} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Lightbox({ picture, t, onClose }: { picture: Attachment; t: T; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={t("officeBoard.ticket.pictureAlt", { name: NAMES[picture.uploadedBy] })} onClick={onClose}>
      <button ref={ref} type="button" className={styles.close} onClick={onClose} aria-label={t("officeBoard.ticket.closePicture")}>
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pictureUrl(picture.id, "full")} alt={t("officeBoard.ticket.pictureAlt", { name: NAMES[picture.uploadedBy] })} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function NewTicket({ t, onDone, onError }: { t: T; onDone: () => void; onError: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<Assignee>("none");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await officeApi.create({ title: title.trim(), description, assignee });
      onDone();
    } catch {
      onError();
      setBusy(false);
    }
  };
  return (
    <form className={styles.newForm} onSubmit={submit} data-testid="berlin-new-form">
      <label htmlFor={`${id}-t`}>{t("officeBoard.form.title")}</label>
      <input id={`${id}-t`} value={title} maxLength={120} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor={`${id}-d`}>{t("officeBoard.form.description")}</label>
      <textarea id={`${id}-d`} value={description} rows={3} maxLength={10000} onChange={(e) => setDescription(e.target.value)} />
      <label htmlFor={`${id}-a`}>{t("officeBoard.form.assignee")}</label>
      <select id={`${id}-a`} value={assignee} onChange={(e) => setAssignee(e.target.value as Assignee)}>
        <option value="none">{t("officeBoard.nobody")}</option>
        <option value="ben">Ben</option>
        <option value="vince">Vince</option>
      </select>
      <div className={styles.row}>
        <button type="submit" className={styles.primary} disabled={busy || !title.trim()}>
          {t("officeBoard.form.create")}
        </button>
        <button type="button" className={styles.ghost} onClick={onDone}>
          {t("officeBoard.form.cancel")}
        </button>
      </div>
    </form>
  );
}

function TicketDialog({ id, me, t, locale, onClose, onChanged }: { id: string; me: Person; t: T; locale: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ ticket: Ticket; entries: Entry[]; attachments: Attachment[] } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [text, setText] = useState("");
  const [question, setQuestion] = useState(me === "ana");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const team = isTeam(me);

  const load = useCallback(async () => {
    try {
      setData(await officeApi.get(id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    officeApi.get(id).then(
      (d) => alive && setData(d),
      () => alive && setFailed(true),
    );
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // the picture closes first, then the ticket
      if (document.querySelector("[data-office-lightbox]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [id, onClose]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setSaveFailed(false);
    try {
      await run();
      await load();
      onChanged();
      return true;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pick = (list: FileList | null) => {
    if (!list) return;
    const picked = [...list].filter((f) => PICTURE_TYPES.split(",").includes(f.type));
    const big = picked.find((f) => f.size > MAX_PICTURE_BYTES);
    setTooBig(big ? big.name : null);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_PICTURE_BYTES)].slice(0, 6));
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    const ok = await act(async () => {
      const entryId = text.trim() ? (await officeApi.comment(id, text.trim(), question)).entry.id : null;
      for (const f of files) await officeApi.upload(id, f, entryId);
    });
    if (ok) {
      setText("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const picturesOf = (entryId: string | null) => (data ? data.attachments.filter((a) => a.entryId === entryId) : []);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} data-testid="berlin-ticket">
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label={t("officeBoard.ticket.close")}>
          ×
        </button>
        {!data && !failed && <p className={styles.muted}>{t("officeBoard.loading")}</p>}
        {failed && <p className={styles.error}>{t("officeBoard.loadFailed")}</p>}
        {data && (
          <>
            <h2 id={titleId} className={styles.dialogTitle}>
              {data.ticket.title}
            </h2>
            <p className={styles.meta}>
              {t("officeBoard.ticket.created", { date: new Date(data.ticket.createdAt).toLocaleDateString(locale, { dateStyle: "long" }) })} ·{" "}
              {t("officeBoard.ticket.by", { name: NAMES[data.ticket.createdBy] })} · <Who person={data.ticket.assignee} t={t} />
            </p>
            {team && (
              <div className={styles.row}>
                <label className={styles.inline}>
                  {t("officeBoard.ticket.status")}{" "}
                  <select value={data.ticket.column} disabled={busy} onChange={(e) => void act(() => officeApi.update(id, { column: e.target.value as Column }))}>
                    {COLUMNS.map((c) => (
                      <option key={c} value={c}>
                        {t(`officeBoard.columns.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.inline}>
                  {t("officeBoard.form.assignee")}{" "}
                  <select value={data.ticket.assignee} disabled={busy} onChange={(e) => void act(() => officeApi.update(id, { assignee: e.target.value as Assignee }))}>
                    <option value="none">{t("officeBoard.nobody")}</option>
                    <option value="ben">Ben</option>
                    <option value="vince">Vince</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={busy}
                  onClick={async () => {
                    if (await act(() => officeApi.update(id, { archived: true }))) onClose();
                  }}
                >
                  {t("officeBoard.ticket.archive")}
                </button>
              </div>
            )}
            {data.ticket.description && <p className={styles.description}>{data.ticket.description}</p>}
            <Pictures items={picturesOf(null)} t={t} onOpen={setLightbox} />
            <h3 className={styles.sub}>{t("officeBoard.ticket.history")}</h3>
            {data.entries.length === 0 && <p className={styles.muted}>{t("officeBoard.ticket.noHistory")}</p>}
            <ol className={styles.history}>
              {data.entries.map((e) => (
                <li key={e.id} className={`${styles.entry} ${e.isQuestion && !e.questionResolved ? styles.openQ : ""}`} data-testid="berlin-entry">
                  <div className={styles.entryHead}>
                    <Who person={e.author} t={t} />
                    <When iso={e.createdAt} t={t} locale={locale} />
                    {e.isQuestion && <span className={e.questionResolved ? styles.tagDone : styles.tagQ}>{e.questionResolved ? t("officeBoard.ticket.answered") : t("officeBoard.ticket.question")}</span>}
                  </div>
                  <p className={styles.entryBody}>{e.body}</p>
                  <Pictures items={picturesOf(e.id)} t={t} onOpen={setLightbox} />
                  {team && e.isQuestion && !e.questionResolved && (
                    <button type="button" className={styles.small} disabled={busy} onClick={() => void act(() => officeApi.resolve(e.id))}>
                      {t("officeBoard.ticket.markAnswered")}
                    </button>
                  )}
                </li>
              ))}
            </ol>
            <form
              className={`${styles.comment} ${dropping ? styles.dropping : ""}`}
              onSubmit={send}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDropping(true);
                }
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                pick(e.dataTransfer.files);
              }}
            >
              <textarea value={text} rows={3} maxLength={5000} placeholder={t("officeBoard.ticket.write")} aria-label={t("officeBoard.ticket.write")} onChange={(e) => setText(e.target.value)} />
              <div className={styles.row}>
                <label className={styles.inline}>
                  <input type="checkbox" checked={question} onChange={(e) => setQuestion(e.target.checked)} /> {t("officeBoard.ticket.isQuestion")}
                </label>
                <label className={styles.ghost}>
                  {t("officeBoard.ticket.addPictures")}
                  <input ref={fileRef} type="file" accept={PICTURE_TYPES} multiple className={styles.visuallyHidden} onChange={(e) => pick(e.target.files)} data-testid="berlin-file" />
                </label>
                <button type="submit" className={styles.primary} disabled={busy || (!text.trim() && files.length === 0)}>
                  {t("officeBoard.ticket.send")}
                </button>
              </div>
              <p className={styles.muted}>{files.length > 0 ? t("officeBoard.ticket.selected", { n: files.length }) : t("officeBoard.ticket.dropHint")}</p>
              {tooBig && (
                <p className={styles.error} role="alert">
                  {t("officeBoard.ticket.tooBig", { name: tooBig })}
                </p>
              )}
            </form>
            {saveFailed && (
              <p className={styles.error} role="alert">
                {t("officeBoard.saveFailed")}
              </p>
            )}
          </>
        )}
      </div>
      {lightbox && (
        <div data-office-lightbox="">
          <Lightbox
            picture={lightbox}
            t={t}
            onClose={() => setLightbox(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The board as a readable 2D view; inside the 3D room it opens when the wall is clicked (or, for one person, when
 * their desk is clicked). onLoaded hands every fresh list to the room, so the wall follows what happens here.
 */
export function OfficeBoard({ embedded = false, person, onLoaded }: { embedded?: boolean; person?: "ben" | "vince"; onLoaded?: (tickets: TicketSummary[]) => void }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<{ me: Person; tickets: TicketSummary[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Column | null>(null);
  // stable, so the open ticket does not reload (and grab focus) every time the board refreshes
  const closeTicket = useCallback(() => setOpen(null), []);

  const loadedRef = useRef(onLoaded);
  useEffect(() => {
    loadedRef.current = onLoaded;
  }, [onLoaded]);
  const load = useCallback(async () => {
    try {
      const d = await officeApi.list();
      setState(d);
      setFailed(false);
      loadedRef.current?.(d.tickets);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    officeApi.list().then(
      (d) => {
        if (!alive) return;
        setState(d);
        loadedRef.current?.(d.tickets);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const move = async (id: string, column: Column) => {
    setSaveFailed(false);
    try {
      await officeApi.update(id, { column });
    } catch {
      setSaveFailed(true);
    }
    await load();
  };

  const team = state ? isTeam(state.me) : false;
  const columns = state ? byColumn(person ? state.tickets.filter((x) => x.assignee === person) : state.tickets) : null;

  const onDrop = (column: Column) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/x-office-ticket");
    if (id) void move(id, column);
  };

  return (
    <section className={`${styles.board} ${embedded ? styles.embedded : ""}`} aria-labelledby="berlin-board-title" data-testid="berlin-board">
      <header className={styles.header}>
        <div>
          {embedded ? (
            <h2 id="berlin-board-title" className={styles.title} tabIndex={-1}>
              {person ? t("officeBoard.room.deskTitle", { name: NAMES[person] }) : t("officeBoard.title")}
            </h2>
          ) : (
            <h1 id="berlin-board-title" className={styles.title}>
              {t("officeBoard.title")}
            </h1>
          )}
          <p className={styles.muted}>{person ? t("officeBoard.room.deskHint", { name: NAMES[person] }) : t("officeBoard.subtitle")}</p>
        </div>
        {team && !creating && !person && (
          <button type="button" className={styles.primary} onClick={() => setCreating(true)} data-testid="berlin-new">
            + {t("officeBoard.newTicket")}
          </button>
        )}
      </header>
      {creating && (
        <NewTicket
          t={t}
          onError={() => setSaveFailed(true)}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {saveFailed && (
        <p className={styles.error} role="alert">
          {t("officeBoard.saveFailed")}
        </p>
      )}
      {!state && !failed && <p className={styles.muted}>{t("officeBoard.loading")}</p>}
      {failed && (
        <p className={styles.error} role="alert">
          {t("officeBoard.loadFailed")}{" "}
          <button type="button" className={styles.small} onClick={() => void load()}>
            {t("officeBoard.retry")}
          </button>
        </p>
      )}
      {columns && (
        <div className={styles.columns}>
          {COLUMNS.map((c, ci) => (
            <div
              key={c}
              className={`${styles.column} ${dragOver === c ? styles.over : ""}`}
              onDragOver={team ? (e) => (e.preventDefault(), setDragOver(c)) : undefined}
              onDragLeave={team ? () => setDragOver(null) : undefined}
              onDrop={team ? onDrop(c) : undefined}
              data-testid={`berlin-col-${c}`}
            >
              <h2 className={styles.colTitle}>
                {t(`officeBoard.columns.${c}`)} <span className={styles.count}>{columns[c].length}</span>
              </h2>
              {columns[c].length === 0 && <p className={styles.muted}>{t("officeBoard.empty")}</p>}
              <ul className={styles.cards}>
                {columns[c].map((ticket) => (
                  <li
                    key={ticket.id}
                    className={`${styles.card} ${ticket.openQuestions > 0 ? styles.cardQ : ""}`}
                    draggable={team}
                    onDragStart={team ? (e) => e.dataTransfer.setData("text/x-office-ticket", ticket.id) : undefined}
                    data-testid="berlin-card"
                  >
                    <button type="button" className={styles.cardOpen} onClick={() => setOpen(ticket.id)} aria-label={t("officeBoard.card.open", { title: ticket.title })}>
                      <span className={styles.cardTitle}>{ticket.title}</span>
                      <span className={styles.cardFoot}>
                        <Who person={ticket.assignee} t={t} />
                        {ticket.entries > 0 && <span title={t("officeBoard.card.comments", { n: ticket.entries })}>💬 {ticket.entries}</span>}
                        {ticket.attachments > 0 && <span title={t("officeBoard.card.pictures", { n: ticket.attachments })}>🖼 {ticket.attachments}</span>}
                        {ticket.openQuestions > 0 && (
                          <span className={styles.qMark} title={t("officeBoard.card.question")} data-testid="berlin-question">
                            ?
                          </span>
                        )}
                      </span>
                    </button>
                    {team && (
                      <span className={styles.moves}>
                        {ci > 0 && (
                          <button type="button" className={styles.small} onClick={() => void move(ticket.id, COLUMNS[ci - 1]!)} aria-label={t("officeBoard.card.moveLeft", { column: t(`officeBoard.columns.${COLUMNS[ci - 1]!}`) })}>
                            ←
                          </button>
                        )}
                        {ci < COLUMNS.length - 1 && (
                          <button type="button" className={styles.small} onClick={() => void move(ticket.id, COLUMNS[ci + 1]!)} aria-label={t("officeBoard.card.moveRight", { column: t(`officeBoard.columns.${COLUMNS[ci + 1]!}`) })}>
                            →
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {/* on top of everything, also of the 3D room the board may sit in */}
      {open && state && typeof document !== "undefined"
        ? createPortal(<TicketDialog id={open} me={state.me} t={t} locale={locale} onClose={closeTicket} onChanged={() => void load()} />, document.body)
        : null}
    </section>
  );
}
