import { TEAM, type PersonId } from "@/fixtures/team";
import styles from "./ui.module.css";

/** Initial + gradient; the name is always available to assistive tech (meaning never colour-only). */
export function Avatar({ person, size = 26, showName = false }: { person: PersonId; size?: number; showName?: boolean }) {
  const member = TEAM[person];
  return (
    <span className={styles.person}>
      <span
        className={`${styles.avatar} ${styles[`avatar_${person}`]}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        aria-hidden={showName ? true : undefined}
        role={showName ? undefined : "img"}
        aria-label={showName ? undefined : member.name}
      >
        {member.initial}
      </span>
      {showName ? <span className={styles.personName}>{member.name}</span> : null}
    </span>
  );
}
