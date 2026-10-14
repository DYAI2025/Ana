"use client";

import { AlertTriangle, ChevronRight, Camera, RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { fetchInstagram } from "./api";
import { ContentRows } from "./ContentRows";
import { formatDateTime } from "./format";
import { InspectorProvider } from "./Inspector";
import { analyze, heroReading, type ThemeId, type ThemeOf } from "./insights";
import { HeroInstrument, MetricCluster, StateChip } from "./Instruments";
import { AudiencePanel, CommentsPanel, ContentMap, StreamPanel } from "./Panels";
import { PatternsPanel } from "./Patterns";
import { assignTheme, type ThemeOverrides } from "./themes";
import type { CockpitState, PostFormat, SocialResult, SocialSnapshot } from "./types";
import styles from "./social.module.css";

export function InstagramCockpit() {
  const { t, locale } = useI18n();
  const [result, setResult] = useState<SocialResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setRefreshing(true);
    const next = await fetchInstagram(refresh);
    setResult(next);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInstagram(false).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const state: CockpitState = result === null ? "LOADING" : !result.ok ? (result.failure.state === "PERMISSION_REQUIRED" ? "PERMISSION_REQUIRED" : "ERROR") : result.stale ? "STALE" : result.snapshot.posts.length === 0 ? "EMPTY" : "CONNECTED";
  const snapshot = result?.ok ? result.snapshot : null;

  return (
    <InspectorProvider>
      <div className={styles.page} data-testid="instagram-cockpit" data-state={state}>
        <header className={styles.head}>
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            <Link href="/pulse">{t("social.crumbPulse")}</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{t("social.crumbSocial")}</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">{t("social.title")}</span>
          </nav>
          <div className={styles.headRow}>
            <div className={styles.headTitle}>
              <span className={styles.platform} aria-hidden="true">
                <Camera size={20} />
              </span>
              <div>
                <h1 className="page-title">{t("social.title")}</h1>
                <p className={styles.handle}>{snapshot?.handle ? t("social.handle", { handle: snapshot.handle }) : t("social.subtitle")}</p>
              </div>
              <StateChip state={state} />
            </div>
            <div className={styles.headRight}>
              {snapshot ? (
                <span className={styles.muted} data-testid="last-verified">
                  {t("social.lastVerified", { time: formatDateTime(snapshot.observed_at, locale) })}
                </span>
              ) : null}
              <Button variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" className={refreshing ? styles.spin : undefined} />} onClick={() => load(true)} disabled={refreshing || result === null} title={t("social.refreshNote")} data-testid="refresh">
                {refreshing ? t("social.refreshing") : t("social.refresh")}
              </Button>
            </div>
          </div>
        </header>

        {state === "LOADING" ? <Loading /> : null}
        {result && !result.ok ? <Failure code={result.failure.code} permission={result.failure.state === "PERMISSION_REQUIRED"} onRetry={() => load(true)} /> : null}
        {snapshot && result?.ok ? <Loaded snapshot={snapshot} stale={result.stale} /> : null}
      </div>
    </InspectorProvider>
  );
}

function Loading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className={styles.loading} data-testid="cockpit-loading">
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <p className={styles.muted}>{t("social.loadingBody")}</p>
    </div>
  );
}

function Failure({ code, permission, onRetry }: { code: string; permission: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <section role="alert" className={`glass ${styles.panel} ${styles.failure}`} data-testid="cockpit-failure" data-code={code}>
      {permission ? <ShieldAlert size={22} aria-hidden="true" /> : <AlertTriangle size={22} aria-hidden="true" />}
      <div>
        <h2 className={styles.panelTitle}>{t("social.failureTitle")}</h2>
        <p>{t(`social.failures.${code as "auth"}`)}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        {t("social.retry")}
      </Button>
    </section>
  );
}

function Coverage({ snapshot }: { snapshot: SocialSnapshot }) {
  const { t } = useI18n();
  const c = snapshot.coverage;
  return (
    <section className={styles.coverage} aria-label={t("social.coverage.label")} data-testid="coverage">
      <span data-testid="coverage-retrieved">
        {c.total_available !== null ? t("social.coverage.retrieved", { retrieved: c.retrieved, total: c.total_available }) : t("social.coverage.retrievedUnknown", { retrieved: c.retrieved })}
      </span>
      <span data-testid="coverage-paging">{c.has_more ? t("social.coverage.more") : t("social.coverage.complete")}</span>
      <span data-testid="coverage-insights">{t("social.coverage.insights", { n: c.posts_with_insights, m: c.posts_without_insights, used: c.budget_used, limit: c.budget_limit })}</span>
      {c.optional_fields === "REJECTED_BY_META" ? <span>{t("social.coverage.optionalRejected")}</span> : null}
      <span>{t("social.coverage.snapshot")}</span>
    </section>
  );
}

function Loaded({ snapshot, stale }: { snapshot: SocialSnapshot; stale: boolean }) {
  const { t, locale } = useI18n();
  const [overrides, setOverrides] = useState<ThemeOverrides>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [mapFormat, setMapFormat] = useState<PostFormat | null>(null);
  const analysis = useMemo(() => analyze(snapshot), [snapshot]);
  const hero = useMemo(() => heroReading(analysis), [analysis]);
  const themeOf: ThemeOf = useCallback((post) => assignTheme(post, overrides).themes, [overrides]);
  const onOverride = useCallback((id: string, themes: readonly ThemeId[] | null) => setOverrides((o) => ({ ...o, [id]: themes ?? [] })), []);

  return (
    <>
      <Coverage snapshot={snapshot} />
      {stale ? (
        <div role="status" className={styles.staleBanner} data-testid="stale-banner">
          <strong>{t("social.staleTitle")}</strong> {t("social.staleBody", { time: formatDateTime(snapshot.observed_at, locale) })}
        </div>
      ) : null}
      {snapshot.posts.length === 0 ? (
        <section className={`glass ${styles.panel}`} data-testid="cockpit-empty">
          <h2 className={styles.panelTitle}>{t("social.emptyTitle")}</h2>
          <p className={styles.muted}>{t("social.emptyBody")}</p>
        </section>
      ) : (
        <div className={styles.cockpit}>
          <HeroInstrument hero={hero} snapshot={snapshot} />
          <MetricCluster snapshot={snapshot} analysis={analysis} />
          <StreamPanel />
          <ContentMap analysis={analysis} format={mapFormat} onFormat={setMapFormat} onSelect={setOpenId} selectedId={openId} />
          <AudiencePanel />
          <ContentRows snapshot={snapshot} analysis={analysis} overrides={overrides} onOverride={onOverride} openId={openId} onOpen={setOpenId} />
          <PatternsPanel analysis={analysis} themeOf={themeOf} onSelect={setOpenId} />
          <CommentsPanel />
        </div>
      )}
    </>
  );
}
