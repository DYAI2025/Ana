"use client";

import { useState } from "react";
import type { useI18n } from "@/components/providers/I18nProvider";
import type { BriefRecord } from "./brief";
import { MARKET_SOURCE, marketSplit } from "./markets";
import type { WorldPayload } from "./types";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];
const pct0 = (v: number) => `${Math.round(v * 100)} %`;

/**
 * "Das Wichtigste fürs Geschäft": the market split of the engaged audience (computed here, no model) and the brief
 * (written by the model from numbered facts, see brief.ts). Every claim shows the facts it rests on.
 */
export function BriefBlock({ world, t, ago }: { world: WorldPayload; t: T; ago: (iso: string | null) => string }) {
  const [own, setOwn] = useState<BriefRecord | null>(null);
  const [req, setReq] = useState<{ state: "idle" | "busy" | "failed"; reason?: string }>({ state: "idle" });
  const [which, setWhich] = useState<"latest" | "weekly">("latest");
  const b = world.brief;
  const latest = own && (!b.latest || Date.parse(own.at) >= Date.parse(b.latest.at)) ? own : b.latest;
  const shown = which === "weekly" && b.weekly ? b.weekly : latest;
  const week = marketSplit(world.audience.engaged_country_week);
  const month = marketSplit(world.audience.engaged_country);
  const split = week ?? month;

  const summarize = async () => {
    if (req.state === "busy") return;
    setReq({ state: "busy" });
    try {
      const r = await fetch("/api/world/brief", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; brief?: BriefRecord; reason?: string };
      if (!r.ok || !body.ok || !body.brief) {
        setReq({ state: "failed", reason: body.reason ?? `HTTP ${r.status}` });
        return;
      }
      setOwn(body.brief);
      setWhich("latest");
      setReq({ state: "idle" });
    } catch {
      setReq({ state: "failed", reason: "network" });
    }
  };

  const factText = (r: BriefRecord, id: string) => r.facts.find((f) => f.id === id)?.text ?? id;
  const cites = (r: BriefRecord, ids: string[], label: string) =>
    ids.length ? (
      <details className={styles.briefFacts}>
        <summary>{t(label as never, { n: ids.length })}</summary>
        <ul>
          {ids.map((id) => (
            <li key={id}>
              <b>{id}</b> {factText(r, id)}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  return (
    <section className={styles.section} aria-labelledby="world-brief-title" data-testid="world-brief">
      <h3 id="world-brief-title">{t("world.brief.title")}</h3>
      {split ? (
        <div data-testid="world-brief-markets">
          <p>
            <b>{t(week ? "world.brief.marketsWeek" : "world.brief.marketsMonth")}</b>
          </p>
          <div className={styles.tierBar} role="img" aria-label={t("world.brief.tierAria", { t1: pct0(split.t1), t2: pct0(split.t2), t3: pct0(split.t3) })}>
            {([1, 2, 3] as const).map((k) => {
              const v = k === 1 ? split.t1 : k === 2 ? split.t2 : split.t3;
              return v > 0 ? <span key={k} data-tier={k} style={{ width: `${v * 100}%` }} /> : null;
            })}
          </div>
          <p className={styles.muted}>
            {t("world.brief.tiers", { t1: pct0(split.t1), t2: pct0(split.t2), t3: pct0(split.t3) })}
            {week && month ? ` · ${t("world.brief.vsMonth", { t1: pct0(month.t1) })}` : ""}
          </p>
          {split.top1.length ? <p className={styles.muted}>{t("world.brief.top1", { list: split.top1.map((c) => `${c.key} ${pct0(c.share)}`).join(", ") })}</p> : null}
          <p className={styles.note}>{t("world.brief.tierNote", { source: MARKET_SOURCE })}</p>
        </div>
      ) : null}

      <button type="button" className={styles.briefButton} onClick={() => void summarize()} disabled={b.state === "off" || req.state === "busy"} aria-busy={req.state === "busy"} data-testid="world-brief-button">
        {req.state === "busy" ? t("world.brief.busy") : t("world.brief.button")}
      </button>
      <p className={styles.muted} role="status" data-testid="world-brief-state" data-state={b.state === "off" ? "off" : req.state}>
        {b.state === "off" ? t("world.brief.off") : req.state === "failed" ? t("world.brief.failed", { reason: req.reason ?? "?" }) : req.state === "busy" ? t("world.brief.busyNote") : ""}
      </p>

      {b.weekly && latest && b.weekly.at !== latest.at ? (
        <div role="group" aria-label={t("world.brief.which")} className={styles.segment}>
          <button type="button" aria-pressed={which === "latest"} onClick={() => setWhich("latest")}>
            {t("world.brief.latest")}
          </button>
          <button type="button" aria-pressed={which === "weekly"} onClick={() => setWhich("weekly")}>
            {t("world.brief.weekly", { week: b.weekly.week })}
          </button>
        </div>
      ) : null}

      {shown ? (
        <div className={styles.brief} data-testid="world-brief-body" data-kind={shown.kind}>
          {shown.brief.headline ? <p className={styles.briefHeadline}>{shown.brief.headline}</p> : null}
          <ol className={styles.briefPatterns}>
            {shown.brief.patterns.map((p, i) => (
              <li key={`${i}-${p.title}`} data-kind={p.kind} data-strength={p.strength}>
                <span className={styles.chips}>
                  <span className={styles.chip}>{t(`world.brief.kinds.${p.kind}`)}</span>
                  <span className={styles.chip} data-strength={p.strength}>
                    {t(`world.brief.strength.${p.strength}`)}
                  </span>
                </span>
                <b>{p.title}</b>
                <span>{p.text}</span>
                {cites(shown, p.facts, "world.brief.evidence")}
                {p.counter ? (
                  <span className={styles.muted}>
                    {t("world.brief.counter")} {p.counter}
                  </span>
                ) : null}
                {cites(shown, p.counter_facts, "world.brief.counterEvidence")}
              </li>
            ))}
          </ol>
          {shown.brief.brands ? (
            <div data-testid="world-brief-brands">
              <h4>{t("world.brief.brands")}</h4>
              <p>{shown.brief.brands.text}</p>
              {cites(shown, shown.brief.brands.facts, "world.brief.evidence")}
            </div>
          ) : null}
          {shown.brief.substack ? (
            <div data-testid="world-brief-substack">
              <h4>{shown.brief.substack.lean ? t("world.brief.substackLean", { lean: shown.brief.substack.lean }) : t("world.brief.substack")}</h4>
              <p>{shown.brief.substack.text}</p>
              {cites(shown, shown.brief.substack.facts, "world.brief.evidence")}
            </div>
          ) : null}
          {shown.brief.next_test ? (
            <div>
              <h4>{t("world.brief.nextTest")}</h4>
              <p>{shown.brief.next_test}</p>
            </div>
          ) : null}
          {shown.brief.limits.length ? (
            <div>
              <h4>{t("world.brief.limits")}</h4>
              <ul className={styles.plain}>
                {shown.brief.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className={styles.note}>
            {t(shown.kind === "weekly" ? "world.brief.metaWeekly" : "world.brief.meta", { time: ago(shown.at), model: shown.model, n: shown.facts.length, week: shown.week })}
            {shown.brief.dropped ? ` ${t("world.brief.dropped", { n: shown.brief.dropped })}` : ""}
          </p>
        </div>
      ) : b.state !== "off" ? (
        <p className={styles.muted}>{t("world.brief.none")}</p>
      ) : null}
    </section>
  );
}
