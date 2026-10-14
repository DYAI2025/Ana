"use client";

import { Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { formatDateTime } from "./format";
import type { Observation } from "./types";
import styles from "./social.module.css";

/** Everything a person needs to trust or doubt one number (brief §8 metric inspector). */
export interface InspectorSpec {
  label: string;
  native: string;
  unit: string;
  calculation: string;
  period: string;
  baseline: string;
  source: string;
  version: string;
  observedAt: string;
  availability: string;
}

const Ctx = createContext<{ open: (spec: InspectorSpec) => void } | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<InspectorSpec | null>(null);
  const close = useCallback(() => setSpec(null), []);
  const value = useMemo(() => ({ open: setSpec }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      {spec ? <InspectorDialog spec={spec} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

function InspectorDialog({ spec, onClose }: { spec: InspectorSpec; onClose: () => void }) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, true, onClose);
  const rows: Array<[string, string]> = [
    [t("social.inspector.provider"), "Instagram"],
    [t("social.inspector.native"), spec.native],
    [t("social.inspector.unit"), spec.unit],
    [t("social.inspector.calculation"), spec.calculation],
    [t("social.inspector.period"), spec.period],
    [t("social.inspector.baseline"), spec.baseline],
    [t("social.inspector.source"), spec.source],
    [t("social.inspector.version"), spec.version],
    [t("social.inspector.freshness"), formatDateTime(spec.observedAt, locale)],
    [t("social.inspector.availability"), spec.availability],
  ];
  return (
    <div className={styles.inspectorBackdrop} onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`glass ${styles.inspector}`} data-testid="metric-inspector" onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        <header className={styles.inspectorHead}>
          <div>
            <p className={styles.eyebrow}>{t("social.inspector.title")}</p>
            <h2 id={titleId} className={styles.inspectorTitle}>
              {spec.label}
            </h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("social.inspector.close")} data-autofocus>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <dl className={styles.inspectorList}>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.inspectorRow}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function InspectButton({ spec, testId }: { spec: InspectorSpec; testId?: string }) {
  const ctx = useContext(Ctx);
  const { t } = useI18n();
  return (
    <button type="button" className={styles.inspectButton} onClick={() => ctx?.open(spec)} aria-label={t("social.inspector.open", { metric: spec.label })} data-testid={testId}>
      <Info size={13} aria-hidden="true" />
    </button>
  );
}

/** Builds the inspector entry for a direct Instagram observation. */
export function useObservationSpec() {
  const { t } = useI18n();
  return useCallback(
    (o: Observation, label: string, baseline?: string): InspectorSpec => ({
      label,
      native: o.native_metric_name,
      unit: t(`social.inspector.units.${o.unit}`),
      calculation: t("social.inspector.direct"),
      period: t(`social.inspector.periods.${o.period}`),
      baseline: baseline ?? t("social.inspector.none"),
      source: o.source_reference,
      version: o.provider_api_version,
      observedAt: o.observed_at,
      availability: o.availability_reason ? `${t(`social.states.${o.availability_state}`)} (${o.availability_reason})` : t(`social.states.${o.availability_state}`),
    }),
    [t],
  );
}
