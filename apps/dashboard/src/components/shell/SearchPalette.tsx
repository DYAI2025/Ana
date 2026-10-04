"use client";

import { CornerDownLeft, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { usePrototype } from "@/components/providers/PrototypeProvider";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { buildSearchIndex, groupResults, searchEntries, type SearchEntry } from "@/lib/search";
import styles from "./search.module.css";

/** Each pick from search gets a fresh `nav` value so the target page re-applies it even if that URL is already open. */
let navCounter = 0;
export function withNavNonce(href: string): string {
  if (!href.includes("?")) return href;
  navCounter += 1;
  return `${href}&nav=${navCounter}`;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { state } = usePrototype();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const index = useMemo(() => buildSearchIndex(state, locale), [state, locale]);
  const results = useMemo(() => searchEntries(index, query), [index, query]);
  const grouped = useMemo(() => groupResults(results), [results]);
  const ordered = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const close = useCallback(() => {
    setQuery("");
    setActive(0);
    onClose();
  }, [onClose]);

  useFocusTrap(panel, open, close);

  useEffect(() => {
    if (!open) return;
    const selected = document.getElementById(`${listId}-${active}`);
    selected?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  if (!open) return null;

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    close();
    router.push(withNavNonce(entry.href));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, ordered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(ordered[active]);
    }
  };

  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />
      <div ref={panel} className={`glass ${styles.panel}`} role="dialog" aria-modal="true" aria-label={t("search.label")} data-testid="search-panel">
        <div className={styles.field}>
          <Search size={18} aria-hidden="true" />
          <input
            data-autofocus
            className={styles.input}
            role="combobox"
            aria-expanded={ordered.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={ordered.length ? `${listId}-${active}` : undefined}
            aria-label={t("search.label")}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            data-testid="search-input"
          />
          <button type="button" className={styles.close} onClick={close} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {ordered.length === 0 ? <p className={styles.empty}>{t("search.empty")}</p> : null}
        <p className="visually-hidden" aria-live="polite">
          {t("search.results", { count: ordered.length })}
        </p>
        <div className={styles.results} id={listId} role="listbox" aria-label={t("search.label")}>
          {grouped.map(({ group, items, start }) => (
            <div key={group} role="group" aria-label={t(`search.groups.${group}`)} className={styles.group}>
              <p className={styles.groupLabel} aria-hidden="true">
                {t(`search.groups.${group}`)}
              </p>
              {items.map((item, offset) => {
                const index = start + offset;
                return (
                  <div
                    key={item.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={styles.option}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(item)}
                    data-testid="search-result"
                  >
                    <span className={styles.optionLabel}>{item.label}</span>
                    <span className={styles.optionDetail}>{item.detail}</span>
                    {index === active ? <CornerDownLeft size={14} aria-hidden="true" className={styles.enter} /> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className={styles.hint}>{t("search.hint")}</p>
      </div>
    </div>
  );
}
