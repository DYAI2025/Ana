import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTS } from "./calendar";
import { SOURCE_GROUPS, TOOLS } from "./connections";
import { SESSIONS } from "./sessions";

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : productionFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the Brain has no example data", () => {
  it("the Brain fixture is gone and no production file imports it", () => {
    expect(existsSync("src/fixtures/brain.ts")).toBe(false);
    const files = productionFiles("src");
    expect(files.length).toBeGreaterThan(10);
    const importers = files.filter((file) => /["']@\/fixtures\/brain["']/.test(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
  });
});

describe("prototype honesty", () => {
  it("never claims a connected source or a configured tool link", () => {
    expect(SOURCE_GROUPS.every((g) => g.state === "not-connected")).toBe(true);
    expect(TOOLS.every((tool) => tool.url === null)).toBe(true);
  });

  it("marks every transcript line as fictional in every language", () => {
    for (const session of SESSIONS) {
      for (const line of session.transcript) {
        expect(line.text.en.startsWith("[Fictional]")).toBe(true);
        expect(line.text.de.startsWith("[Fiktiv]")).toBe(true);
        expect(line.text.it.startsWith("[Fittizio]")).toBe(true);
      }
    }
  });

  it("contains no URLs, e-mail addresses or phone-like numbers in fixture text", () => {
    const corpus = JSON.stringify({ SESSIONS, EVENTS, TOOLS });
    expect(corpus).not.toMatch(/https?:\/\//);
    expect(corpus).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(corpus).not.toMatch(/\+\d{2}|\d{9,}/); // international prefix or long digit runs (ISO dates stay allowed)
  });
});

describe("cross-module consistency", () => {
  it("a session that also appears in the calendar has the same date there", async () => {
    const { SESSIONS } = await import("./sessions");
    const { EVENTS } = await import("./calendar");
    const workshop02 = SESSIONS.find((s) => s.id === "workshop-02")!;
    const event = EVENTS.find((e) => e.id === "e-workshop-02")!;
    expect(workshop02.date).toBe(event.date);
    expect(workshop02.start).toBe(event.start);
  });
});
