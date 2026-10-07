#!/usr/bin/env node
import { DashboardToken, KeyStore } from "./auth/keys.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { Indexer, loadState } from "./index/indexer.js";
import { OllamaEmbedder } from "./index/ollama.js";
import { QdrantStore } from "./index/qdrant.js";
import { Vault } from "./vault/vault.js";

const USAGE = "usage: ana-brain <serve | index [--full] | validate | issue-key <ana|ben|vince> | issue-dashboard-token | stats>";

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(USAGE);
    return cmd ? 0 : 2;
  }
  const cfg = loadConfig();
  if (cmd === "issue-key") {
    const actor = rest[0];
    if (!actor) throw new Error("issue-key requires an actor (ana|ben|vince)");
    process.stdout.write(`${new KeyStore(cfg.stateDir).issue(actor)}\n`);
    console.error(`Issued key for ${actor}. It is shown once; only its hash is stored.`);
    return 0;
  }
  if (cmd === "issue-dashboard-token") {
    process.stdout.write(`${new DashboardToken(cfg.stateDir).issue()}\n`);
    console.error("Issued dashboard token. It is shown once; only its hash is stored (BRAIN_DASHBOARD_TOKEN_SHA256 overrides it).");
    return 0;
  }
  const vault = new Vault(cfg.vaultDir);
  if (cmd === "validate") {
    for (const e of vault.loadErrors) console.error(`${e.file}: ${e.error}`);
    const ids = new Set(vault.all().map((n) => n.fm.id));
    let dangling = 0;
    const report = (msg: string) => {
      dangling++;
      console.error(msg);
    };
    for (const n of vault.all()) {
      for (const r of n.fm.relations) if (!ids.has(r.target)) report(`${n.fm.id}: relation target missing: ${r.target}`);
      for (const s of n.fm.source_refs) if (!ids.has(s.source)) report(`${n.fm.id}: source missing: ${s.source}`);
      if (n.fm.superseded_by && !ids.has(n.fm.superseded_by)) report(`${n.fm.id}: superseded_by missing`);
    }
    const errors = vault.loadErrors.length + dangling;
    console.log(`${vault.all().length} valid notes, ${errors} error(s)`);
    return errors ? 1 : 0;
  }
  const embedder = new OllamaEmbedder(cfg.ollamaUrl);
  const store = new QdrantStore(cfg.qdrantUrl, undefined, cfg.qdrantApiKey);
  if (cmd === "index") {
    const stats = await new Indexer(vault, embedder, store).run({ full: rest.includes("--full") });
    console.log(JSON.stringify(stats));
    return 0;
  }
  if (cmd === "stats") {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const n of vault.all()) {
      byType[n.fm.type] = (byType[n.fm.type] ?? 0) + 1;
      byStatus[n.fm.status] = (byStatus[n.fm.status] ?? 0) + 1;
    }
    const st = loadState(vault.root);
    console.log(JSON.stringify({ notes: vault.all().length, invalid: vault.loadErrors.length, byType, byStatus, indexed: st ? Object.keys(st.notes).length : 0, embed_model: st?.embed_model ?? null }, null, 2));
    return 0;
  }
  if (cmd === "serve") {
    const app = createApp({ vault, embedder, store, stateDir: cfg.stateDir, publicUrl: cfg.publicUrl, dashboardTokenSha256: cfg.dashboardTokenSha256 });
    await new Promise<void>((resolve) => app.listen(cfg.port, cfg.host, () => resolve()));
    console.log(`ana-brain listening on ${cfg.host}:${cfg.port}`);
    return -1;
  }
  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exit(1);
  },
);
