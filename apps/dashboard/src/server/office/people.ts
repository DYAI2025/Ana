import "server-only";

/**
 * Who is who in Office Berlin. The access check (src/server/access.ts) only knows an email; the board needs a person
 * for authorship and rights. The mapping lives in the server's env file (OFFICE_PEOPLE), never in this public repo:
 *
 *   OFFICE_PEOPLE=ana:<email>,ben:<email>,vince:<email>
 *
 * Loopback mode has no identity (email null). There OFFICE_DEV_PERSON may name a person for local work; it is
 * ignored on a production server, so a stray env line can never grant an identity there.
 */

export type OfficePerson = "ana" | "ben" | "vince";

const PEOPLE: ReadonlySet<string> = new Set(["ana", "ben", "vince"]);

export function isOfficePerson(value: unknown): value is OfficePerson {
  return typeof value === "string" && PEOPLE.has(value);
}

type Env = Readonly<Record<string, string | undefined>>;

export function readPeople(env: Env = process.env): ReadonlyMap<string, OfficePerson> {
  const map = new Map<string, OfficePerson>();
  for (const part of (env.OFFICE_PEOPLE ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const who = part.slice(0, i).trim().toLowerCase();
    const email = part.slice(i + 1).trim().toLowerCase();
    if (isOfficePerson(who) && email.includes("@")) map.set(email, who);
  }
  return map;
}

export function personOf(email: string | null, env: Env = process.env): OfficePerson | null {
  if (email) return readPeople(env).get(email.trim().toLowerCase()) ?? null;
  if (env.NODE_ENV === "production") return null;
  const dev = (env.OFFICE_DEV_PERSON ?? "").trim().toLowerCase();
  return isOfficePerson(dev) ? dev : null;
}

/** Ben and Vince run the board; Ana reads, comments, asks and adds pictures. */
export function isTeam(person: OfficePerson): boolean {
  return person === "ben" || person === "vince";
}
