import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Vault } from "../src/vault/vault.js";
import { seed, syntheticVault, tmpDir } from "./helpers.js";

const audit = (root: string) => readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string>);

describe("vault", () => {
  it("loads notes into type folders and builds backlinks", async () => {
    const v = new Vault(syntheticVault());
    expect(v.loadErrors).toEqual([]);
    expect(v.all()).toHaveLength(8);
    await v.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first");
    expect(v.backlinks("kn-hook-first")).toEqual([{ from: "kn-hook-variant", type: "supports" }]);
  });

  it("rejects traversal, absolute and malformed ids", () => {
    const v = new Vault(tmpDir());
    for (const id of ["../etc-passwd", "kn-../../x", "/etc/passwd", "kn-a/b-c", "KN-ABC", "kn-ab", ""]) expect(() => v.pathFor(id, "method")).toThrow(/invalid id/);
    expect(() => v.get("../../etc")).toThrow();
  });

  it("rejects symlink escapes for files and folders", async () => {
    const outside = tmpDir("outside-");
    const root = tmpDir();
    writeFileSync(path.join(outside, "kn-evil-link.md"), "x");
    const v = new Vault(root);
    symlinkSync(path.join(outside, "kn-evil-link.md"), path.join(root, "knowledge", "kn-evil-link.md"));
    expect(() => v.pathFor("kn-evil-link", "method")).toThrow(/escapes/);
    const root2 = tmpDir();
    mkdirSync(path.join(root2, ".ana"));
    symlinkSync(outside, path.join(root2, "questions"));
    const v2 = new Vault(root2);
    await expect(v2.createNote("ben", { id: "qq-escape", title: "t", type: "question", status: "CANDIDATE", body: "b" })).rejects.toThrow(/escapes/);
    expect(existsSync(path.join(outside, "qq-escape.md"))).toBe(false);
  });

  it("creates a note with caller identity and refuses an existing id", async () => {
    const root = tmpDir();
    const v = new Vault(root);
    const fm = await v.createNote("agent:hermes", { id: "kn-new-note", title: "New", type: "concept", status: "CANDIDATE", body: "Hello" });
    expect(fm.created_by).toBe("agent:hermes");
    expect(fm.provenance.method).toBe("agent-derived");
    expect(existsSync(path.join(root, "knowledge", "kn-new-note.md"))).toBe(true);
    await expect(v.createNote("ben", { id: "kn-new-note", title: "X", type: "concept", status: "CANDIDATE", body: "overwrite" })).rejects.toThrow(/exists/);
    expect(readFileSync(path.join(root, "knowledge", "kn-new-note.md"), "utf8")).toContain("Hello");
    expect(audit(root).map((a) => a.result)).toEqual(["ok", "rejected:exists"]);
    expect(readFileSync(path.join(root, ".ana", "audit.jsonl"), "utf8")).not.toContain("Hello");
  });

  it("never lets an agent (or an unconfirmed human) create CONFIRMED", async () => {
    const v = new Vault(tmpDir());
    await expect(v.createNote("agent:hermes", { id: "kn-conf-a", title: "t", type: "preference", status: "CONFIRMED", body: "b", confirm: true })).rejects.toThrow(/CONFIRMED/);
    await expect(v.createNote("ana", { id: "kn-conf-b", title: "t", type: "preference", status: "CONFIRMED", body: "b" })).rejects.toThrow(/CONFIRMED/);
    await expect(v.createNote("ana", { id: "kn-conf-c", title: "t", type: "preference", status: "SOURCE", body: "b" })).rejects.toThrow(/SOURCE/);
    expect((await v.createNote("ana", { id: "kn-conf-d", title: "t", type: "preference", status: "CONFIRMED", body: "b", confirm: true })).status).toBe("CONFIRMED");
    await expect(v.appendObservation("agent:x", "kn-conf-d", { text: "t", status: "CONFIRMED", confirm: true })).rejects.toThrow(/CONFIRMED/);
  });

  it("registers sources without raw content", async () => {
    const v = new Vault(tmpDir());
    const src = { kind: "drive_doc" as const, locator: "synthetic-file-id", original_title: "Synthetic", access: "restricted" as const, data_class: "G2" as const };
    expect((await v.registerSource("vince", { id: "src-syn-one", title: "Syn", source: src, description: "Short." })).status).toBe("SOURCE");
    await expect(v.registerSource("vince", { id: "src-syn-two", title: "Syn", source: src, description: "x".repeat(5000) })).rejects.toThrow(/exceeds/);
  });

  it("appends observations and corrections without touching existing body", async () => {
    const root = syntheticVault();
    const v = new Vault(root);
    const file = path.join(root, "knowledge", "kn-hook-first.md");
    const before = v.require("kn-hook-first").body;
    const { block_id } = await v.appendObservation("ana", "kn-hook-first", { text: "Works\nwell" });
    await v.appendObservation("ben", "kn-hook-first", { text: "Second" });
    await v.appendObservation("ana", "kn-hook-first", { text: "Actually not always", corrects: block_id });
    const after = readFileSync(file, "utf8");
    const body = v.require("kn-hook-first").body;
    expect(body.startsWith(before.trimEnd())).toBe(true);
    expect(body).toMatch(/## Observations\n- \S+ · ana · CANDIDATE · Works well \^obs-\d{14}-ana\n- \S+ · ben · CANDIDATE · Second \^obs-/);
    expect(body).toMatch(new RegExp(`## Corrections\\n- \\S+ · ana · CANDIDATE · corrects \\${block_id} · Actually not always`));
    expect(after).toContain("updated:");
  });

  it("adds relations only between existing notes, idempotently; supersedes marks target", async () => {
    const root = syntheticVault();
    const v = new Vault(root);
    await expect(v.addRelation("ben", "kn-hook-first", "supports", "kn-missing-note")).rejects.toThrow(/not found/);
    expect(await v.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first")).toEqual({ added: true });
    expect(await v.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first")).toEqual({ added: false });
    expect(v.require("kn-hook-variant").fm.relations).toHaveLength(1);
    await v.addRelation("ana", "kn-grade-cool", "supersedes", "kn-grade-warm");
    const warm = new Vault(root).require("kn-grade-warm");
    expect(warm.fm.status).toBe("SUPERSEDED");
    expect(warm.fm.superseded_by).toBe("kn-grade-cool");
    expect(warm.body).toContain("Warm colour");
  });

  it("commits each write when the vault is a git repo", async () => {
    const root = tmpDir();
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.email", "t@example.org"]);
    execFileSync("git", ["-C", root, "config", "user.name", "t"]);
    const v = new Vault(root);
    await v.createNote("ben", { id: "kn-git-note", title: "G", type: "tool", status: "CANDIDATE", body: "b" });
    expect(execFileSync("git", ["-C", root, "log", "--format=%s"]).toString().trim()).toBe("create_note kn-git-note by ben");
  });

  it("write paths refuse missing or mistyped topic, workshop and source targets, and DERIVED without a source (AC2, B-10)", async () => {
    const root = syntheticVault();
    const v = new Vault(root);
    const note = (extra: Record<string, unknown>) => ({ id: "kn-target-check", title: "t", type: "concept" as const, status: "CANDIDATE" as const, body: "b", ...extra });
    await expect(v.createNote("ben", note({ topics: ["top-missing"] }))).rejects.toThrow(/not found: top-missing/);
    await expect(v.createNote("ben", note({ topics: ["ws-01-intro"] }))).rejects.toThrow(/ws-01-intro is not a topic/);
    await expect(v.createNote("ben", note({ workshops: ["top-alpha"] }))).rejects.toThrow(/top-alpha is not a workshop/);
    await expect(v.createNote("ben", note({ source_refs: [{ source: "kn-hook-variant", locator: "UNKNOWN" }] }))).rejects.toThrow(/is not a source/);
    await expect(v.createNote("ben", note({ status: "DERIVED" }))).rejects.toThrow(/DERIVED requires at least one source_ref/);
    const src = { kind: "url" as const, locator: "https://example.org/y", original_title: "Y", access: "public" as const, data_class: "G0" as const };
    await expect(v.registerSource("ben", { id: "src-target-check", title: "Y", source: src, description: "d", workshops: ["ws-missing"] })).rejects.toThrow(/not found: ws-missing/);
    expect(existsSync(path.join(root, "knowledge", "kn-target-check.md"))).toBe(false);
    expect(existsSync(path.join(root, "sources", "src-target-check.md"))).toBe(false);
    const ok = await v.createNote("ben", note({ status: "DERIVED", topics: ["top-alpha"], workshops: ["ws-01-intro"], source_refs: [{ source: "src-synthetic-report", locator: "p. 3" }] }));
    expect(ok.status).toBe("DERIVED");
  });

  it("a correction names an existing observation block; a DERIVED observation needs a cited source (AC2, B-10)", async () => {
    const v = new Vault(syntheticVault());
    const { block_id } = await v.appendObservation("ana", "kn-hook-first", { text: "Works" });
    await expect(v.appendObservation("ana", "kn-hook-first", { text: "No", corrects: "obs-20990101000000-nobody" })).rejects.toThrow(/no observation block \^obs-20990101000000-nobody/);
    // a prefix of a real block id is not that block
    await expect(v.appendObservation("ana", "kn-hook-first", { text: "No", corrects: block_id.slice(1, -1) })).rejects.toThrow(/no observation block/);
    expect((await v.appendObservation("ana", "kn-hook-first", { text: "Not always", corrects: block_id })).block_id).toMatch(/^\^obs-/);
    expect((await v.appendObservation("ben", "kn-hook-first", { text: "Cited", status: "DERIVED" })).block_id).toMatch(/^\^obs-/);
    await expect(v.appendObservation("ben", "kn-hook-variant", { text: "Uncited", status: "DERIVED" })).rejects.toThrow(/cites no source/);
  });

  it("referenceErrors lists every dangling or mistyped reference in the vault", () => {
    const root = syntheticVault();
    expect(new Vault(root).referenceErrors()).toEqual([]);
    seed(root, "kn-dangling-refs", "concept", "Text.\n\n## Corrections\n- 2026-10-07T12:00:00Z · ben · CANDIDATE · corrects ^obs-20260101000000-gone · x ^obs-20261007120000-ben\n", {
      topics: ["top-gone", "ws-01-intro"], workshops: ["top-alpha"],
      source_refs: [{ source: "kn-hook-variant", locator: "UNKNOWN" }, { source: "src-gone-report", locator: "UNKNOWN" }],
      relations: [{ type: "supports", target: "kn-gone-note", by: "ben", at: "2026-10-07T12:00:00Z" }],
    });
    expect(new Vault(root).referenceErrors()).toEqual([
      "kn-dangling-refs: topic missing: top-gone",
      "kn-dangling-refs: ws-01-intro is not a topic",
      "kn-dangling-refs: top-alpha is not a workshop",
      "kn-dangling-refs: kn-hook-variant is not a source",
      "kn-dangling-refs: source missing: src-gone-report",
      "kn-dangling-refs: relation target missing: kn-gone-note",
      "kn-dangling-refs: correction names a missing block: ^obs-20260101000000-gone",
    ]);
  });

  it("commits with its own identity on a host that has none, and says so when a commit fails", async () => {
    const root = tmpDir();
    execFileSync("git", ["init", "-q", root]);
    // a fresh service user: no user.name/user.email anywhere, and git may not guess one
    execFileSync("git", ["-C", root, "config", "user.useConfigOnly", "true"]);
    const env = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m: unknown) => void errors.push(String(m)));
    try {
      const v = new Vault(root);
      await v.createNote("ana", { id: "kn-fresh-host", title: "F", type: "tool", status: "CANDIDATE", body: "b" });
      expect(execFileSync("git", ["-C", root, "log", "--format=%s|%cn"]).toString().trim()).toBe("create_note kn-fresh-host by ana|ANA Brain");
      expect(errors).toEqual([]);
      // a commit that cannot happen (index locked) is reported, the write itself stands
      writeFileSync(path.join(root, ".git", "index.lock"), "");
      await v.createNote("ana", { id: "kn-locked-host", title: "L", type: "tool", status: "CANDIDATE", body: "b" });
      expect(existsSync(path.join(root, "knowledge", "kn-locked-host.md"))).toBe(true);
      expect(errors.join("\n")).toMatch(/git commit of create_note kn-locked-host failed/);
    } finally {
      spy.mockRestore();
      for (const [k, val] of Object.entries(env)) if (val === undefined) delete process.env[k]; else process.env[k] = val;
    }
  });

  it("reports invalid notes on load", () => {
    const root = tmpDir();
    seed(root, "kn-wrong-folder", "topic", "x");
    mkdirSync(path.join(root, "knowledge"), { recursive: true });
    writeFileSync(path.join(root, "knowledge", "kn-broken.md"), "---\nid: kn-broken\n---\n");
    mkdirSync(path.join(root, "topics"), { recursive: true });
    const v = new Vault(root);
    expect(v.loadErrors.length).toBe(1);
    expect(v.all().map((n) => n.fm.id)).toEqual(["kn-wrong-folder"]);
  });

  it("a supersession whose target update was lost is completed when it is retried", async () => {
    const root = syntheticVault();
    const v = new Vault(root, { git: false });
    const target = path.join(root, "knowledge", "kn-hook-first.md");
    const before = readFileSync(target, "utf8");
    await v.addRelation("ben", "kn-hook-variant", "supersedes", "kn-hook-first");
    // the second of the two file writes never happened (crash, full disk): relation recorded, target not marked
    writeFileSync(target, before);
    v.reload();
    expect(v.require("kn-hook-first").fm.status).not.toBe("SUPERSEDED");
    expect(await v.addRelation("ben", "kn-hook-variant", "supersedes", "kn-hook-first")).toEqual({ added: false });
    expect(v.require("kn-hook-first").fm.status).toBe("SUPERSEDED");
    expect(v.require("kn-hook-first").fm.superseded_by).toBe("kn-hook-variant");
    expect(v.require("kn-hook-variant").fm.relations.filter((r) => r.type === "supersedes")).toHaveLength(1);
  });

  it("an idempotent repeat is not reported as a failed commit when .ana/ is ignored, as in the real vault", async () => {
    const root = syntheticVault();
    writeFileSync(path.join(root, ".gitignore"), ".ana/\n");
    const id = ["-c", "user.name=t", "-c", "user.email=t@example.test"];
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "-A"]);
    execFileSync("git", ["-C", root, ...id, "commit", "-qm", "seed"]);
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m: unknown) => void errors.push(String(m)));
    try {
      const v = new Vault(root);
      expect(await v.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first")).toEqual({ added: true });
      expect(await v.addRelation("ben", "kn-hook-variant", "supports", "kn-hook-first")).toEqual({ added: false });
      expect(errors).toEqual([]);
      expect(execFileSync("git", ["-C", root, "rev-list", "--count", "HEAD"]).toString().trim()).toBe("2");
    } finally {
      spy.mockRestore();
    }
  });

  it("an observation that only mentions 'corrects ^obs-…' in its text is not a correction", async () => {
    const v = new Vault(syntheticVault(), { git: false });
    expect(v.referenceErrors()).toEqual([]);
    await v.appendObservation("ben", "kn-hook-first", { text: "this corrects ^obs-20261001000000-ben in kn-other" });
    await v.appendObservation("ben", "kn-hook-first", { text: "corrects ^obs-20261001000000-vince · as a plain remark" });
    expect(v.referenceErrors()).toEqual([]);
  });

  it("checks corrections in the CONTRACT format and below a sub-heading of ## Corrections", () => {
    const root = tmpDir();
    seed(root, "kn-hand-edited", "method", [
      "Body.", "", "## Observations", "- 2026-10-07T12:00:00Z · ben · CANDIDATE · seen ^obs-20261007120000-ben", "",
      "## Corrections", "### Notes added by hand",
      "- 2026-10-29T10:00:00Z · ben · CANDIDATE · corrects ^obs-20260101000000-gone · typo ^obs-20261029100000-ben",
      "- 2026-10-29T10:00:00Z · ana · corrects ^obs-20260101000000-anna · documented format without status",
      "- 2026-10-29T10:00:00Z · ana · corrects ^obs-20261007120000-ben · names an existing block", "",
    ].join("\n"));
    const v = new Vault(root, { git: false });
    expect(v.loadErrors).toEqual([]);
    expect(v.referenceErrors()).toEqual([
      "kn-hand-edited: correction names a missing block: ^obs-20260101000000-gone",
      "kn-hand-edited: correction names a missing block: ^obs-20260101000000-anna",
    ]);
  });
});
