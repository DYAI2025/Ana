#!/usr/bin/env node
// Installs apps/dashboard dependencies from its lockfile when they are missing or stale,
// so `npm run dev` works from a clean checkout as a single command.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "dashboard");
const lock = join(app, "package-lock.json");
const installed = join(app, "node_modules", ".package-lock.json");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`ANA dashboard needs Node.js >= 22.12 (found ${process.versions.node}).`);
  process.exit(1);
}

if (existsSync(installed) && statSync(installed).mtimeMs >= statSync(lock).mtimeMs) process.exit(0);

console.log("Installing dashboard dependencies (npm ci)…");
const result = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
