// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The bundle scan is a release gate (ANA-5/38 AC9, ANA-35 AC13): it has to fail on every credential it claims to catch.
const SCRIPT = fileURLToPath(new URL("../../scripts/scan-client-bundle.mjs", import.meta.url));

function build(chunk: string | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), "scan-bundle-"));
  if (chunk !== null) {
    mkdirSync(path.join(dir, "static", "chunks"), { recursive: true });
    writeFileSync(path.join(dir, "static", "chunks", "app.js"), `console.log("ok");${chunk}`);
  }
  return dir;
}

function scan(dir: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" as const, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const BRAIN_SHAPE = `anad_${"Q".repeat(43)}`;
const KEY_SHAPE = `anab_${"Z".repeat(43)}`;

describe("scan-client-bundle", () => {
  it.each(["WORLD_ANALYST_ANTHROPIC_API_KEY", "WORLD_ANALYST_OPENAI_API_KEY", "WORLD_ANALYST_OPENROUTER_API_KEY"])("fails on the configured value of %s without printing it, and only then", (name) => {
    const value = "plain-looking-value-0001";
    const dir = build(`const x=${JSON.stringify(value)};`);
    expect(scan(dir).status).toBe(0);
    const r = scan(dir, { [name]: value });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`configured ${name} value`);
    expect(r.out).not.toContain(value);
  });

  it("passes a clean bundle and refuses an empty build", () => {
    expect(scan(build("")).status).toBe(0);
    expect(scan(build(null)).status).toBe(2);
  });

  it.each([
    ["BRAIN_API_TOKEN variable name", "process.env.BRAIN_API_TOKEN"],
    ["e2e fake brain token", "e2e-fake-brain-token"],
    ["ANA Brain token shape", BRAIN_SHAPE],
    ["ANA Brain token shape", KEY_SHAPE],
    ["JIRA_API_TOKEN variable name", "JIRA_API_TOKEN"],
    // ANA-48: every internal worker read contract, not only the snapshot
    ["worker internal path", "/internal/social-snapshot"],
    ["worker internal path", "/internal/social-pulse"],
    ["worker internal path", "/internal/social-audience"],
    // ANA-48 looks: the vision model key stays on the server
    ["ANTHROPIC_API_KEY variable name", "process.env.ANTHROPIC_API_KEY"],
    ["Anthropic API key shape", "sk-ant-" + "x".repeat(40)],
    ["Anthropic API endpoint", "https://api.anthropic.com/v1/messages"],
    // ANAK-3: the analyst's names, keys and hosts stay on the server
    ["WORLD_ANALYST_* variable name", "process.env.WORLD_ANALYST_OPENAI_API_KEY"],
    ["WORLD_ANALYST_* variable name", "WORLD_ANALYST_PROVIDER"],
    ["provider API key shape", "sk-proj-" + "x".repeat(40)],
    ["provider API key shape", "sk-or-v1-" + "x".repeat(40)],
    ["OpenAI API endpoint", "https://api.openai.com/v1/chat/completions"],
    ["OpenRouter API endpoint", "https://openrouter.ai/api/v1/chat/completions"],
    ["e2e fake analyst key", "e2e-fake-analyst-key"],
  ])("fails on %s without printing the value", (rule, canary) => {
    const r = scan(build(`const x=${JSON.stringify(canary)};`));
    expect(r.status).toBe(1);
    expect(r.out).toContain(`HIT ${rule}`);
    if (canary.length > 20) expect(r.out).not.toContain(canary);
  });

  it("fails on the configured BRAIN_API_TOKEN value", () => {
    const value = "configured-brain-value-7f3a9c";
    const r = scan(build(`const t="${value}";`), { BRAIN_API_TOKEN: value });
    expect(r.status).toBe(1);
    expect(r.out).toContain("HIT configured BRAIN_API_TOKEN value");
    expect(r.out).not.toContain(value);
    expect(scan(build(""), { BRAIN_API_TOKEN: value }).status).toBe(0);
  });
});
