"use client";

import { History, MessageSquareOff, Users } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { formatDay, formatIndex } from "./format";
import { StateChip } from "./Instruments";
import { MATURE_AGE_DAYS, MIN_GROUP_N, type Analysis, type PostAnalysis } from "./insights";
import type { PostFormat } from "./types";
import styles from "./social.module.css";

export function StreamPanel() {
  const { t } = useI18n();
  return (
    <section className={`glass ${styles.panel} ${styles.colFull}`} aria-labelledby="stream-title" data-testid="stream" data-state="INSUFFICIENT_EVIDENCE">
      <div className={styles.panelHead}>
        <h2 id="stream-title" className={styles.panelTitle}>
          {t("social.stream.title")}
        </h2>
        <StateChip state="INSUFFICIENT_EVIDENCE" />
      </div>
      <div className={styles.capability}>
        <History size={20} aria-hidden="true" />
        <div>
          <p className={styles.capabilityTitle}>{t("social.stream.requirement")}</p>
          <p className={styles.muted}>{t("social.stream.body")}</p>
        </div>
      </div>
    </section>
  );
}

export function AudiencePanel() {
  const { t } = useI18n();
  return (
    <section className={`glass ${styles.panel} ${styles.colSide}`} aria-labelledby="audience-title" data-testid="audience" data-state="NOT_CONNECTED">
      <div className={styles.panelHead}>
        <h2 id="audience-title" className={styles.panelTitle}>
          {t("social.audience.title")}
        </h2>
        <StateChip state="NOT_CONNECTED" />
      </div>
      <div className={styles.capability}>
        <Users size={20} aria-hidden="true" />
        <p className={styles.muted}>{t("social.audience.body")}</p>
      </div>
    </section>
  );
}

export function CommentsPanel() {
  const { t } = useI18n();
  return (
    <section className={`glass ${styles.panel} ${styles.colSide}`} aria-labelledby="comments-title" data-testid="comments" data-state="UNSUPPORTED">
      <div className={styles.panelHead}>
        <h2 id="comments-title" className={styles.panelTitle}>
          {t("social.comments.title")}
        </h2>
        <StateChip state="UNSUPPORTED" />
      </div>
      <div className={styles.capability}>
        <MessageSquareOff size={20} aria-hidden="true" />
        <p className={styles.muted}>{t("social.comments.body")}</p>
      </div>
    </section>
  );
}

const W = 600;
const H = 360;
const PAD = { l: 52, r: 18, t: 18, b: 44 };

