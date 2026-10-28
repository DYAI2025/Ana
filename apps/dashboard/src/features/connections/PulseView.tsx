"use client";

import { ArrowRight, FolderOpen, Inbox, Camera, ShoppingBag, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { SOURCE_GROUPS, type SourceGroup } from "@/fixtures/connections";
import styles from "./connections.module.css";

const ICONS: Readonly<Record<SourceGroup["id"], LucideIcon>> = { community: Users, sales: ShoppingBag, inbox: Inbox, drive: FolderOpen };

export function PulseView() {
  const { t, text } = useI18n();
  const { notify } = useToast();
  return (
    <div className={styles.page}>
      <PageHeader title={t("pulse.title")} subtitle={t("pulse.subtitle")} />
      <p className={styles.notice} data-testid="pulse-no-metrics">
        {t("pulse.noMetrics")}
      </p>
      <section className={`glass ${styles.social}`} data-testid="pulse-social" aria-labelledby="pulse-social-title">
        <span className={styles.railIcon} aria-hidden="true">
          <Camera size={18} />
        </span>
        <div className={styles.railMain}>
          <h2 id="pulse-social-title" className={styles.railTitle}>
            {t("pulse.socialTitle")}
          </h2>
          <p className={styles.socialBody}>{t("pulse.socialBody")}</p>
        </div>
        <ButtonLink href="/pulse/social/instagram" variant="primary" trailingIcon={<ArrowRight size={15} aria-hidden="true" />} data-testid="pulse-social-link">
          {t("pulse.socialLink")}
        </ButtonLink>
      </section>
      <ul className={styles.rails}>
        {SOURCE_GROUPS.map((group) => {
          const Icon = ICONS[group.id];
          return (
            <li key={group.id} className={`glass ${styles.rail}`} data-testid={`pulse-${group.id}`} data-state={group.state}>
              <span className={styles.railIcon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div className={styles.railMain}>
                <h2 className={styles.railTitle}>{t(`pulse.${group.id}`)}</h2>
                <StatusChip tone="not-connected">{t("common.notConnected")}</StatusChip>
              </div>
              <ul className={styles.sources} aria-label={t(`pulse.${group.id}`)}>
                {group.sources.map((source) => (
                  <li key={typeof source === "string" ? source : source.en} className={styles.source}>
                    {text(source)}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" onClick={() => notify(t("toast.connectLater"))}>
                {t("pulse.connect")}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className={styles.footer}>{t("pulse.footer")}</p>
    </div>
  );
}
