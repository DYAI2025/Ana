"use client";

import { BookOpenText, ChevronRight, Flag, Share2, Users, Video, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties, type PointerEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { StateChip } from "@/features/social/Instruments";
import { useInstagramState } from "@/features/social/useInstagramState";
import { ChannelLens } from "./ChannelLens";
import { CHANNELS, HOME_TILES, type TileId } from "./tiles";
import styles from "./now.module.css";

const ICONS: Record<TileId, LucideIcon> = {
  social: Share2,
  initiatives: Flag,
  sessions: Video,
  knowledge: BookOpenText,
  community: Users,
};

const OTHER_CHANNELS = CHANNELS.slice(1).map((channel) => channel.label);

/** Pointer-following specular highlight on glass (purely decorative). */
function trackPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

/**
 * ASADA home (ANA-42): the product name as the only heading, then five stacked glass tiles in the decided
 * order. Social Media Business is the single integrated tile; its Instagram state comes from one real read
 * of the Social API. Every other tile is honestly Under Construction: dimmed, no action, no invented data.
 */
export function NowView() {
  const { t } = useI18n();
  const { state: instagram } = useInstagramState();
  const instagramLabel = t(`social.states.${instagram}`);
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.now} data-lens-open={open ? "true" : undefined}>
      <header className={styles.hero}>
        <h1 id="asada-title" className={styles.title} data-testid="asada-title">
          ASADA
        </h1>
      </header>

      <section className={styles.stack} aria-labelledby="asada-title">
        {HOME_TILES.map((tile) => {
          const Icon = ICONS[tile.id];
          const title = t(`now.tiles.${tile.id}`);
          if (tile.active) {
            return (
              <button
                key={tile.id}
                type="button"
                className={`glass ${styles.object} ${styles.objectActive}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`${title}: ${t("now.socialState", { state: instagramLabel })}. ${t("now.openSocial")}`}
                onClick={() => setOpen(true)}
                onPointerMove={trackPointer}
                data-selected={open ? "true" : undefined}
                data-testid={`context-${tile.id}`}
                data-instagram={instagram}
                style={{ "--pointer-x": "22%", "--pointer-y": "18%" } as CSSProperties}
              >
                <span className={`metal ${styles.glyph}`} aria-hidden="true">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className={styles.objectTitle}>{title}</span>
                <span className={styles.objectChip}>
                  <StateChip state={instagram} />
                </span>
                <span className={styles.objectBody}>
                  <span className={styles.objectStatus}>{t("now.socialState", { state: instagramLabel })}</span>
                  <span className={styles.objectSubtitle}>
                    {OTHER_CHANNELS.join(" · ")} · {t("now.underConstruction")}
                  </span>
                </span>
                <span className={styles.objectAction} aria-hidden="true">
                  <ChevronRight size={18} strokeWidth={1.8} />
                </span>
              </button>
            );
          }
          return (
            <div
              key={tile.id}
              className={`glass ${styles.object} ${styles.objectDimmed}`}
              role="group"
              aria-label={`${title}: ${t("now.underConstruction")}`}
              data-testid={`context-${tile.id}`}
              data-state="under-construction"
            >
              <span className={`metal ${styles.glyph}`} aria-hidden="true">
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <span className={styles.objectTitle}>{title}</span>
              <span className={`${styles.objectChip} ${styles.ucChip}`}>{t("now.underConstruction")}</span>
              <span className={styles.objectBody}>
                <span className={styles.objectStatus}>{tile.id === "initiatives" ? t("now.initiativesDetail") : t("now.underConstructionDetail")}</span>
              </span>
            </div>
          );
        })}
      </section>

      <p className={styles.team}>{t("now.team")}</p>

      <ChannelLens open={open} instagram={instagram} onClose={() => setOpen(false)} />
    </div>
  );
}
