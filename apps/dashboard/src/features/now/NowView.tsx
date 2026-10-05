"use client";

import { ArrowRight, BookOpenText, BriefcaseBusiness, Columns3, Users, Video, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties, type PointerEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { FOCUS, RECENT_KNOWLEDGE, STAGES } from "@/fixtures/connections";
import { getSession, LAST_SESSION_ID } from "@/fixtures/sessions";
import { formatDate } from "@/lib/format";
import { workCounts } from "@/features/work/model";
import { useWork } from "@/features/work/WorkProvider";
import { ContextLens, type LensId } from "./ContextLens";
import styles from "./now.module.css";

interface ContextObject {
  id: LensId;
  icon: LucideIcon;
  title: string;
  status: string;
  subtitle?: string;
  tier: "primary" | "secondary";
}

/** Pointer-following specular highlight on glass (purely decorative). */
function trackPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

export function NowView() {
  const { t, text, locale } = useI18n();
  const { state: work } = useWork();
  const [lens, setLens] = useState<LensId | null>(null);

  // work counts come from a current Jira read; while Jira is not readable (or the read is stale) they are unknown
  const counts = work.phase === "ready" ? workCounts(work.snapshot) : null;
  const session = getSession(LAST_SESSION_ID)!;
  const activeStage = STAGES.indexOf(FOCUS.stage);

  const objects: ContextObject[] = [
    {
      id: "session",
      icon: Video,
      title: t("now.lastSession"),
      status: `${formatDate(session.date!, locale)} · ${session.start}`,
      subtitle: text(session.title),
      tier: "primary",
    },
    {
      id: "work",
      icon: Columns3,
      title: t("now.work"),
      status: counts ? t("now.workStatus", { active: counts.active, review: counts.review }) : t("now.workStatusUnknown"),
      tier: "primary",
    },
    { id: "business", icon: BriefcaseBusiness, title: t("now.business"), status: t("now.businessStatus"), tier: "secondary" },
    { id: "knowledge", icon: BookOpenText, title: t("now.knowledge"), status: t("now.knowledgeStatus", { count: RECENT_KNOWLEDGE.length }), tier: "secondary" },
    { id: "community", icon: Users, title: t("now.community"), status: t("now.communityStatus"), tier: "secondary" },
  ];

  return (
    <div className={styles.now} data-lens-open={lens ? "true" : undefined}>
      <section className={styles.focus} aria-labelledby="focus-statement">
        <p className={`eyebrow ${styles.focusEyebrow}`}>
          <span className={styles.focusMarker} aria-hidden="true" />
          {t("now.eyebrow")}
        </p>
        <h1 id="focus-statement" className={styles.statement} data-testid="focus-statement">
          {text(FOCUS.statement)}
        </h1>
        <p className={styles.subline}>{t("now.subline")}</p>
        <ol className={styles.stages} aria-label={t("now.stagesLabel")}>
          {STAGES.map((stage, index) => (
            <li
              key={stage}
              className={styles.stage}
              data-state={index < activeStage ? "past" : index === activeStage ? "current" : "future"}
              aria-current={index === activeStage ? "step" : undefined}
            >
              <span className={styles.stageDot} aria-hidden="true" />
              {t(`now.stages.${stage}`)}
              {index === activeStage ? <span className="visually-hidden"> ({t("now.stageCurrent")})</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.stage3d} aria-label={t("now.contextLabel")}>
        {objects.map((object) => {
          const Icon = object.icon;
          return (
            <button
              key={object.id}
              type="button"
              className={`glass ${styles.object} ${styles[`object_${object.id}`]}`}
              data-tier={object.tier}
              data-selected={lens === object.id ? "true" : undefined}
              aria-haspopup="dialog"
              aria-expanded={lens === object.id}
              aria-label={`${object.title}: ${object.status}${object.subtitle ? `, ${object.subtitle}` : ""}. ${t("now.openLens", { name: object.title })}`}
              onClick={() => setLens(object.id)}
              onPointerMove={trackPointer}
              data-testid={`context-${object.id}`}
              style={{ "--pointer-x": "22%", "--pointer-y": "18%" } as CSSProperties}
            >
              <span className={styles.objectHead}>
                <span className={styles.glyph} aria-hidden="true">
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <span className={styles.objectTitle}>{object.title}</span>
              </span>
              <span className={styles.objectStatus}>
                {object.id === "work" && work.phase === "ready" ? <span className={styles.liveDot} aria-hidden="true" /> : null}
                {object.status}
              </span>
              {object.subtitle ? <span className={styles.objectSubtitle}>{object.subtitle}</span> : null}
              <span className={styles.objectAction} aria-hidden="true">
                {t("common.open")} <ArrowRight size={12} />
              </span>
            </button>
          );
        })}
      </section>

      <p className={styles.statusRail}>
        <span>{t("now.statusPeople")}</span>
        <span className={styles.statusSep} aria-hidden="true" />
        <span>{counts ? t("now.statusTasks", { count: counts.active }) : t("now.statusTasksUnknown")}</span>
        <span className={styles.statusSep} aria-hidden="true" />
        <span>{t("now.statusFocus")}</span>
      </p>

      <ContextLens lens={lens} onClose={() => setLens(null)} />
    </div>
  );
}
