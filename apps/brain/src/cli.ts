#!/usr/bin/env node
import { spawn } from "node:child_process";
import { DashboardToken, KeyStore } from "./auth/keys.js";
import { loadConfig } from "./config.js";
import { HUMANS, type SourceBlock } from "./contract/schema.js";
import { runConsent } from "./drive/consent.js";
import { registerDriveSource } from "./drive/register.js";
import { driveFromConfig, requireDrive } from "./drive/setup.js";
import { createApp } from "./http/app.js";
import { Indexer, loadState } from "./index/indexer.js";
import { OllamaEmbedder } from "./index/ollama.js";
import { QdrantStore } from "./index/qdrant.js";
import { Vault } from "./vault/vault.js";

const USAGE = [
  "usage: ana-brain <serve | index [--full] | validate | issue-key <ana|ben|vince> | issue-dashboard-token | stats",
  "  | drive-auth --client <client_secret.json> --out <file> [--force]",
  "  | drive-list [folderId]",
  "  | drive-register <fileId> --id <src-id> --title <title> --actor <ana|ben|vince> [--data-class G0..G3|UNKNOWN] [--access restricted|internal|public] [--topics a,b] [--workshops a,b]>",
].join("\n");

function flags(args: string[]): { pos: string[]; opt: Record<string, string | true> } {
  const pos: string[] = [];
  const opt: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      opt[a.slice(2)] = next;
      i++;
    } else opt[a.slice(2)] = true;
  }
  return { pos, opt };
}
const str = (v: string | true | undefined, name: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`missing --${name}`);
  return v;
};
const list = (v: string | true | undefined): string[] | undefined => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(USAGE);
    return cmd ? 0 : 2;
  }
  if (cmd === "drive-auth") {
    const { opt } = flags(rest);
    const out = str(opt.out, "out");
    const { scope } = await runConsent({
      clientFile: str(opt.client, "client"), outFile: out, force: opt.force === true,
      openUrl: (url) => {
        console.log(`Open this URL to grant read-only Drive access:\n${url}`);
        if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
      },
    });
    console.log(`saved refresh token to ${out}`);
    console.log(`granted scope: ${scope}`);
    return 0;
  }
  const cfg = loadConfig();
  if (cmd === "drive-list") {
    const drive = requireDrive(cfg);
    for (const f of await drive.list(rest[0] ?? cfg.driveRootId)) console.log(JSON.stringify(f));
    return 0;
  }
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
  if (cmd === "drive-register") {
    const { pos, opt } = flags(rest);
    const fileId = pos[0];
    if (!fileId) throw new Error("drive-register requires a Drive file id");
    const actor = str(opt.actor, "actor");
    if (!(HUMANS as readonly string[]).includes(actor)) throw new Error("--actor must be ana, ben or vince");
    const dataClass = typeof opt["data-class"] === "string" ? opt["data-class"] : "UNKNOWN";
    if (!["G0", "G1", "G2", "G3", "UNKNOWN"].includes(dataClass)) throw new Error("--data-class must be G0..G3 or UNKNOWN");
    const access = typeof opt.access === "string" ? opt.access : "restricted";
    if (!["restricted", "internal", "public"].includes(access)) throw new Error("--access must be restricted, internal or public");
    const fm = await registerDriveSource(vault, requireDrive(cfg), actor, {
      fileId, id: str(opt.id, "id"), title: str(opt.title, "title"),
      data_class: dataClass as SourceBlock["data_class"], access: access as SourceBlock["access"],
      topics: list(opt.topics), workshops: list(opt.workshops),
    });
    console.log(JSON.stringify({ created: fm.id, kind: fm.source?.kind, locator: fm.source?.locator, checksum: fm.source?.checksum ?? null }));
    return 0;
  }
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
    const app = createApp({ vault, embedder, store, drive: driveFromConfig(cfg), stateDir: cfg.stateDir, publicUrl: cfg.publicUrl, dashboardTokenSha256: cfg.dashboardTokenSha256 });
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
