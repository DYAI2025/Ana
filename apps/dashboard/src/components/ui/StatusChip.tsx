import { CircleDashed, FlaskConical, HardDrive } from "lucide-react";
import styles from "./ui.module.css";

type Tone = "not-connected" | "prototype" | "local";

const ICONS = { "not-connected": CircleDashed, prototype: FlaskConical, local: HardDrive } as const;

/** Status is carried by icon + text, never colour alone. */
export function StatusChip({ tone, children }: { tone: Tone; children: string }) {
  const Icon = ICONS[tone];
  return (
    <span className={`${styles.chip} ${styles[`chip_${tone.replace("-", "_")}`]}`} data-status={tone}>
      <Icon size={13} aria-hidden="true" strokeWidth={2} />
      {children}
    </span>
  );
}
