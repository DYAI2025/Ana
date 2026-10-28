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
