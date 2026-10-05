#!/usr/bin/env node
/**
 * Fails when anything the browser receives contains a Jira credential (ANA-5 AC9 / DRS R2G gate 3).
 *
 * Scans the client bundle (.next/static) and the prerendered pages Next.js serves (.next/server/app/*.html|.rsc|.body).
 * Server-only chunks are not scanned: they legitimately reference process.env.JIRA_API_TOKEN by name.
 * Prints file names and counts only — never a matched value. Exit 0 = clean, 1 = hit, 2 = nothing to scan.
 *
 *   node scripts/scan-client-bundle.mjs [build-dir]   (default .next)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const build = process.argv[2] ?? ".next";
const token = process.env.JIRA_API_TOKEN?.trim();

const rules = [
  { name: "JIRA_API_TOKEN variable name", test: (text) => count(text, /JIRA_API_TOKEN/g) },
  { name: "JIRA_EMAIL variable name", test: (text) => count(text, /JIRA_EMAIL/g) },
  { name: "Basic authorization header", test: (text) => count(text, /Basic [A-Za-z0-9+/]{16,}={0,2}/g) },
  { name: "Atlassian API token shape", test: (text) => count(text, /ATATT[0-9A-Za-z_\-=]{20,}/g) },
  { name: "e2e fake token", test: (text) => count(text, /e2e-fake-token/g) },
  ...(token && token.length >= 8 ? [{ name: "configured JIRA_API_TOKEN value", test: (text) => text.split(token).length - 1 }] : []),
];

function count(text, re) {
  return (text.match(re) ?? []).length;
}

function walk(dir, accept) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full, accept) : accept(full) ? [full] : [];
  });
}

const files = [
  ...walk(path.join(build, "static"), () => true),
  ...walk(path.join(build, "server", "app"), (file) => /\.(html|rsc|body)$/.test(file)),
];

if (files.length === 0) {
  console.error(`scan-client-bundle: nothing to scan under ${build} — run a production build first`);
  process.exit(2);
}

let hits = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of rules) {
    const n = rule.test(text);
    if (n > 0) {
      hits += n;
      console.error(`HIT ${rule.name}: ${n}× in ${path.relative(process.cwd(), file)}`);
    }
  }
}

console.log(`scan-client-bundle: ${files.length} files, ${rules.length} rules${token ? " (incl. configured token value)" : ""}, ${hits} hits`);
process.exit(hits === 0 ? 0 : 1);
