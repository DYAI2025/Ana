/** Browser side of Office Berlin: the shapes the API answers with and small fetch helpers. */

export type Person = "ana" | "ben" | "vince";
export type Column = "todo" | "doing" | "done";
export type Assignee = "ben" | "vince" | "none";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const NAMES: Record<Person, string> = { ana: "Ana", ben: "Ben", vince: "Vince" };

export interface Ticket {
  id: string;
  title: string;
  description: string;
  column: Column;
  assignee: Assignee;
  position: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Person;
  archived: boolean;
}

export interface TicketSummary extends Ticket {
  entries: number;
  attachments: number;
  openQuestions: number;
}

export interface Entry {
  id: string;
  ticketId: string;
  author: Person;
  body: string;
  isQuestion: boolean;
  questionResolved: boolean;
  createdAt: string;
}

export interface Attachment {
  id: string;
  ticketId: string;
  entryId: string | null;
  uploadedBy: Person;
  createdAt: string;
  width: number;
  height: number;
}

export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const PICTURE_TYPES = "image/png,image/jpeg,image/webp";
export const pictureUrl = (id: string, size: "full" | "thumb") => `/api/office/attachments/${encodeURIComponent(id)}${size === "thumb" ? "?size=thumb" : ""}`;

export class OfficeError extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const json = typeof init?.body === "string";
    res = await fetch(url, { ...init, cache: "no-store", headers: json ? { "Content-Type": "application/json" } : undefined });
  } catch {
    throw new OfficeError("network");
  }
  const body = (await res.json().catch(() => null)) as ({ ok?: boolean; reason?: string } & T) | null;
  if (!res.ok || !body || body.ok !== true) throw new OfficeError(body?.reason ?? `status ${res.status}`);
  return body;
}

export const officeApi = {
  list: () => call<{ me: Person; tickets: TicketSummary[] }>("/api/office/tickets"),
  get: (id: string) => call<{ ticket: Ticket; entries: Entry[]; attachments: Attachment[] }>(`/api/office/tickets/${encodeURIComponent(id)}`),
  create: (input: { title: string; description: string; assignee: Assignee }) =>
    call<{ ticket: Ticket }>("/api/office/tickets", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<Pick<Ticket, "title" | "description" | "column" | "assignee" | "position" | "archived">>) =>
    call<{ ticket: Ticket }>(`/api/office/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  comment: (id: string, body: string, isQuestion: boolean) =>
    call<{ entry: Entry }>(`/api/office/tickets/${encodeURIComponent(id)}/entries`, { method: "POST", body: JSON.stringify({ body, isQuestion }) }),
  upload: (ticketId: string, file: File, entryId: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (entryId) form.append("entryId", entryId);
    return call<{ attachment: Attachment }>(`/api/office/tickets/${encodeURIComponent(ticketId)}/attachments`, { method: "POST", body: form });
  },
  resolve: (entryId: string) => call<{ entry: Entry }>(`/api/office/entries/${encodeURIComponent(entryId)}/resolve`, { method: "PATCH", body: "{}" }),
};

export const isTeam = (p: Person | null): boolean => p === "ben" || p === "vince";

/** Relative age ("3 days ago") for the history; the exact date sits in the title attribute. */
export function ago(iso: string, now: number): { key: "now" | "min" | "h" | "d"; n: number } {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return { key: "now", n: 0 };
  if (s < 3600) return { key: "min", n: Math.floor(s / 60) };
  if (s < 86400) return { key: "h", n: Math.floor(s / 3600) };
  return { key: "d", n: Math.floor(s / 86400) };
}

export function byColumn(tickets: readonly TicketSummary[]): Record<Column, TicketSummary[]> {
  const out: Record<Column, TicketSummary[]> = { todo: [], doing: [], done: [] };
  for (const t of tickets) out[t.column].push(t);
  for (const c of COLUMNS) out[c].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  return out;
}