export function Glyph({ format, x, y, size }: { format: PostFormat; x: number; y: number; size: number }) {
  if (format === "reel") return <polygon points={`${x},${y - size} ${x + size},${y + size * 0.8} ${x - size},${y + size * 0.8}`} className={styles.glyphReel} />;
  if (format === "carousel") return <polygon points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`} className={styles.glyphCarousel} />;
  return <rect x={x - size * 0.8} y={y - size * 0.8} width={size * 1.6} height={size * 1.6} className={styles.glyphImage} />;
}

export function ContentMap({ analysis, format, onFormat, onSelect, selectedId }: { analysis: Analysis; format: PostFormat | null; onFormat: (f: PostFormat) => void; onSelect: (id: string) => void; selectedId: string | null }) {
  const { t, locale } = useI18n();
  const eligible = analysis.groups.filter((g) => g.n >= MIN_GROUP_N);
  const group = eligible.find((g) => g.format === format) ?? eligible.sort((a, b) => b.n - a.n)[0];
  const points = group ? analysis.posts.filter((p) => p.post.format === group.format && p.reachIndex !== null && p.highIntentIndex !== null) : [];
  const maxX = Math.max(2.5, ...points.map((p) => p.reachIndex! * 1.08));
  const maxY = Math.max(2.5, ...points.map((p) => p.highIntentIndex! * 1.08));
  const sx = (v: number) => PAD.l + (v / maxX) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b);
  const maxReach = Math.max(...points.map((p) => p.reach ?? 0), 1);
  const label = (p: PostAnalysis) =>
    t("social.map.point", {
      format: t(`social.formats.${p.post.format}`),
      date: p.post.published_at ? formatDay(p.post.published_at, locale) : "—",
      x: formatIndex(p.reachIndex!, locale),
      y: formatIndex(p.highIntentIndex!, locale),
    });
  const ranked = [...points].sort((a, b) => b.reachIndex! - a.reachIndex!);
  return (
    <section className={`glass ${styles.panel} ${styles.colMain}`} aria-labelledby="map-title" data-testid="content-map" data-state={group ? "CONNECTED" : "INSUFFICIENT_EVIDENCE"}>
      <div className={styles.panelHead}>
        <h2 id="map-title" className={styles.panelTitle}>
          {t("social.map.title")}
        </h2>
        {eligible.length > 1 ? (
          <div className={styles.seg} role="group" aria-label={t("social.map.formatFilter")}>
            {eligible.map((g) => (
              <button key={g.format} type="button" aria-pressed={g.format === group?.format} onClick={() => onFormat(g.format)} className={styles.segButton}>
                {t(`social.formats.${g.format}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!group ? (
        <>
          <StateChip state="INSUFFICIENT_EVIDENCE" />
          <p className={styles.muted}>{t("social.map.insufficient", { n: Math.max(0, ...analysis.groups.map((g) => g.n)), min: MIN_GROUP_N })}</p>
        </>
      ) : (
        <>
          <p className={styles.muted}>{t("social.map.note", { format: t(`social.formats.${group.format}`), days: MATURE_AGE_DAYS, n: points.length })}</p>
          <svg className={styles.mapSvg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("social.map.title")}>
            <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className={styles.axis} />
            <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className={styles.axis} />
            <line x1={sx(1)} y1={PAD.t} x2={sx(1)} y2={H - PAD.b} className={styles.crosshair} />
            <line x1={PAD.l} y1={sy(1)} x2={W - PAD.r} y2={sy(1)} className={styles.crosshair} />
            <text x={PAD.l + 6} y={PAD.t + 12} className={styles.quadrant}>
              {t("social.map.nicheResonant")}
            </text>
            <text x={W - PAD.r - 6} y={PAD.t + 12} textAnchor="end" className={styles.quadrant}>
              {t("social.map.broadResonant")}
            </text>
            <text x={PAD.l + 6} y={H - PAD.b - 8} className={styles.quadrant}>
              {t("social.map.below")}
            </text>
            <text x={W - PAD.r - 6} y={H - PAD.b - 8} textAnchor="end" className={styles.quadrant}>
              {t("social.map.broadPassive")}
            </text>
            <text x={(W + PAD.l) / 2} y={H - 10} textAnchor="middle" className={styles.axisLabel}>
              {t("social.map.x")}
            </text>
            <text x={14} y={(H - PAD.b + PAD.t) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(H - PAD.b + PAD.t) / 2})`} className={styles.axisLabel}>
              {t("social.map.y")}
            </text>
            <text x={sx(1)} y={H - PAD.b + 14} textAnchor="middle" className={styles.gaugeTick}>
              {formatIndex(1, locale)}
            </text>
            {points.map((p) => (
              <g
                key={p.post.media_id}
                tabIndex={0}
                role="button"
                aria-label={label(p)}
                aria-pressed={selectedId === p.post.media_id}
                className={styles.point}
                data-testid="map-point"
                onClick={() => onSelect(p.post.media_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p.post.media_id);
                  }
                }}
              >
                <title>{label(p)}</title>
                <Glyph format={p.post.format} x={sx(p.reachIndex!)} y={sy(p.highIntentIndex!)} size={4 + 6 * Math.sqrt((p.reach ?? 0) / maxReach)} />
              </g>
            ))}
          </svg>
          <ol className={styles.ranked} aria-label={t("social.map.ranked")}>
            {ranked.map((p) => (
              <li key={p.post.media_id}>
                <button type="button" className={styles.rankedButton} onClick={() => onSelect(p.post.media_id)}>
                  <span>{p.post.published_at ? formatDay(p.post.published_at, locale) : "—"}</span>
                  <span className={styles.mono}>{formatIndex(p.reachIndex!, locale)}</span>
                  <span className={styles.rankBar} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (p.reachIndex! / maxX) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
