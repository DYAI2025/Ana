"use client";

import { useId, useState } from "react";
import type { useI18n } from "@/components/providers/I18nProvider";
import { RATE_CARD_LIMITS, rateId, type RateCard } from "@/features/kit/rateCard";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];

/** a format while it is edited: numbers and lists as the team types them */
interface DraftRate {
  key: string;
  id: string | null;
  name: string;
  quote: string;
  minimum: string;
  includes: string;
  note: string;
}
interface DraftTier {
  key: string;
  label: string;
  value: string;
}
interface DraftAddon {
  key: string;
  name: string;
  tiers: DraftTier[];
  note: string;
}

let seq = 0;
const key = () => `k${++seq}`;
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const num = (s: string): number | null => {
  const v = Number(s.replace(/[\s,$]/g, ""));
  return s.trim() && Number.isFinite(v) ? v : null;
};

function toDraft(card: RateCard) {
  return {
    rates: card.rates.map<DraftRate>((r) => ({ key: key(), id: r.id, name: r.name, quote: String(r.quote), minimum: r.minimum === null ? "" : String(r.minimum), includes: r.includes.join("\n"), note: r.note ?? "" })),
    addons: card.addons.map<DraftAddon>((a) => ({ key: key(), name: a.name, tiers: a.tiers.map((x) => ({ key: key(), ...x })), note: a.note ?? "" })),
    tips: card.tips.join("\n"),
  };
}

/** the draft as the card the server stores (ids for new formats from their names) */
function fromDraft(d: ReturnType<typeof toDraft>) {
  const taken = new Set(d.rates.map((r) => r.id).filter((x): x is string => Boolean(x)));
  return {
    rates: d.rates.map((r) => {
      let id = r.id;
      if (!id) {
        id = rateId(r.name, taken);
        taken.add(id);
      }
      const min = num(r.minimum);
      return { id, name: r.name.trim(), quote: num(r.quote), minimum: r.minimum.trim() ? min ?? r.minimum : null, includes: lines(r.includes), note: r.note.trim() || null };
    }),
    addons: d.addons.map((a) => ({ name: a.name.trim(), tiers: a.tiers.filter((x) => x.label.trim() || x.value.trim()).map((x) => ({ label: x.label.trim(), value: x.value.trim() })), note: a.note.trim() || null })),
    tips: lines(d.tips),
  };
}

/**
 * Editing Ana's rate card in the office: everyone on the dashboard login (Ana, Vince, Ben) can change, add and remove
 * formats, add-ons and tips. One save stores the whole card; when someone else saved in between, nothing is
 * overwritten: the editor says so and shows their version.
 */
