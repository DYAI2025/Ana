"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/providers/I18nProvider";
import { activeViewFor, PRIMARY_VIEWS, VIEW_HREF } from "@/lib/views";
import { VIEW_ICONS } from "./icons";
import styles from "./shell.module.css";

export function NavRail() {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = activeViewFor(pathname);
  // WCAG 1.4.13: Escape hides the hover/focus labels until the pointer or focus leaves the rail
  const [tipsOff, setTipsOff] = useState(false);

  return (
    <nav
      className={styles.rail}
      aria-label={t("nav.label")}
      data-tips={tipsOff ? "off" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTipsOff(true);
      }}
      onMouseLeave={() => setTipsOff(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTipsOff(false);
      }}
    >
      <Link href="/" className={styles.mark} aria-label={`${t("app.title")} — ${t("nav.now")}`}>
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <path d="M7 25 15.5 6h1L25 25" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 18.5h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="25.5" cy="7" r="2.4" className={styles.markDot} />
        </svg>
      </Link>
      <span className={styles.divider} aria-hidden="true" />
      <ul className={styles.railList}>
        {PRIMARY_VIEWS.map((view) => {
          const Icon = VIEW_ICONS[view];
          const label = t(`nav.${view}`);
          const current = active === view;
          return (
            <li key={view}>
              <Link
                href={VIEW_HREF[view]}
                className={styles.navItem}
                aria-current={current ? "page" : undefined}
                aria-label={label}
                data-label={label}
                data-testid={`nav-${view}`}
              >
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
