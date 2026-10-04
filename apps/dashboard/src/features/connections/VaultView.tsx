"use client";

import { FolderPlus } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import styles from "./connections.module.css";

const SHELVES = ["working", "media", "source"] as const;

export function VaultView() {
  const { t } = useI18n();
  const { notify } = useToast();
  return (
    <div className={styles.page}>
      <PageHeader title={t("vault.title")} subtitle={t("vault.subtitle")} />
      <section className={`glass ${styles.empty}`} data-testid="vault-empty">
        <span className={styles.emptyIcon} aria-hidden="true">
          <FolderPlus size={22} />
        </span>
        <div className={styles.emptyCopy}>
          <h2 className={styles.emptyTitle}>{t("vault.emptyTitle")}</h2>
          <p className={styles.emptyBody}>{t("vault.emptyBody")}</p>
          <StatusChip tone="not-connected">{t("common.notConnected")}</StatusChip>
        </div>
        <Button variant="primary" icon={<FolderPlus size={16} aria-hidden="true" />} onClick={() => notify(t("toast.connectLater"))}>
          {t("vault.addFolder")}
        </Button>
      </section>
      <ul className={styles.shelves}>
        {SHELVES.map((shelf) => (
          <li key={shelf} className={styles.shelf}>
            <h2 className={styles.shelfTitle}>{t(`vault.shelves.${shelf}`)}</h2>
            <div className={styles.slots} aria-hidden="true">
              <span className={styles.slot} />
              <span className={styles.slot} />
              <span className={styles.slot} />
            </div>
            <span className={styles.slotLabel}>{t("vault.exampleSlot")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
