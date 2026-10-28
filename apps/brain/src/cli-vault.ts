import { Vault } from "./vault/vault.js";

/**
 * The vault a CLI command works on. `serve` writes on behalf of authenticated MCP callers; every other command is an
 * operator on the host, so what it writes (`drive-register`) is a manual record, never one that claims to be MCP.
 */
export function cliVault(dir: string, cmd: string): Vault {
  return new Vault(dir, { method: cmd === "serve" ? "mcp" : "manual" });
}
