"use client";

import { ArrowLeft, Lightbulb, Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { PEOPLE, type PersonId } from "@/fixtures/team";
import type { MessageKey } from "@/i18n/translate";
import { validateIdea } from "@/state/prototype";
import styles from "./backlog.module.css";

export function BacklogView() {
  const { t, text } = useI18n();
  const { state, dispatch } = usePrototype();
  const { notify } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<PersonId>("ana");
  const [error, setError] = useState<MessageKey | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  const open = () => {
    setFormOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const close = () => {
    setFormOpen(false);
    setTitle("");
    setError(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const submit = (event: Pick<FormEvent, "preventDefault">) => {
    event.preventDefault();
    const problem = validateIdea(title);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    dispatch({ type: "addIdea", title, owner });
    notify(t("backlog.ideaAdded"));
    setTitle("");
    setError(null);
    setFormOpen(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("backlog.title")}
        subtitle={t("backlog.subtitle")}
        actions={
          <>
            <ButtonLink href="/board" variant="quiet" icon={<ArrowLeft size={15} aria-hidden="true" />}>
              {t("backlog.backToBoard")}
            </ButtonLink>
            <Button
              ref={openerRef}
              variant="primary"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={open}
              data-testid="add-idea"
            >
              {t("backlog.addIdea")}
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        <div>
          {formOpen ? (
            <form id={formId} className={`glass ${styles.form}`} onSubmit={submit} noValidate data-testid="idea-form">
              <div className={styles.formHead}>
                <h2 className={styles.formTitle}>{t("backlog.addIdeaTitle")}</h2>
                <StatusChip tone="local">{t("common.localOnly")}</StatusChip>
              </div>
              <label className={styles.label} htmlFor={`${formId}-title`}>
                {t("backlog.ideaLabel")}
              </label>
              <textarea
                ref={inputRef}
                id={`${formId}-title`}
                className={styles.input}
                rows={2}
                maxLength={140}
                placeholder={t("backlog.ideaPlaceholder")}
                value={title}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${formId}-note${error ? ` ${formId}-error` : ""}`}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) submit(e);
                  if (e.key === "Escape") close();
                }}
                data-testid="idea-input"
              />
              {error ? (
                <p id={`${formId}-error`} className={styles.error} role="alert">
                  {t(error)}
                </p>
              ) : null}
              <fieldset className={styles.owners}>
                <legend className={styles.label}>{t("backlog.ownerLabel")}</legend>
                {PEOPLE.map((person) => (
                  <label key={person} className={styles.ownerOption}>
                    <input type="radio" name="owner" value={person} checked={owner === person} onChange={() => setOwner(person)} />
                    <Avatar person={person} size={22} showName />
                  </label>
                ))}
              </fieldset>
              <p id={`${formId}-note`} className={styles.note}>
                {t("backlog.ideaLocalNote")}
              </p>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" data-testid="idea-submit">
                  {t("backlog.addIdea")}
                </Button>
                <Button variant="quiet" onClick={close}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}

          <p className={styles.count}>{t("backlog.count", { count: state.backlog.length })}</p>
          <ol className={styles.list} data-testid="backlog-list">
            {state.backlog.map((item) => (
              <li key={item.id} className={styles.row} data-kind={item.kind} data-testid="backlog-item">
                <span className={styles.index} aria-hidden="true">
                  {item.kind === "idea" ? <Lightbulb size={15} /> : String(state.backlog.filter((b) => b.kind === "backlog").indexOf(item) + 1).padStart(2, "0")}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{text(item.title)}</span>
                  <span className={styles.rowMeta}>{t(item.kind === "idea" ? "backlog.kindIdea" : "backlog.kindBacklog")}</span>
                </span>
                {item.owner ? <Avatar person={item.owner} size={22} showName /> : null}
                {item.local ? <StatusChip tone="local">{t("backlog.newBadge")}</StatusChip> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