export function RateCardEditor({ card, t, onSaved, onCancel }: { card: RateCard; t: T; onSaved: (card: RateCard) => void; onCancel: () => void }) {
  const uid = useId();
  const [draft, setDraft] = useState(() => toDraft(card));
  const [base, setBase] = useState(card.updated_at);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "problems"; list: string[] } | { kind: "conflict" } | { kind: "failed" }>({ kind: "idle" });

  const setRate = (i: number, patch: Partial<DraftRate>) => setDraft((d) => ({ ...d, rates: d.rates.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const setAddon = (i: number, patch: Partial<DraftAddon>) => setDraft((d) => ({ ...d, addons: d.addons.map((a, k) => (k === i ? { ...a, ...patch } : a)) }));
  const setTier = (i: number, j: number, patch: Partial<DraftTier>) => setAddon(i, { tiers: draft.addons[i]!.tiers.map((x, k) => (k === j ? { ...x, ...patch } : x)) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      const r = await fetch("/api/rate-card", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: fromDraft(draft), base }) });
      const body = (await r.json()) as { ok?: boolean; card?: RateCard; reason?: string; problems?: string[] };
      if (r.ok && body.ok && body.card) {
        onSaved(body.card);
        return;
      }
      if (r.status === 409 && body.card) {
        // someone saved in between: show their version, never overwrite it
        setDraft(toDraft(body.card));
        setBase(body.card.updated_at);
        setState({ kind: "conflict" });
        return;
      }
      setState(body.problems?.length ? { kind: "problems", list: body.problems } : { kind: "failed" });
    } catch {
      setState({ kind: "failed" });
    }
  };

  const field = (id: string, label: string, input: React.ReactNode) => (
    <div className={styles.rateField}>
      <label htmlFor={id}>{label}</label>
      {input}
    </div>
  );

  return (
    <form
      className={styles.rateEditor}
      onSubmit={save}
      // Escape inside the form does not leave the room (unsaved edits would be lost): Cancel does
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
      data-testid="office-rates-editor"
    >
      <p className={styles.note}>{t("world.office.rates.editLead")}</p>
      <fieldset className={styles.rateEditGroup}>
        <legend>{t("world.office.rates.formats")}</legend>
        {draft.rates.map((r, i) => {
          const p = `${uid}-r${r.key}`;
          return (
            <div key={r.key} className={styles.rateEditItem} data-testid={`office-rates-edit-rate-${i}`}>
              {field(`${p}-name`, t("world.office.rates.fieldName"), <input id={`${p}-name`} value={r.name} maxLength={60} required onChange={(e) => setRate(i, { name: e.target.value })} />)}
              <div className={styles.rateEditRow}>
                {field(`${p}-quote`, t("world.office.rates.fieldQuote"), <input id={`${p}-quote`} value={r.quote} inputMode="decimal" required onChange={(e) => setRate(i, { quote: e.target.value })} />)}
                {field(`${p}-min`, t("world.office.rates.fieldMinimum"), <input id={`${p}-min`} value={r.minimum} inputMode="decimal" onChange={(e) => setRate(i, { minimum: e.target.value })} />)}
              </div>
              {field(`${p}-inc`, t("world.office.rates.fieldIncludes"), <textarea id={`${p}-inc`} value={r.includes} rows={2} onChange={(e) => setRate(i, { includes: e.target.value })} />)}
              {field(`${p}-note`, t("world.office.rates.fieldNote"), <input id={`${p}-note`} value={r.note} maxLength={200} onChange={(e) => setRate(i, { note: e.target.value })} />)}
              <button type="button" className={styles.rateEditRemove} onClick={() => setDraft((d) => ({ ...d, rates: d.rates.filter((_, k) => k !== i) }))}>
                {t("world.office.rates.remove", { name: r.name || t("world.office.rates.fieldName") })}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={styles.rateEditAdd}
          disabled={draft.rates.length >= RATE_CARD_LIMITS.rates}
          onClick={() => setDraft((d) => ({ ...d, rates: [...d.rates, { key: key(), id: null, name: "", quote: "", minimum: "", includes: "", note: "" }] }))}
          data-testid="office-rates-add-rate"
        >
          + {t("world.office.rates.addRate")}
        </button>
      </fieldset>
      <fieldset className={styles.rateEditGroup}>
        <legend>{t("world.office.rates.addons")}</legend>
        {draft.addons.map((a, i) => {
          const p = `${uid}-a${a.key}`;
          return (
            <div key={a.key} className={styles.rateEditItem}>
              {field(`${p}-name`, t("world.office.rates.fieldName"), <input id={`${p}-name`} value={a.name} maxLength={60} required onChange={(e) => setAddon(i, { name: e.target.value })} />)}
              {a.tiers.map((x, j) => (
                <div key={x.key} className={styles.rateEditRow}>
                  {field(`${p}-t${x.key}-l`, t("world.office.rates.fieldTierLabel"), <input id={`${p}-t${x.key}-l`} value={x.label} maxLength={40} onChange={(e) => setTier(i, j, { label: e.target.value })} />)}
                  {field(`${p}-t${x.key}-v`, t("world.office.rates.fieldTierValue"), <input id={`${p}-t${x.key}-v`} value={x.value} maxLength={40} onChange={(e) => setTier(i, j, { value: e.target.value })} />)}
                  <button type="button" className={styles.rateEditRemoveSmall} aria-label={t("world.office.rates.removeStep", { label: x.label || String(j + 1) })} onClick={() => setAddon(i, { tiers: a.tiers.filter((_, k) => k !== j) })}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className={styles.rateEditAdd} disabled={a.tiers.length >= RATE_CARD_LIMITS.tiers} onClick={() => setAddon(i, { tiers: [...a.tiers, { key: key(), label: "", value: "" }] })}>
                + {t("world.office.rates.addStep")}
              </button>
              {field(`${p}-note`, t("world.office.rates.fieldNote"), <input id={`${p}-note`} value={a.note} maxLength={200} onChange={(e) => setAddon(i, { note: e.target.value })} />)}
              <button type="button" className={styles.rateEditRemove} onClick={() => setDraft((d) => ({ ...d, addons: d.addons.filter((_, k) => k !== i) }))}>
                {t("world.office.rates.remove", { name: a.name || t("world.office.rates.fieldName") })}
              </button>
            </div>
          );
        })}
        <button type="button" className={styles.rateEditAdd} disabled={draft.addons.length >= RATE_CARD_LIMITS.addons} onClick={() => setDraft((d) => ({ ...d, addons: [...d.addons, { key: key(), name: "", tiers: [], note: "" }] }))}>
          + {t("world.office.rates.addAddon")}
        </button>
      </fieldset>
      <fieldset className={styles.rateEditGroup}>
        <legend>{t("world.office.rates.tips")}</legend>
        {field(`${uid}-tips`, t("world.office.rates.fieldTips"), <textarea id={`${uid}-tips`} value={draft.tips} rows={2} onChange={(e) => setDraft((d) => ({ ...d, tips: e.target.value }))} data-testid="office-rates-edit-tips" />)}
      </fieldset>
      <div role="status" aria-live="polite" className={styles.rateEditStatus} data-testid="office-rates-edit-status">
        {state.kind === "conflict" ? t("world.office.rates.conflict") : null}
        {state.kind === "failed" ? t("world.office.rates.saveFailed") : null}
        {state.kind === "problems" ? (
          <>
            {t("world.office.rates.problems")}
            <ul>
              {state.list.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div className={styles.rateEditActions}>
        <button type="submit" className={styles.officeBack} disabled={state.kind === "saving"} data-testid="office-rates-save">
          {state.kind === "saving" ? t("world.office.rates.saving") : t("world.office.rates.save")}
        </button>
        <button type="button" className={styles.rateEditCancel} onClick={onCancel} data-testid="office-rates-cancel">
          {t("world.office.rates.cancel")}
        </button>
      </div>
    </form>
  );
}
