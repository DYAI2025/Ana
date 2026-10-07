import YAML from "yaml";
import { zFrontmatter, type Frontmatter } from "./schema.js";

export interface Note {
  fm: Frontmatter;
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class NoteParseError extends Error {}

export function parseNote(text: string): Note {
  const m = FM_RE.exec(text);
  if (!m) throw new NoteParseError("missing YAML frontmatter");
  let raw: unknown;
  try {
    raw = YAML.parse(m[1] ?? "");
  } catch (e) {
    throw new NoteParseError(`invalid YAML: ${(e as Error).message}`);
  }
  const r = zFrontmatter.safeParse(raw);
  if (!r.success) throw new NoteParseError(r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  return { fm: r.data, body: m[2] ?? "" };
}

export function validateFrontmatter(fm: unknown): Frontmatter {
  const r = zFrontmatter.safeParse(fm);
  if (!r.success) throw new NoteParseError(r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  return r.data;
}

export function serializeNote(note: Note): string {
  const fm: Record<string, unknown> = { ...note.fm };
  if (fm.source === undefined) delete fm.source;
  const yaml = YAML.stringify(fm, { lineWidth: 0 });
  return `---\n${yaml}---\n${note.body}`;
}

/** First non-heading paragraph of a body, trimmed to max chars. */
export function firstParagraph(body: string, max = 280): string {
  for (const para of body.split(/\r?\n\s*\r?\n/)) {
    const t = para
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join(" ")
      .trim();
    if (t) return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  return "";
}
