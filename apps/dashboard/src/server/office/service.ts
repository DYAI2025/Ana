import "server-only";
import { isTeam, type OfficePerson } from "./people";
import { ASSIGNEES, COLUMNS, type OfficeAssignee, type OfficeAttachment, type OfficeColumn, type OfficeStore, type TicketPatch } from "./store";

/**
 * The board's rules, independent of HTTP so they can be tested directly. Every function takes the acting person,
 * which the route derives from the verified login (never from the request body), and answers with a status and a
 * JSON body. Ben and Vince run the board; Ana reads every ticket, writes entries, asks questions.
 */

export interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>, status = 200): Outcome => ({ status, body: { ok: true, ...body } });
const no = (status: number, reason: string): Outcome => ({ status, body: { ok: false, reason } });

export const LIMITS = { title: 120, description: 10_000, body: 5_000 } as const;

const isColumn = (v: unknown): v is OfficeColumn => typeof v === "string" && (COLUMNS as readonly string[]).includes(v);
const isAssignee = (v: unknown): v is OfficeAssignee => typeof v === "string" && (ASSIGNEES as readonly string[]).includes(v);

function cleanText(v: unknown, max: number, required: boolean): string | null | undefined {
  if (v === undefined) return required ? null : undefined;
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n/g, "\n").trim();
  if (required && s.length === 0) return null;
  return s.length > max ? null : s;
}

function obj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/** What the browser gets to know about a picture: no file paths. */
export function publicAttachment(a: OfficeAttachment) {
  return { id: a.id, ticketId: a.ticketId, entryId: a.entryId, uploadedBy: a.uploadedBy, createdAt: a.createdAt, width: a.width, height: a.height };
}

export function listTickets(store: OfficeStore, me: OfficePerson): Outcome {
  return ok({ me, tickets: store.listTickets() });
}

export function getTicket(store: OfficeStore, id: string): Outcome {
  const found = store.getTicket(id);
  if (!found || found.ticket.archived) return no(404, "ticket not found");
  return ok({ ticket: found.ticket, entries: found.entries, attachments: found.attachments.map(publicAttachment) });
}

export function createTicket(store: OfficeStore, actor: OfficePerson, input: unknown): Outcome {
  if (!isTeam(actor)) return no(403, "only Ben and Vince create tickets");
  const b = obj(input);
  const title = cleanText(b.title, LIMITS.title, true);
  if (!title) return no(400, `title is required, at most ${LIMITS.title} characters`);
  const description = cleanText(b.description, LIMITS.description, false);
  if (description === null) return no(400, `description must be text, at most ${LIMITS.description} characters`);
  const column = b.column === undefined ? "todo" : b.column;
  if (!isColumn(column)) return no(400, "column must be todo, doing or done");
  const assignee = b.assignee === undefined ? "none" : b.assignee;
  if (!isAssignee(assignee)) return no(400, "assignee must be ben, vince or none");
  return ok({ ticket: store.createTicket({ title, description: description ?? "", column, assignee, createdBy: actor }) }, 201);
}

export function updateTicket(store: OfficeStore, actor: OfficePerson, id: string, input: unknown): Outcome {
  if (!isTeam(actor)) return no(403, "only Ben and Vince change tickets");
  const b = obj(input);
  const patch: TicketPatch = {};
  if (b.title !== undefined) {
    const t = cleanText(b.title, LIMITS.title, true);
    if (!t) return no(400, `title is required, at most ${LIMITS.title} characters`);
    patch.title = t;
  }
  if (b.description !== undefined) {
    const d = cleanText(b.description, LIMITS.description, false);
    if (d === null || d === undefined) return no(400, `description must be text, at most ${LIMITS.description} characters`);
    patch.description = d;
  }
  if (b.column !== undefined) {
    if (!isColumn(b.column)) return no(400, "column must be todo, doing or done");
    patch.column = b.column;
  }
  if (b.assignee !== undefined) {
    if (!isAssignee(b.assignee)) return no(400, "assignee must be ben, vince or none");
    patch.assignee = b.assignee;
  }
  if (b.position !== undefined) {
    if (typeof b.position !== "number" || !Number.isFinite(b.position)) return no(400, "position must be a number");
    patch.position = b.position;
  }
  if (b.archived !== undefined) {
    if (typeof b.archived !== "boolean") return no(400, "archived must be true or false");
    patch.archived = b.archived;
  }
  if (Object.keys(patch).length === 0) return no(400, "nothing to change");
  const existing = store.getTicket(id);
  if (!existing) return no(404, "ticket not found");
  return ok({ ticket: store.updateTicket(id, patch) });
}

export function addEntry(store: OfficeStore, actor: OfficePerson, ticketId: string, input: unknown): Outcome {
  const b = obj(input);
  const body = cleanText(b.body, LIMITS.body, true);
  if (!body) return no(400, `body is required, at most ${LIMITS.body} characters`);
  if (b.isQuestion !== undefined && typeof b.isQuestion !== "boolean") return no(400, "isQuestion must be true or false");
  const found = store.getTicket(ticketId);
  if (!found || found.ticket.archived) return no(404, "ticket not found");
  // the author is the logged-in person; any "author" field in the body is ignored on purpose
  const entry = store.addEntry({ ticketId, author: actor, body, isQuestion: b.isQuestion === true });
  return entry ? ok({ entry }, 201) : no(404, "ticket not found");
}

export function resolveQuestion(store: OfficeStore, actor: OfficePerson, entryId: string): Outcome {
  if (!isTeam(actor)) return no(403, "only Ben and Vince mark questions as answered");
  const entry = store.getEntry(entryId);
  if (!entry) return no(404, "entry not found");
  if (!entry.isQuestion) return no(400, "this entry is not a question");
  return ok({ entry: store.resolveQuestion(entryId) });
}
