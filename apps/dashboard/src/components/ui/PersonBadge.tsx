import styles from "./ui.module.css";

const PALETTE = ["avatar_ana", "avatar_ben", "avatar_vince"] as const;

export function initialsOf(displayName: string): string {
  const parts = displayName.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function paletteFor(accountId: string): (typeof PALETTE)[number] {
  let hash = 0;
  for (const char of accountId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/**
 * A Jira assignee (or the honest absence of one). The name is always available as text, so meaning is never
 * carried by the colour of the initials alone.
 */
export function PersonBadge({
  person,
  unassignedLabel,
  size = 22,
  showName = false,
}: {
  person: { accountId: string; displayName: string } | null;
  unassignedLabel: string;
  size?: number;
  showName?: boolean;
}) {
  const name = person?.displayName ?? unassignedLabel;
  const tone = person ? styles[paletteFor(person.accountId)] : styles.avatar_unassigned;
  return (
    <span className={styles.person} data-person={person?.accountId ?? "unassigned"}>
      <span
        className={`${styles.avatar} ${tone}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        aria-hidden={showName ? true : undefined}
        role={showName ? undefined : "img"}
        aria-label={showName ? undefined : name}
      >
        {person ? initialsOf(person.displayName) : "–"}
      </span>
      {showName ? <span className={styles.personName}>{name}</span> : null}
    </span>
  );
}
