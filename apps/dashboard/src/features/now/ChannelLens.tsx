"use client";

import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { StateChip } from "@/features/social/Instruments";
import { isConnected } from "@/features/social/state";
import type { CockpitState } from "@/features/social/types";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { CHANNELS } from "./tiles";
import styles from "./lens.module.css";

const CLOSE_MS = 280;

/**
 * Social Media Business channel picker (ANA-42 UI-02, SOLL B). A glass overlay listing the five channels in
 * the decided order; only Instagram is integrated and routes to the existing cockpit, the others are honest
 * Under Construction rows without any action. Modal ownership (focus trap, Escape, focus return) lasts for the
 * whole mounted lifetime, exactly like the earlier context lens (ANA-19).
 */
export function ChannelLens({ open, instagram, onClose }: { open: boolean; instagram: CockpitState; onClose: () => void }) {
  const { t } = useI18n();
  const [closing, setClosing] = useState(false);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return; // already closing: no second timer, no second cleanup
    if (reduced) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      onClose();
    }, CLOSE_MS);
  }, [onClose, reduced]);

  // leaving the page mid-animation must not fire a stale close later
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  useFocusTrap(panel, open, requestClose);

  if (!open) return null;

  return (
    <div className={styles.layer} data-state={closing ? "closing" : "open"}>
      <div className={styles.backdrop} onClick={requestClose} aria-hidden="true" />
      <aside
        ref={panel}
        className={`glass ${styles.lens}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        data-testid="channel-lens"
        data-lens="social"
      >
        <span className={styles.sweep} aria-hidden="true" />
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>
              {t("now.channels.title")}
            </h2>
            <p id={subtitleId} className={styles.subtitle}>
              {t("now.channels.subtitle")}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={requestClose} aria-label={t("common.close")} data-testid="lens-close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <ul className={styles.channels}>
          {CHANNELS.map((channel) =>
            channel.href ? (
              <li key={channel.id}>
                <Link
                  href={channel.href}
                  className={`${styles.channel} ${styles.channelActive}`}
                  data-autofocus
                  data-testid={`channel-${channel.id}`}
                  data-instagram={instagram}
                  aria-label={`${channel.label}: ${t(`social.states.${instagram}`)}. ${t("now.channels.instagramAction")}`}
                >
                  <span className={`metal ${styles.monogram}`} aria-hidden="true">
                    {channel.monogram}
                  </span>
                  <span className={styles.channelMain}>
                    <span className={styles.channelName}>{channel.label}</span>
                    <span className={styles.channelMeta}>{t("now.channels.instagramAction")}</span>
                  </span>
                  <StateChip state={instagram} />
                  <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" className={styles.channelChevron} />
                </Link>
              </li>
            ) : (
              <li key={channel.id} className={`${styles.channel} ${styles.channelDimmed}`} data-testid={`channel-${channel.id}`} data-state="under-construction">
                <span className={`metal ${styles.monogram}`} aria-hidden="true">
                  {channel.monogram}
                </span>
                <span className={styles.channelMain}>
                  <span className={styles.channelName}>{channel.label}</span>
                  <span className={styles.channelMeta}>{t("now.underConstruction")}</span>
                </span>
              </li>
            ),
          )}
        </ul>
        <p className={styles.note} data-testid="channel-note" data-instagram={instagram}>
          {/* "live" is said only while the adapter is verified connected; otherwise the note names the real state */}
          {isConnected(instagram) ? t("now.channels.note") : t("now.channels.noteDown", { state: t(`social.states.${instagram}`) })}{" "}
          <code className={styles.route}>{CHANNELS[0].href}</code>
        </p>
      </aside>
    </div>
  );
}
