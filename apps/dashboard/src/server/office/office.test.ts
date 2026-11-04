// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personOf, readPeople } from "./people";
import { addEntry, createTicket, getTicket, listTickets, resolveQuestion, updateTicket } from "./service";
import { openOfficeStore, type OfficeStore } from "./store";

let dir: string;
let file: string;
let store: OfficeStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "office-test-"));
  file = path.join(dir, "office.sqlite");
  store = openOfficeStore(file);
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("people", () => {
  const env = { OFFICE_PEOPLE: "ana:a@example.com, ben:B@Example.com,vince:v@example.com,eve:e@example.com" };
  it("maps verified emails to persons, case-insensitively, and ignores unknown names", () => {
    expect(readPeople(env).size).toBe(3);
    expect(personOf("b@example.com", env)).toBe("ben");
    expect(personOf("e@example.com", env)).toBeNull();
    expect(personOf("nobody@example.com", env)).toBeNull();
  });
  it("grants a dev identity only outside production", () => {
    expect(personOf(null, { OFFICE_DEV_PERSON: "ana", NODE_ENV: "development" })).toBe("ana");
    expect(personOf(null, { OFFICE_DEV_PERSON: "ben", NODE_ENV: "production" })).toBeNull();
  });
});

describe("tickets", () => {
  it("survive closing and reopening the database (server restart)", () => {
    const created = createTicket(store, "ben", { title: "New website draft", description: "First look", column: "doing", assignee: "vince" });
    expect(created.status).toBe(201);
    const id = (created.body.ticket as { id: string }).id;
    addEntry(store, "ana", id, { body: "Can I see it on my phone?", isQuestion: true });
    store.close();
    store = openOfficeStore(file);
    const again = getTicket(store, id);
    expect(again.status).toBe(200);
    expect((again.body.ticket as { title: string }).title).toBe("New website draft");
    expect((again.body.entries as unknown[]).length).toBe(1);
  });

  it("let only Ben and Vince create, move, rename or archive", () => {
    expect(createTicket(store, "ana", { title: "x" }).status).toBe(403);
    const id = (createTicket(store, "vince", { title: "Brand call" }).body.ticket as { id: string }).id;
    expect(updateTicket(store, "ana", id, { column: "done" }).status).toBe(403);
    expect(updateTicket(store, "ana", id, { title: "renamed" }).status).toBe(403);
    expect(updateTicket(store, "ana", id, { archived: true }).status).toBe(403);
    const moved = updateTicket(store, "ben", id, { column: "done" });
    expect(moved.status).toBe(200);
    expect((moved.body.ticket as { column: string }).column).toBe("done");
  });

  it("validate input", () => {
    expect(createTicket(store, "ben", { title: "" }).status).toBe(400);
    expect(createTicket(store, "ben", { title: "x".repeat(121) }).status).toBe(400);
    expect(createTicket(store, "ben", { title: "ok", column: "later" }).status).toBe(400);
    expect(createTicket(store, "ben", { title: "ok", assignee: "ana" }).status).toBe(400);
  });

  it("disappear from the board when archived, but stay in the database", () => {
    const id = (createTicket(store, "ben", { title: "Old" }).body.ticket as { id: string }).id;
    updateTicket(store, "ben", id, { archived: true });
    expect((listTickets(store).body.tickets as unknown[]).length).toBe(0);
    expect(store.getTicket(id)?.ticket.archived).toBe(true);
  });
});

describe("entries and questions", () => {
  it("take the author from the login, never from the body", () => {
    const id = (createTicket(store, "ben", { title: "T" }).body.ticket as { id: string }).id;
    const r = addEntry(store, "ana", id, { body: "hi", author: "ben" });
    expect((r.body.entry as { author: string }).author).toBe("ana");
  });

  it("count open questions until Ben or Vince marks them answered", () => {
    const id = (createTicket(store, "ben", { title: "T" }).body.ticket as { id: string }).id;
    const q = addEntry(store, "ana", id, { body: "When is it ready?", isQuestion: true });
    const entryId = (q.body.entry as { id: string }).id;
    const open = () => (listTickets(store).body.tickets as { openQuestions: number }[])[0]!.openQuestions;
    expect(open()).toBe(1);
    expect(resolveQuestion(store, "ana", entryId).status).toBe(403);
    expect(resolveQuestion(store, "vince", entryId).status).toBe(200);
    expect(open()).toBe(0);
  });

  it("refuse empty bodies and unknown tickets", () => {
    const id = (createTicket(store, "ben", { title: "T" }).body.ticket as { id: string }).id;
    expect(addEntry(store, "ana", id, { body: "   " }).status).toBe(400);
    expect(addEntry(store, "ana", "nope", { body: "hi" }).status).toBe(404);
  });
});

describe("HTTP edge", () => {
  it("answers 401 without a Cloudflare Access assertion and leaks no tickets", async () => {
    vi.stubEnv("ANA_ACCESS_MODE", "cloudflare");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "https://example.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "a".repeat(64));
    vi.stubEnv("ANA_ALLOWED_EMAILS", "a@example.com");
    vi.stubEnv("OFFICE_STATE_DIR", dir);
    createTicket(store, "ben", { title: "secret" });
    const { GET } = await import("@/app/api/office/tickets/route");
    const res = await GET(new Request("https://ana.dyai.cloud/api/office/tickets"));
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain("secret");
  });
});
