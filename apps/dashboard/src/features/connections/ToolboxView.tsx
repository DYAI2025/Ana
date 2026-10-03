"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { TOOLS } from "@/fixtures/connections";
import styles from "./connections.module.css";

export function ToolboxView({ highlight }: { highlight?: string }) {
  const { t, text } = useI18n();
  const { notify } = useToast();
  const [open, setOpen] = useState<string | null>(highlight ?? null);
  return (
    <div className={styles.page}>
      <PageHeader title={t("toolbox.title")} subtitle={t("toolbox.subtitle")} />
      <ul className={styles.tools}>
        {TOOLS.map((tool) => {
          const expanded = open === tool.id;
          return (
            <li key={tool.id} className={`glass ${styles.tool}`} data-highlight={highlight === tool.id ? "true" : undefined} data-testid={`tool-${tool.id}`}>
              <div className={styles.toolHead}>
                <h2 className={styles.toolName}>{tool.name}</h2>
                <StatusChip tone="not-connected">{t("toolbox.linkMissing")}</StatusChip>
              </div>
              <p className={styles.toolPurpose}>{text(tool.purpose)}</p>
              {expanded ? (
                <p id={`how-${tool.id}`} className={styles.toolHow}>
                  {text(tool.howTo)}
                </p>
              ) : null}
              <div className={styles.toolActions}>
                <Button variant="quiet" aria-expanded={expanded} aria-controls={`how-${tool.id}`} onClick={() => setOpen(expanded ? null : tool.id)} trailingIcon={<ChevronDown size={14} aria-hidden="true" className={expanded ? styles.flip : undefined} />}>
                  {t("toolbox.howTo")}
                </Button>
                <Button variant="secondary" aria-disabled="true" onClick={() => notify(t("toolbox.linkMissingToast"))} trailingIcon={<ExternalLink size={14} aria-hidden="true" />}>
                  {t("common.open")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
