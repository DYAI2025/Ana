import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OfficePerson } from "./people";

/**
 * Office Berlin's board: tickets plus one shared history of notes and comments per ticket. One SQLite file
 * (node:sqlite, built into Node) in the unit's StateDirectory, which survives restarts and releases, unlike the
 * CacheDirectory. OFFICE_STATE_DIR overrides it (tests, e2e); a development server falls back to the temp dir.
 * Tickets are never deleted, only archived; entries are append-only.
 */

export const COLUMNS = ["todo", "doing", "done"] as const;
export type OfficeColumn = (typeof COLUMNS)[number];
export const ASSIGNEES = ["ben", "vince", "none"] as const;
export type OfficeAssignee = (typeof ASSIGNEES)[number];

export interface OfficeTicket {
  id: string;
  title: string;
  description: string;
  column: OfficeColumn;
  assignee: OfficeAssignee;
  position: number;
  createdAt: string;
  updatedAt: string;
  createdBy: OfficePerson;
  archived: boolean;
}

export interface OfficeTicketSummary extends OfficeTicket {
  entries: number;
  attachments: number;
  openQuestions: number;
}

export interface OfficeEntry {
  id: string;
  ticketId: string;
  author: OfficePerson;
  body: string;
  isQuestion: boolean;
  questionResolved: boolean;
  createdAt: string;
}

