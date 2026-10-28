import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { describe, expect, it } from "vitest";
import { KeyStore, sha256hex } from "../src/auth/keys.js";
import { BrainOAuthProvider } from "../src/auth/oauth.js";
import { tmpDir } from "./helpers.js";

type NewClient = Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">;
const client = (name: string): NewClient => ({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: name, token_endpoint_auth_method: "none" });
const stored = (stateDir: string) => JSON.parse(readFileSync(path.join(stateDir, "oauth.json"), "utf8")) as { clients: Record<string, OAuthClientInformationFull>; tokens: Record<string, unknown> };

// /register is public and needs no credential: the registry must stay bounded
describe("OAuth client registry", () => {
  it("refuses oversized client metadata", async () => {
    const stateDir = tmpDir("state-");
    const p = new BrainOAuthProvider(stateDir, new KeyStore(stateDir));
    await expect(Promise.resolve().then(() => p.clientsStore.registerClient!(client("x".repeat(9000))))).rejects.toThrow(InvalidClientMetadataError);
    await expect(Promise.resolve().then(() => p.clientsStore.registerClient!({ ...client("ok"), jwks: { keys: ["k".repeat(9000)] } } as NewClient))).rejects.toThrow(InvalidClientMetadataError);
  });

  it("keeps at most 100 clients by forgetting the oldest idle ones, never one that holds a live token", async () => {
    const stateDir = tmpDir("state-");
    const keys = new KeyStore(stateDir);
    const key = keys.issue("ben");
    const p = new BrainOAuthProvider(stateDir, keys);
    const first = await p.clientsStore.registerClient!(client("c-with-token"));
    const s = stored(stateDir);
    s.tokens.t = { kind: "access", actor: "ben", key_sha256: sha256hex(key), client_id: first.client_id, scopes: ["brain"], expires_at: Math.floor(Date.now() / 1000) + 3600 };
    writeFileSync(path.join(stateDir, "oauth.json"), JSON.stringify(s));
    for (let i = 0; i < 130; i++) await p.clientsStore.registerClient!(client(`c${i}`));
    const names = Object.values(stored(stateDir).clients).map((c) => c.client_name);
    expect(names).toHaveLength(100);
    expect(names).toContain("c-with-token");
    expect(names).toContain("c129");
    expect(names).not.toContain("c0");
  });
});
