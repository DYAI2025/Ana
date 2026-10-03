import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {eyebrow}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}
