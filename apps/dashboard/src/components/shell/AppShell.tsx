"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { NavRail } from "./NavRail";
import { isEditableTarget, SearchPalette } from "./SearchPalette";
import { Topbar } from "./Topbar";
import styles from "./shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  // a fresh palette per opening: query and selection never leak from a previous search
  const [searchSession, setSearchSession] = useState(0);
  const openRef = useRef(searchOpen);
  useEffect(() => {
    openRef.current = searchOpen;
  }, [searchOpen]);
  const openSearch = useCallback(() => {
    setSearchSession((n) => n + 1);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    // marks the client as interactive (used by automated journeys to avoid racing hydration)
    document.documentElement.dataset.ready = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (openRef.current) setSearchOpen(false);
        else openSearch();
      } else if (event.key === "/" && !isEditableTarget(event.target)) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

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
          <Topbar onOpenSearch={openSearch} />
          <main id="main" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <SearchPalette key={searchSession} open={searchOpen} onClose={closeSearch} />
    </>
  );
}