export interface OfficeAttachment {
  id: string;
  ticketId: string;
  entryId: string | null;
  uploadedBy: OfficePerson;
  createdAt: string;
  /** relative to the uploads directory; never sent to the browser */
  filePath: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface TicketPatch {
  title?: string;
  description?: string;
  column?: OfficeColumn;
  assignee?: OfficeAssignee;
  position?: number;
  archived?: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

export function officeDir(env: Env = process.env): string {
  return env.OFFICE_STATE_DIR || env.STATE_DIRECTORY?.split(":")[0] || path.join(os.tmpdir(), "ana-office");
}

export function officeUploadsDir(env: Env = process.env): string {
  return path.join(officeDir(env), "uploads");
}

export function officeDbFile(env: Env = process.env): string {
  return path.join(officeDir(env), "office.sqlite");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  col TEXT NOT NULL CHECK (col IN ('todo','doing','done')),
  assignee TEXT NOT NULL CHECK (assignee IN ('ben','vince','none')),
  position REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('ana','ben','vince')),
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author TEXT NOT NULL CHECK (author IN ('ana','ben','vince')),
  body TEXT NOT NULL,
  is_question INTEGER NOT NULL DEFAULT 0,
  question_resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_ticket ON entries(ticket_id, created_at);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  entry_id TEXT REFERENCES entries(id),
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('ana','ben','vince')),
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_ticket ON attachments(ticket_id);
`;

type Row = Record<string, unknown>;

function ticketOf(r: Row): OfficeTicket {
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    column: r.col as OfficeColumn,
    assignee: r.assignee as OfficeAssignee,
    position: Number(r.position),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    createdBy: r.created_by as OfficePerson,
    archived: Number(r.archived) === 1,
  };
}

function entryOf(r: Row): OfficeEntry {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    author: r.author as OfficePerson,
    body: String(r.body),
    isQuestion: Number(r.is_question) === 1,
    questionResolved: Number(r.question_resolved) === 1,
    createdAt: String(r.created_at),
  };
}

function attachmentOf(r: Row): OfficeAttachment {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    entryId: r.entry_id === null || r.entry_id === undefined ? null : String(r.entry_id),
    uploadedBy: r.uploaded_by as OfficePerson,
    createdAt: String(r.created_at),
    filePath: String(r.file_path),
    mimeType: String(r.mime_type),
    width: Number(r.width),
    height: Number(r.height),
    sizeBytes: Number(r.size_bytes),
  };
}

export interface OfficeStore {
  listTickets(): OfficeTicketSummary[];
  getTicket(id: string): { ticket: OfficeTicket; entries: OfficeEntry[]; attachments: OfficeAttachment[] } | null;
  createTicket(input: { title: string; description: string; column: OfficeColumn; assignee: OfficeAssignee; createdBy: OfficePerson }): OfficeTicket;
  updateTicket(id: string, patch: TicketPatch): OfficeTicket | null;
  addEntry(input: { ticketId: string; author: OfficePerson; body: string; isQuestion: boolean }): OfficeEntry | null;
  getEntry(id: string): OfficeEntry | null;
  resolveQuestion(entryId: string): OfficeEntry | null;
  addAttachment(input: Omit<OfficeAttachment, "createdAt">): OfficeAttachment;
  getAttachment(id: string): OfficeAttachment | null;
  close(): void;
}

export function openOfficeStore(file: string = officeDbFile(), now: () => Date = () => new Date()): OfficeStore {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  const iso = () => now().toISOString();

  const nextPosition = (column: OfficeColumn): number => {
    const r = db.prepare("SELECT MAX(position) AS m FROM tickets WHERE col = ? AND archived = 0").get(column) as Row | undefined;
    const m = r?.m;
    return (typeof m === "number" ? m : 0) + 1;
  };

  const getTicketRow = (id: string) => db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as Row | undefined;
  const getEntryRow = (id: string) => db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Row | undefined;

  return {
    listTickets() {
      const rows = db
        .prepare(
          `SELECT t.*,
             (SELECT COUNT(*) FROM entries e WHERE e.ticket_id = t.id) AS n_entries,
             (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS n_attachments,
             (SELECT COUNT(*) FROM entries e WHERE e.ticket_id = t.id AND e.is_question = 1 AND e.question_resolved = 0) AS n_open
           FROM tickets t WHERE t.archived = 0 ORDER BY t.col, t.position, t.created_at`,
        )
        .all() as Row[];
      return rows.map((r) => ({ ...ticketOf(r), entries: Number(r.n_entries), attachments: Number(r.n_attachments), openQuestions: Number(r.n_open) }));
    },

    getTicket(id) {
      const row = getTicketRow(id);
      if (!row) return null;
      const entries = (db.prepare("SELECT * FROM entries WHERE ticket_id = ? ORDER BY created_at, rowid").all(id) as Row[]).map(entryOf);
      const attachments = (db.prepare("SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at, rowid").all(id) as Row[]).map(attachmentOf);
      return { ticket: ticketOf(row), entries, attachments };
    },

    createTicket({ title, description, column, assignee, createdBy }) {
      const id = randomUUID();
      const at = iso();
      db.prepare(
        "INSERT INTO tickets (id, title, description, col, assignee, position, created_at, updated_at, created_by, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      ).run(id, title, description, column, assignee, nextPosition(column), at, at, createdBy);
      return ticketOf(getTicketRow(id)!);
    },

    updateTicket(id, patch) {
      const current = getTicketRow(id);
      if (!current) return null;
      const t = ticketOf(current);
      const column = patch.column ?? t.column;
      const position = patch.position ?? (column !== t.column ? nextPosition(column) : t.position);
      db.prepare("UPDATE tickets SET title = ?, description = ?, col = ?, assignee = ?, position = ?, archived = ?, updated_at = ? WHERE id = ?").run(
        patch.title ?? t.title,
        patch.description ?? t.description,
        column,
        patch.assignee ?? t.assignee,
        position,
        (patch.archived ?? t.archived) ? 1 : 0,
        iso(),
        id,
      );
      return ticketOf(getTicketRow(id)!);
    },

    addEntry({ ticketId, author, body, isQuestion }) {
      if (!getTicketRow(ticketId)) return null;
      const id = randomUUID();
      const at = iso();
      db.prepare("INSERT INTO entries (id, ticket_id, author, body, is_question, question_resolved, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(
        id,
        ticketId,
        author,
        body,
        isQuestion ? 1 : 0,
        at,
      );
      db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(at, ticketId);
      return entryOf(getEntryRow(id)!);
    },

    getEntry(id) {
      const row = getEntryRow(id);
      return row ? entryOf(row) : null;
    },

    resolveQuestion(entryId) {
      const row = getEntryRow(entryId);
      if (!row) return null;
      db.prepare("UPDATE entries SET question_resolved = 1 WHERE id = ? AND is_question = 1").run(entryId);
      return entryOf(getEntryRow(entryId)!);
    },

    addAttachment(a) {
      const at = iso();
      db.prepare(
        "INSERT INTO attachments (id, ticket_id, entry_id, uploaded_by, created_at, file_path, mime_type, width, height, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(a.id, a.ticketId, a.entryId, a.uploadedBy, at, a.filePath, a.mimeType, a.width, a.height, a.sizeBytes);
      db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(at, a.ticketId);
      return attachmentOf(db.prepare("SELECT * FROM attachments WHERE id = ?").get(a.id) as Row);
    },

    getAttachment(id) {
      const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Row | undefined;
      return row ? attachmentOf(row) : null;
    },

    close() {
      db.close();
    },
  };
}

let shared: { file: string; store: OfficeStore } | null = null;

/** One open database per server process. */
export function officeStore(): OfficeStore {
  const file = officeDbFile();
  if (!shared || shared.file !== file) shared = { file, store: openOfficeStore(file) };
  return shared.store;
}
