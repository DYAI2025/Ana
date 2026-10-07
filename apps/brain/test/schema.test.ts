import { describe, expect, it } from "vitest";
import { firstParagraph, parseNote, serializeNote } from "../src/contract/note.js";
import { baseFm, noteText } from "./helpers.js";

const parse = (fm: Record<string, unknown>, body = "Body\n") => parseNote(noteText(fm, body));

describe("frontmatter v1", () => {
  it("accepts a valid derived note and round-trips the body", () => {
    const n = parse(baseFm("kn-valid-note", "method"), "Para one.\n\n## Observations\n- x\n");
    expect(n.fm.status).toBe("DERIVED");
    const again = parseNote(serializeNote(n));
    expect(again.body).toBe(n.body);
    expect(again.fm).toEqual(n.fm);
  });

  it("accepts a valid source record", () => {
    expect(parse(baseFm("src-valid", "source")).fm.source?.kind).toBe("url");
  });

  it("accepts an unclassified source (data_class UNKNOWN) but no invented class", () => {
    const fm = baseFm("src-unclassified", "source") as Record<string, unknown> & { source: Record<string, unknown> };
    expect(parse({ ...fm, source: { ...fm.source, data_class: "UNKNOWN" } }).fm.source?.data_class).toBe("UNKNOWN");
    expect(() => parse({ ...fm, source: { ...fm.source, data_class: "G9" } })).toThrow();
  });

  it.each([
    ["bad id", { id: "Bad_ID" }],
    ["short id", { id: "kn-a" }],
    ["unknown type", { type: "fact" }],
    ["unknown status", { status: "FACT" }],
    ["bad version", { ana_brain: 2 }],
    ["bad timestamp", { created: "yesterday" }],
    ["bad actor", { created_by: "mallory" }],
    ["bad relation type", { relations: [{ type: "similar_to", target: "kn-other", by: "ben", at: "2026-10-07T12:00:00Z" }] }],
    ["SOURCE on non-source", { status: "SOURCE" }],
    ["SUPERSEDED without superseded_by", { status: "SUPERSEDED" }],
    ["source block on non-source", { source: { kind: "url", locator: "x", original_title: "t", access: "public", data_class: "G0" } }],
    ["unknown field", { raw_transcript: "..." }],
  ])("rejects %s", (_n, extra) => {
    expect(() => parse({ ...baseFm("kn-invalid-x", "method"), ...extra })).toThrow();
  });

  it("rejects a source note without SOURCE status or source block", () => {
    expect(() => parse({ ...baseFm("src-x-bad", "source"), status: "DERIVED" })).toThrow(/SOURCE/);
    const fm = baseFm("src-x-bad", "source");
    delete fm.source;
    expect(() => parse(fm)).toThrow(/source block/);
  });

  it("accepts UNKNOWN for unknown metadata", () => {
    expect(parse({ ...baseFm("kn-unknown-meta", "method"), created_by: "UNKNOWN", created: "UNKNOWN" }).fm.created_by).toBe("UNKNOWN");
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseNote("# no frontmatter")).toThrow(/frontmatter/);
  });

  it("first paragraph skips headings and is bounded", () => {
    expect(firstParagraph("# H\n\nHello world.\n\nNext")).toBe("Hello world.");
    expect(firstParagraph("x".repeat(400)).length).toBe(280);
  });
});
