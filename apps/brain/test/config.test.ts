import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const ENV_EXAMPLE = path.join(import.meta.dirname, "..", "deploy", "env.example");

describe("config", () => {
  it("empty settings fall back to the safe defaults, never all interfaces on a random port (B-8)", () => {
    const cfg = loadConfig({ BRAIN_VAULT_DIR: "/srv/v", BRAIN_STATE_DIR: "", OLLAMA_URL: "", QDRANT_URL: "", BRAIN_PUBLIC_URL: "", PORT: "", HOST: "" });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(8790);
    expect(cfg.stateDir).toBe(path.resolve("/srv/ana-brain-state"));
    expect(cfg.ollamaUrl).toBe("http://127.0.0.1:11434");
    expect(cfg.qdrantUrl).toMatch(/^http:\/\//);
    expect(cfg.publicUrl).toBe("https://mcp.ana.dyai.cloud");
  });

  it("every line of deploy/env.example kept empty still binds 127.0.0.1:8790", () => {
    const keys = readFileSync(ENV_EXAMPLE, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=$/.exec(l.trim())?.[1]).filter((k): k is string => !!k);
    expect(keys).toEqual(expect.arrayContaining(["HOST", "PORT", "OLLAMA_URL", "QDRANT_URL", "BRAIN_PUBLIC_URL"]));
    const env = Object.fromEntries(keys.map((k) => [k, ""]));
    const cfg = loadConfig({ ...env, BRAIN_VAULT_DIR: "/srv/v" });
    expect([cfg.host, cfg.port]).toEqual(["127.0.0.1", 8790]);
  });

  it("refuses a PORT that is not a TCP port", () => {
    for (const PORT of ["abc", "0", "70000", "80.5"]) expect(() => loadConfig({ BRAIN_VAULT_DIR: "/srv/v", PORT }), PORT).toThrow(/PORT/);
    expect(loadConfig({ BRAIN_VAULT_DIR: "/srv/v", PORT: "8791", HOST: "10.0.0.5" })).toMatchObject({ port: 8791, host: "10.0.0.5" });
  });
});
