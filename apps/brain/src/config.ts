import path from "node:path";

export interface Config {
  vaultDir: string;
  stateDir: string;
  ollamaUrl: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
  publicUrl: string;
  dashboardTokenSha256?: string;
  port: number;
  host: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const vaultDir = env.BRAIN_VAULT_DIR;
  if (!vaultDir) throw new Error("BRAIN_VAULT_DIR is required");
  return {
    vaultDir: path.resolve(vaultDir),
    stateDir: path.resolve(env.BRAIN_STATE_DIR ?? path.join(vaultDir, "..", "ana-brain-state")),
    ollamaUrl: env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    qdrantUrl: env.QDRANT_URL ?? "http://10.0.4.2:6333",
    qdrantApiKey: env.QDRANT_API_KEY || undefined,
    publicUrl: env.BRAIN_PUBLIC_URL ?? "https://mcp.ana.dyai.cloud",
    dashboardTokenSha256: env.BRAIN_DASHBOARD_TOKEN_SHA256 || undefined,
    port: Number(env.PORT ?? 8790),
    host: env.HOST ?? "127.0.0.1",
  };
}
