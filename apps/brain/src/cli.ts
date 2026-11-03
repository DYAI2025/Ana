#!/usr/bin/env node
import { DashboardToken, KeyStore } from "./auth/keys.js";
import { revokeActor } from "./auth/oauth.js";
import { cliVault } from "./cli-vault.js";
import { loadConfig } from "./config.js";
import { HUMANS, type SourceBlock } from "./contract/schema.js";
import { registerDriveSource } from "./drive/register.js";
import { driveFromConfig, requireDrive } from "./drive/setup.js";
import { createApp } from "./http/app.js";
import { Indexer } from "./index/indexer.js";
import { OllamaEmbedder } from "./index/ollama.js";
import { QdrantStore } from "./index/qdrant.js";
import { vaultStats } from "./stats.js";

const USAGE = [
  "usage: ana-brain <serve | index [--full] | validate | issue-key <ana|ben|vince|agent:name> | revoke-key <ana|ben|vince|agent:name> | issue-dashboard-token | stats",
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
  const cfg = loadConfig();
  if (cmd === "drive-list") {
    const drive = requireDrive(cfg);
    for (const f of await drive.list(rest[0] ?? cfg.driveRootId)) console.log(JSON.stringify(f));
    return 0;
  }
  if (cmd === "issue-key") {
    const actor = rest[0];
    if (!actor) throw new Error("issue-key requires an actor (ana|ben|vince|agent:<name>)");
    process.stdout.write(`${new KeyStore(cfg.stateDir).issue(actor)}\n`);
    console.error(`Issued key for ${actor}. It is shown once; only its hash is stored.`);
    return 0;
  }
  if (cmd === "revoke-key") {
    const actor = rest[0] ?? "";
    const { keys, tokens } = revokeActor(cfg.stateDir, actor);
    console.log(`revoked ${keys} key(s) and ${tokens} OAuth token(s) of ${actor}; effective at the next request, no restart needed`);
    return 0;
  }
  if (cmd === "issue-dashboard-token") {
    process.stdout.write(`${new DashboardToken(cfg.stateDir).issue()}\n`);
    console.error("Issued dashboard token. It is shown once; only its hash is stored (BRAIN_DASHBOARD_TOKEN_SHA256 overrides it).");
    return 0;
  }
  const vault = cliVault(cfg.vaultDir, cmd);
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
    const dangling = vault.referenceErrors();
    for (const e of dangling) console.error(e);
    const errors = vault.loadErrors.length + dangling.length;
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
    console.log(JSON.stringify(vaultStats(vault), null, 2));
    return 0;
  }
  if (cmd === "serve") {
    // notes that fail to load are left out of MCP and /projection: say so in the journal at start
    for (const e of vault.loadErrors) console.error(`vault: ${e.file} failed to load and is not served: ${e.error}`);
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
