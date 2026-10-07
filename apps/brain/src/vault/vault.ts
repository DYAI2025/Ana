import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, appendFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { firstParagraph, parseNote, serializeNote, validateFrontmatter, type Note } from "../contract/note.js";
import {
  FOLDER_BY_TYPE, ID_RE, NOTE_TYPES, isHuman, zActor,
  type Frontmatter, type NoteType, type Relation, type RelationType, type SourceBlock, type Status,
} from "../contract/schema.js";

export class VaultError extends Error {
  constructor(message: string, readonly code: "invalid" | "not_found" | "exists" | "forbidden" | "path" = "invalid") {
    super(message);
  }
}

export interface Backlink { from: string; type: RelationType }
export interface LoadError { file: string; error: string }

export interface CreateNoteInput {
  id: string;
  title: string;
  type: Exclude<NoteType, "source">;
  status: Status;
  body: string;
  topics?: string[];
  workshops?: string[];
  source_refs?: { source: string; locator: string }[];
  confirm?: boolean;
  provenance_note?: string;
}

export interface RegisterSourceInput {
  id: string;
  title: string;
  source: SourceBlock;
  description: string;
  topics?: string[];
  workshops?: string[];
  provenance_note?: string;
}

export const MAX_BODY = 20000;
export const MAX_SOURCE_DESCRIPTION = 4000;
export const MAX_OBSERVATION = 2000;

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export class Vault {
  readonly root: string;
  private notes = new Map<string, { note: Note; file: string }>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly loadErrors: LoadError[] = [];

  constructor(root: string, private readonly opts: { git?: boolean; method?: "mcp" | "manual" | "seed" } = {}) {
    if (!path.isAbsolute(root)) root = path.resolve(root);
    mkdirSync(root, { recursive: true });
    this.root = realpathSync(root);
    for (const dir of new Set(Object.values(FOLDER_BY_TYPE))) mkdirSync(path.join(this.root, dir), { recursive: true });
    mkdirSync(path.join(this.root, ".ana"), { recursive: true });
    this.reload();
  }

  /** Resolve the file path for an id+type and assert it stays inside the vault root. */
  pathFor(id: string, type: NoteType): string {
    if (typeof id !== "string" || !ID_RE.test(id)) throw new VaultError(`invalid id: ${JSON.stringify(id).slice(0, 100)}`, "path");
    if (!(NOTE_TYPES as readonly string[]).includes(type)) throw new VaultError("invalid type", "path");
    const dir = path.join(this.root, FOLDER_BY_TYPE[type]);
    const file = path.join(dir, `${id}.md`);
    this.assertInside(dir);
    if (existsSync(file) || isSymlink(file)) this.assertInside(file);
    return file;
  }

  private assertInside(p: string): void {
    let real: string;
    try {
      real = realpathSync(p);
    } catch {
      throw new VaultError("path escapes vault root", "path");
    }
    const rel = path.relative(this.root, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new VaultError("path escapes vault root", "path");
  }

  reload(): void {
    this.notes.clear();
    this.loadErrors.length = 0;
    for (const dir of new Set(Object.values(FOLDER_BY_TYPE))) {
      const abs = path.join(this.root, dir);
      for (const name of readdirSync(abs).sort()) {
        if (!name.endsWith(".md")) continue;
        const file = path.join(abs, name);
        try {
          this.assertInside(file);
          const note = parseNote(readFileSync(file, "utf8"));
          if (`${note.fm.id}.md` !== name) throw new Error(`id ${note.fm.id} does not match file name`);
          if (FOLDER_BY_TYPE[note.fm.type] !== dir) throw new Error(`type ${note.fm.type} does not belong in ${dir}/`);
          if (this.notes.has(note.fm.id)) throw new Error(`duplicate id ${note.fm.id}`);
          this.notes.set(note.fm.id, { note, file });
        } catch (e) {
          this.loadErrors.push({ file: path.relative(this.root, file), error: (e as Error).message });
        }
      }
    }
  }

  all(): Note[] {
    return [...this.notes.values()].map((n) => n.note).sort((a, b) => a.fm.id.localeCompare(b.fm.id));
  }

  get(id: string): Note | undefined {
    if (typeof id !== "string" || !ID_RE.test(id)) throw new VaultError("invalid id", "path");
    return this.notes.get(id)?.note;
  }

  require(id: string): Note {
    const n = this.get(id);
    if (!n) throw new VaultError(`note not found: ${id}`, "not_found");
    return n;
  }

  backlinks(id: string): Backlink[] {
    const out: Backlink[] = [];
    for (const { note } of this.notes.values())
      for (const r of note.fm.relations) if (r.target === id) out.push({ from: note.fm.id, type: r.type });
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type));
  }

  summary(id: string): string {
    return firstParagraph(this.require(id).body);
  }

  // ---------- writes (create / append only; there is no delete and no body overwrite) ----------

  createNote(actor: string, input: CreateNoteInput): Promise<Frontmatter> {
    return this.write(actor, "create_note", input.id, () => {
      assertActor(actor);
      if ((input.type as string) === "source") throw new VaultError("use registerSource for type source", "forbidden");
      if (input.status === "SOURCE") throw new VaultError("status SOURCE is only set by registerSource", "forbidden");
      if (input.status === "SUPERSEDED") throw new VaultError("a new note cannot be SUPERSEDED", "forbidden");
      if (input.status === "CONFIRMED" && !(isHuman(actor) && input.confirm === true))
        throw new VaultError("CONFIRMED requires a human caller (ana|ben|vince) and an explicit confirm flag", "forbidden");
      if (input.body.length > MAX_BODY) throw new VaultError(`body exceeds ${MAX_BODY} chars`);
      const file = this.pathFor(input.id, input.type);
      if (this.notes.has(input.id) || existsSync(file)) throw new VaultError(`note already exists: ${input.id}`, "exists");
      for (const ref of input.source_refs ?? []) this.requireType(ref.source, "source");
      const at = now();
      const fm = validateFrontmatter({
        ana_brain: 1, id: input.id, title: input.title, type: input.type, status: input.status,
        created: at, updated: at, created_by: actor,
        topics: input.topics ?? [], workshops: input.workshops ?? [], source_refs: input.source_refs ?? [],
        relations: [], superseded_by: null,
        provenance: { method: this.method(actor), actor, at, ...(input.provenance_note ? { note: input.provenance_note } : {}) },
      });
      this.persist(file, { fm, body: ensureNl(input.body) }, true);
      return fm;
    });
  }

  registerSource(actor: string, input: RegisterSourceInput): Promise<Frontmatter> {
    return this.write(actor, "register_source", input.id, () => {
      assertActor(actor);
      if (input.description.length > MAX_SOURCE_DESCRIPTION)
        throw new VaultError(`source description exceeds ${MAX_SOURCE_DESCRIPTION} chars; store raw evidence in the Evidence Root, not the vault`);
      const file = this.pathFor(input.id, "source");
      if (this.notes.has(input.id) || existsSync(file)) throw new VaultError(`note already exists: ${input.id}`, "exists");
      const at = now();
      const fm = validateFrontmatter({
        ana_brain: 1, id: input.id, title: input.title, type: "source", status: "SOURCE",
        created: at, updated: at, created_by: actor, topics: input.topics ?? [], workshops: input.workshops ?? [],
        source_refs: [], relations: [], superseded_by: null,
        provenance: { method: this.method(actor), actor, at, ...(input.provenance_note ? { note: input.provenance_note } : {}) },
        source: input.source,
      });
      this.persist(file, { fm, body: ensureNl(input.description) }, true);
      return fm;
    });
  }

  /** Append a typed relation. `supersedes` additionally marks the target SUPERSEDED (frontmatter only). */
  addRelation(actor: string, from: string, type: RelationType, to: string): Promise<{ added: boolean }> {
    return this.write(actor, "add_relation", from, () => {
      assertActor(actor);
      const src = this.require(from);
      const tgt = this.require(to);
      if (from === to) throw new VaultError("a note cannot relate to itself");
      const exists = src.fm.relations.some((r) => r.type === type && r.target === to);
      if (exists) return { added: false };
      const at = now();
      const rel: Relation = { type, target: to, by: actor as Relation["by"], at };
      this.persist(this.pathFor(from, src.fm.type), { fm: validateFrontmatter({ ...src.fm, relations: [...src.fm.relations, rel], updated: at }), body: src.body }, false);
      if (type === "supersedes" && tgt.fm.type !== "source" && tgt.fm.status !== "SUPERSEDED") {
        this.persist(this.pathFor(to, tgt.fm.type), { fm: validateFrontmatter({ ...tgt.fm, status: "SUPERSEDED", superseded_by: from, updated: at }), body: tgt.body }, false);
      }
      return { added: true };
    });
  }

  appendObservation(actor: string, id: string, input: { text: string; status?: "CANDIDATE" | "DERIVED" | "CONFIRMED"; corrects?: string; confirm?: boolean }): Promise<{ block_id: string }> {
    return this.write(actor, input.corrects ? "append_correction" : "append_observation", id, () => {
      assertActor(actor);
      const note = this.require(id);
      const text = input.text.replace(/\s+/g, " ").trim();
      if (!text) throw new VaultError("observation text is empty");
      if (text.length > MAX_OBSERVATION) throw new VaultError(`observation exceeds ${MAX_OBSERVATION} chars`);
      const status = input.status ?? "CANDIDATE";
      if (status === "CONFIRMED" && !(isHuman(actor) && input.confirm === true))
        throw new VaultError("CONFIRMED requires a human caller (ana|ben|vince) and an explicit confirm flag", "forbidden");
      if (input.corrects !== undefined && !/^\^?obs-[a-z0-9-]{1,80}$/.test(input.corrects)) throw new VaultError("invalid corrects block id");
      const at = now();
      const slug = actor.replace(/[^a-z0-9]+/g, "-");
      let blockId = `obs-${at.replace(/\D/g, "").slice(0, 14)}-${slug}`;
      for (let i = 2; note.body.includes(`^${blockId}`); i++) blockId = `obs-${at.replace(/\D/g, "").slice(0, 14)}-${slug}-${i}`;
      const heading = input.corrects ? "## Corrections" : "## Observations";
      const line = input.corrects
        ? `- ${at} · ${actor} · ${status} · corrects ^${input.corrects.replace(/^\^/, "")} · ${text} ^${blockId}`
        : `- ${at} · ${actor} · ${status} · ${text} ^${blockId}`;
      const body = appendUnderHeading(note.body, heading, line);
      this.persist(this.pathFor(id, note.fm.type), { fm: validateFrontmatter({ ...note.fm, updated: at }), body }, false);
      return { block_id: `^${blockId}` };
    });
  }

  private requireType(id: string, type: NoteType): void {
    const n = this.require(id);
    if (n.fm.type !== type) throw new VaultError(`${id} is not a ${type} note`);
  }

  private method(actor: string): "mcp" | "manual" | "seed" | "agent-derived" {
    if (actor.startsWith("agent:") && this.opts.method !== "seed") return "agent-derived";
    return this.opts.method ?? "mcp";
  }

  private persist(file: string, note: Note, create: boolean): void {
    if (create && existsSync(file)) throw new VaultError("note already exists", "exists");
    if (!create) this.assertInside(file);
    const tmp = path.join(this.root, ".ana", `.tmp-${process.pid}-${Date.now()}`);
    writeFileSync(tmp, serializeNote(note), { flag: "wx" });
    renameSync(tmp, file);
    this.notes.set(note.fm.id, { note, file });
  }

  private audit(entry: { at: string; actor: string; action: string; target: string; result: string }): void {
    appendFileSync(path.join(this.root, ".ana", "audit.jsonl"), `${JSON.stringify(entry)}\n`);
  }

  private commit(action: string, id: string, actor: string): void {
    if (this.opts.git === false || !existsSync(path.join(this.root, ".git"))) return;
    try {
      execFileSync("git", ["-C", this.root, "add", "-A"], { stdio: "ignore" });
      execFileSync("git", ["-C", this.root, "commit", "-q", "-m", `${action} ${id} by ${actor}`], { stdio: "ignore" });
    } catch {
      /* best effort */
    }
  }

  /** Serialise writes, audit every attempt (no bodies), commit on success. */
  private write<T>(actor: string, action: string, target: string, fn: () => T): Promise<T> {
    const run = async (): Promise<T> => {
      const safeTarget = typeof target === "string" && ID_RE.test(target) ? target : "INVALID";
      try {
        const out = fn();
        this.audit({ at: now(), actor, action, target: safeTarget, result: "ok" });
        this.commit(action, safeTarget, actor);
        return out;
      } catch (e) {
        const code = e instanceof VaultError ? e.code : "error";
        this.audit({ at: now(), actor, action, target: safeTarget, result: `rejected:${code}` });
        throw e;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

function assertActor(actor: string): void {
  if (!zActor.safeParse(actor).success || actor === "UNKNOWN") throw new VaultError("invalid actor", "forbidden");
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureNl(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

export function appendUnderHeading(body: string, heading: string, line: string): string {
  const lines = ensureNl(body).replace(/\n+$/, "").split("\n");
  const idx = lines.findIndex((l) => l.trim() === heading);
  if (idx === -1) return `${lines.join("\n")}\n\n${heading}\n${line}\n`;
  let end = idx + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end] ?? "")) end++;
  let insert = end;
  while (insert > idx + 1 && (lines[insert - 1] ?? "").trim() === "") insert--;
  lines.splice(insert, 0, line);
  return `${lines.join("\n")}\n`;
}
