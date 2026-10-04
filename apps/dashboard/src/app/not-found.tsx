"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useI18n } from "@/components/providers/I18nProvider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <section style={{ margin: "18vh auto 0", textAlign: "center", display: "grid", gap: 20, justifyItems: "center" }}>
      <h1 className="page-title">{t("notFound.title")}</h1>
      <ButtonLink href="/" variant="primary">
        {t("notFound.back")}
      </ButtonLink>
    </section>
  );
}
