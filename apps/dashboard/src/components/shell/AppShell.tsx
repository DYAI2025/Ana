"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { NavRail } from "./NavRail";
import { isEditableTarget, SearchPalette } from "./SearchPalette";
import { Topbar } from "./Topbar";
import styles from "./shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    // marks the client as interactive (used by automated journeys to avoid racing hydration)
    document.documentElement.dataset.ready = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      } else if (event.key === "/" && !isEditableTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <a href="#main" className={styles.skip}>
        {t("app.skipToContent")}
      </a>
      <NavRail />
      <div className={styles.workspace}>
        <div className={styles.workspaceInner}>
          <Topbar onOpenSearch={() => setSearchOpen(true)} />
          <main id="main" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={closeSearch} />
    </>
  );
}
