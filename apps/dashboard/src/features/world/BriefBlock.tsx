"use client";

import { useMemo, useState } from "react";
import type { useI18n } from "@/components/providers/I18nProvider";
import type { Locale } from "@/lib/locale";
import type { BriefRecord } from "./brief";
import { MARKET_SOURCE, marketSplit, TIER1, TIER2 } from "./markets";
import type { WorldPost } from "./model";
import { signals, type Signal } from "./signals";
import type { WorldPayload } from "./types";
import styles from "./world.module.css";

type T = ReturnType<typeof useI18n>["t"];
const pct0 = (v: number) => `${Math.round(v * 100)} %`;

/** A cover from Meta's CDN; nothing when it is missing or does not load. */
function Cover({ post, onPost, label }: { post: WorldPost; onPost: (id: string) => void; label: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <button type="button" className={styles.cover} onClick={() => onPost(post.id)} aria-label={label}>
      {/* Meta's CDN picture as it is, like the Social cockpit (no Next image optimisation of a third-party URL) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {post.cover && !broken ? <img src={post.cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} /> : <span aria-hidden="true">▶</span>}
    </button>
  );
}

/**
 * "Auf einen Blick" at the top of "Was läuft": plain words first, numbers behind "Warum?".
 * 1. What runs well / what slows down — measured from Ana's posts (signals.ts), no model.
 * 2. Where the reactions come from — the ad-market tiers with a legend (markets.ts), no model.
 * 3. Claude's summary — on the button and weekly (brief.ts), every sentence with its facts behind "Warum?". Only the
 *    brief written in the dashboard language is shown (never another language's); the button writes one in it.
 */
export function BriefBlock({ world, posts, t, locale, ago, onPost }: { world: WorldPayload; posts: readonly WorldPost[]; t: T; locale: Locale; ago: (iso: string | null) => string; onPost: (id: string) => void }) {
  const [ownBy, setOwnBy] = useState<Partial<Record<Locale, BriefRecord>>>({});
  const [req, setReq] = useState<{ state: "idle" | "busy" | "failed"; reason?: string }>({ state: "idle" });
  const [which, setWhich] = useState<"latest" | "weekly">("latest");
  const b = world.brief;
  const own = ownBy[locale] ?? null;
  const served = b.latest[locale] ?? null;
  const weekly = b.weekly[locale] ?? null;
  const latest = own && (!served || Date.parse(own.at) >= Date.parse(served.at)) ? own : served;
  const shown = which === "weekly" && weekly ? weekly : latest;
  // a brief exists, but only in another language: say so instead of showing it in a language the reader may not read
  const elsewhere = !shown && (Object.keys(b.latest).length > 0 || Object.keys(b.weekly).length > 0);
  const week = marketSplit(world.audience.engaged_country_week);
  const month = marketSplit(world.audience.engaged_country);
  const split = week ?? month;
  const sig = useMemo(() => signals(posts, world.post_tags.tags), [posts, world.post_tags.tags]);

  const summarize = async () => {
    if (req.state === "busy") return;
    setReq({ state: "busy" });
    try {
      const r = await fetch("/api/world/brief", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ locale }) });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; brief?: BriefRecord; reason?: string };
      if (!r.ok || !body.ok || !body.brief) {
        setReq({ state: "failed", reason: body.reason ?? `HTTP ${r.status}` });
        return;
      }
      const written = body.brief;
      setOwnBy((o) => ({ ...o, [written.locale ?? "de"]: written }));
      setWhich("latest");
      setReq({ state: "idle" });
    } catch {
      setReq({ state: "failed", reason: "network" });
    }
  };

  const what = (s: Signal) => t(`world.simple.what.${s.field}.${s.value}` as never);
  const signalCard = (s: Signal, kind: "good" | "slow") => (
    <li key={`${s.field}-${s.value}`} className={styles.signal} data-kind={kind}>
      <span className={styles.signalCovers}>
        {s.examples.map((p) => (
          <Cover key={p.id} post={p} onPost={onPost} label={t("world.simple.openPost")} />
        ))}
      </span>
      <span>
        <b>{what(s)}</b> {/* "deutlich" only with 5 posts or more: 3 posts can make a big ratio by chance */}
        {t(kind === "good" ? (s.ratio >= 1.5 && s.n >= 5 ? "world.simple.muchMore" : "world.simple.more") : s.ratio <= 0.67 && s.n >= 5 ? "world.simple.muchLess" : "world.simple.less")}
      </span>
      <details className={styles.why}>
        <summary>{t("world.simple.why")}</summary>
        <p>{t("world.simple.whyLine", { group: `${(s.median * 100).toFixed(1)} %`, all: `${(s.overall * 100).toFixed(1)} %`, n: s.n })}</p>
        <p className={styles.muted}>{t("world.simple.rateExplained")}</p>
      </details>
    </li>
  );

  const factText = (r: BriefRecord, id: string) => r.facts.find((f) => f.id === id)?.text ?? id;
  const why = (r: BriefRecord, ids: string[], extra?: React.ReactNode) =>
    ids.length || extra ? (
      <details className={styles.why}>
        <summary>{t("world.simple.why")}</summary>
        {extra}
        {ids.length ? (
          <ul>
            {ids.map((id) => (
              <li key={id}>{factText(r, id)}</li>
            ))}
          </ul>
        ) : null}
      </details>
    ) : null;

  return (
    <section className={styles.section} aria-labelledby="world-brief-title" data-testid="world-brief">
      <h3 id="world-brief-title">{t("world.simple.title")}</h3>

      <div className={styles.signals} data-testid="world-signals">
        <div data-testid="world-signals-good">
          <h4>
            <span aria-hidden="true">👍 </span>
            {t("world.simple.good")}
          </h4>
          {sig.good.length ? <ul className={styles.signalList}>{sig.good.map((s) => signalCard(s, "good"))}</ul> : <p className={styles.muted}>{t("world.simple.noneYet")}</p>}
        </div>
        <div data-testid="world-signals-slow">
          <h4>
            <span aria-hidden="true">✋ </span>
            {t("world.simple.slow")}
          </h4>
          {sig.slow.length ? <ul className={styles.signalList}>{sig.slow.map((s) => signalCard(s, "slow"))}</ul> : <p className={styles.muted}>{t("world.simple.noneYet")}</p>}
        </div>
      </div>

      {split ? (
        <div data-testid="world-brief-markets" className={styles.markets}>
          <h4>{t("world.simple.marketsTitle")}</h4>
          <p className={styles.bigLine}>{t(week ? "world.simple.topShareWeek" : "world.simple.topShareMonth", { share: pct0(split.t1) })}</p>
          <div className={styles.tierBar} role="img" aria-label={t("world.brief.tierAria", { t1: pct0(split.t1), t2: pct0(split.t2), t3: pct0(split.t3) })}>
            {([1, 2, 3] as const).map((k) => {
              const v = k === 1 ? split.t1 : k === 2 ? split.t2 : split.t3;
              return v > 0 ? <span key={k} data-tier={k} style={{ width: `${v * 100}%` }} /> : null;
            })}
          </div>
          <ul className={styles.legend} data-testid="world-brief-legend">
            {([1, 2, 3] as const).map((k) => (
              <li key={k}>
                <span className={styles.swatchDot} data-tier={k} aria-hidden="true" />
                <span>
                  <b>{t(`world.simple.tier${k}`)}</b> {pct0(k === 1 ? split.t1 : k === 2 ? split.t2 : split.t3)}
                  <br />
                  <span className={styles.muted}>{t(`world.simple.tier${k}Desc`)}</span>
                </span>
              </li>
            ))}
          </ul>
          <details className={styles.why}>
            <summary>{t("world.simple.why")}</summary>
            {week && month ? <p>{t("world.simple.vsMonth", { week: pct0(week.t1), month: pct0(month.t1) })}</p> : null}
            {split.top1.length ? <p>{t("world.brief.top1", { list: split.top1.map((c) => `${c.key} ${pct0(c.share)}`).join(", ") })}</p> : null}
            <p className={styles.muted}>{t("world.simple.tierLists", { t1: TIER1.join(", "), n2: TIER2.length })}</p>
            <p className={styles.muted}>{t("world.brief.tierNote", { source: MARKET_SOURCE })}</p>
          </details>
        </div>
      ) : null}

      <div className={styles.claude}>
        <h4>{t("world.simple.claudeTitle")}</h4>
        <button type="button" className={styles.briefButton} onClick={() => void summarize()} disabled={b.state === "off" || req.state === "busy"} aria-busy={req.state === "busy"} data-testid="world-brief-button">
          {req.state === "busy" ? (
            t("world.brief.busy")
          ) : (
            <>
              <span aria-hidden="true">✨ </span>
              {t("world.brief.button")}
            </>
          )}
        </button>
        <p className={styles.muted} role="status" data-testid="world-brief-state" data-state={b.state === "off" ? "off" : req.state}>
          {b.state === "off"
            ? t("world.brief.off")
            : req.state === "failed"
              ? t("world.brief.failed", { reason: req.reason ?? "?" })
              : req.state === "busy"
                ? t("world.brief.busyNote")
                : b.state === "error"
                  ? t("world.brief.serverError", { reason: b.reason ?? "?" })
                  : ""}
        </p>

        {weekly && latest && weekly.at !== latest.at ? (
          <div role="group" aria-label={t("world.brief.which")} className={styles.segment}>
            <button type="button" aria-pressed={which === "latest"} onClick={() => setWhich("latest")}>
              {t("world.brief.latest")}
            </button>
            <button type="button" aria-pressed={which === "weekly"} onClick={() => setWhich("weekly")}>
              {t("world.brief.weekly", { week: weekly.week })}
            </button>
          </div>
        ) : null}

        {shown ? (
          <div className={styles.brief} data-testid="world-brief-body" data-kind={shown.kind}>
            {shown.brief.headline ? <p className={styles.briefHeadline}>{shown.brief.headline}</p> : null}
            <ul className={styles.briefPatterns}>
              {shown.brief.patterns.map((p, i) => (
                <li key={`${i}-${p.title}`} data-kind={p.kind} data-strength={p.strength}>
                  <span>
                    <span aria-hidden="true">{p.kind === "brand" ? "🤝 " : p.kind === "substack" ? "✉️ " : p.kind === "audience" ? "🌍 " : "📸 "}</span>
                    {p.strength === "weak" ? <span className={styles.muted}>{t("world.simple.tentative")} </span> : null}
                    <b>{p.title}</b> {p.text}
                  </span>
                  {why(
                    shown,
                    [...p.facts, ...p.counter_facts],
                    <p className={styles.muted}>
                      {t(`world.brief.kinds.${p.kind}`)} · {t(`world.brief.strength.${p.strength}`)}
                      {p.counter ? ` · ${t("world.brief.counter")} ${p.counter}` : ""}
                    </p>,
                  )}
                </li>
              ))}
              {shown.brief.brands ? (
                <li data-testid="world-brief-brands" data-kind="brand-summary">
                  <span>
                    <b>{t("world.brief.brands")}:</b> {shown.brief.brands.text}
                  </span>
                  {why(shown, shown.brief.brands.facts)}
                </li>
              ) : null}
              {shown.brief.substack ? (
                <li data-testid="world-brief-substack" data-kind="substack-summary">
                  <span>
                    <b>{t("world.brief.substack")}:</b> {shown.brief.substack.text}
                  </span>
                  {why(shown, shown.brief.substack.facts)}
                </li>
              ) : null}
              {shown.brief.next_test ? (
                <li data-kind="next">
                  <span>
                    <b>{t("world.brief.nextTest")}:</b> {shown.brief.next_test}
                  </span>
                </li>
              ) : null}
            </ul>
            <details className={styles.why}>
              <summary>{t("world.brief.limits")}</summary>
              <ul>
                {shown.brief.limits.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <p className={styles.muted}>
                {t(shown.kind === "weekly" ? "world.brief.metaWeekly" : "world.brief.meta", { time: ago(shown.at), model: shown.model, n: shown.facts.length, week: shown.week })}
                {shown.kind === "weekly" ? ` ${t(b.in_brain && b.weekly.de?.week === shown.week ? "world.brief.inBrain" : b.brain ? "world.brief.notYetInBrain" : "world.brief.noBrain")}` : ""}
                {shown.brief.dropped ? ` ${t("world.brief.dropped", { n: shown.brief.dropped })}` : ""}
              </p>
            </details>
          </div>
        ) : b.state !== "off" ? (
          <p className={styles.muted} data-testid="world-brief-none">{t(elsewhere ? "world.brief.noneInLocale" : "world.brief.none")}</p>
        ) : null}
      </div>
    </section>
  );
}
