import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
    const fm = await v.createNote("agent:hermes", { id: "kn-new-note", title: "New", type: "concept", status: "DERIVED", body: "Hello" });
    expect(fm.created_by).toBe("agent:hermes");
    expect(fm.provenance.method).toBe("agent-derived");
    expect(existsSync(path.join(root, "knowledge", "kn-new-note.md"))).toBe(true);
    await expect(v.createNote("ben", { id: "kn-new-note", title: "X", type: "concept", status: "DERIVED", body: "overwrite" })).rejects.toThrow(/exists/);
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
});
