/**
 * PROTOTYPE FIXTURES — fictional content for the ANA-4 localhost increment.
 * Nothing in src/fixtures is read from Jira, Confluence, Drive or any real source,
 * and no file here may contain private data (repo is public; see governance/DATA_GOVERNANCE.md).
 */
export const PEOPLE = ["ana", "ben", "vince"] as const;
export type PersonId = (typeof PEOPLE)[number];

export interface Person {
  id: PersonId;
  name: string;
  initial: string;
}

export const TEAM: Readonly<Record<PersonId, Person>> = {
  ana: { id: "ana", name: "Ana", initial: "A" },
  ben: { id: "ben", name: "Ben", initial: "B" },
  vince: { id: "vince", name: "Vince", initial: "V" },
};

export function isPersonId(value: unknown): value is PersonId {
  return typeof value === "string" && (PEOPLE as readonly string[]).includes(value);
}
