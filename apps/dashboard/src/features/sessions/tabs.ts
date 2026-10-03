export const SESSION_TABS = ["watch", "summary", "transcript", "json"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function parseTab(value: unknown): SessionTab {
  return (SESSION_TABS as readonly unknown[]).includes(value) ? (value as SessionTab) : "watch";
}
