#!/usr/bin/env node
/**
 * Validates the machine-readable Meta/Instagram research artefacts.
 *
 * Checks performed:
 *   1. the JSON artefact parses;
 *   2. the minimal scope set is exactly the two read-only scopes;
 *   3. no excluded scope leaked into the minimal set;
 *   4. the official webhook field list contains no new-post / media / feed field;
 *   5. every test id in the JSON also appears in the Markdown test matrix;
 *   6. every primary source URL in the JSON also appears in the Markdown source register;
 *   7. all 14 mandatory Markdown sections are present;
 *   8. no live-API success is claimed anywhere while meta_developer_access_available is false;
 *   9. every test carries a status from the declared vocabulary.
 *
 * Run: node scripts/validate-ig-research.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "docs/research/2026-10-13-meta-instagram-api-approval.json");
const mdPath = join(root, "docs/research/2026-10-13-meta-instagram-api-approval.md");

const failures = [];
const passes = [];

function check(name, ok, detail = "") {
  if (ok) passes.push(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// 1. JSON parses
let doc;
try {
  doc = JSON.parse(readFileSync(jsonPath, "utf8"));
  passes.push("JSON parses");
} catch (err) {
  console.error(`FAIL: JSON does not parse — ${err.message}`);
  process.exit(1);
}

const md = readFileSync(mdPath, "utf8");

// 2 + 3. minimal scope set
const expected = ["instagram_business_basic", "instagram_business_manage_insights"];
const actual = doc.minimal_scope_set?.scopes ?? [];
check(
  "minimal scope set is exactly the two read-only scopes",
  JSON.stringify(actual) === JSON.stringify(expected),
  `got ${JSON.stringify(actual)}`,
);
const excluded = Object.keys(doc.minimal_scope_set?.deliberately_excluded ?? {});
const leaked = excluded.filter((s) => actual.includes(s));
check("no excluded scope leaked into the minimal set", leaked.length === 0, `leaked: ${leaked.join(", ")}`);

// 4. no webhook for new posts
const fields = doc.live_feed?.available_webhook_fields ?? [];
check("webhook field list is non-empty", fields.length > 0, `${fields.length} fields`);
check(
  "official_webhook_for_new_posts is false",
  doc.live_feed?.official_webhook_for_new_posts === false,
  String(doc.live_feed?.official_webhook_for_new_posts),
);
const forbidden = fields.filter((f) => /^(media|feed|posts|new_media|published)$/.test(f));
check("no new-post webhook field in the official list", forbidden.length === 0, `found: ${forbidden.join(", ")}`);

// 5. every test id appears in the Markdown matrix
const tests = doc.tests ?? [];
check("test list is non-empty", tests.length > 0, `${tests.length} tests`);
const missingTests = tests.filter((t) => !md.includes(`| ${t.id} |`)).map((t) => t.id);
check(
  "every test id appears in the Markdown test matrix",
  missingTests.length === 0,
  `missing: ${missingTests.join(", ")}`,
);

// 6. every primary source URL appears in the Markdown
const sources = doc.sources_primary ?? [];
check("primary source list is non-empty", sources.length > 0, `${sources.length} sources`);
const missingSources = sources.filter((s) => !md.includes(s.url)).map((s) => s.id);
check(
  "every primary source URL appears in the Markdown",
  missingSources.length === 0,
  `missing: ${missingSources.join(", ")}`,
);

// 7. all 14 mandatory sections present
const sectionTitles = [
  "Executive Decision",
  "Zwei-Szenarien-Matrix",
  "Meta-App-Registrierungscheckliste",
  "Permission-Matrix",
  "App-Review-Gates",
  "Live-Feed-Architektur",
  "Video-Verfügbarkeitsanalyse",
  "Security- und Privacy-Konzept",
  "MVP-Implementierungsbrief",
  "Reviewer-Nachweispaket",
  "Testmatrix",
  "Kompakter nächster Slice",
  "Quellenregister",
  "Maschinenlesbares JSON",
];
const missingSections = sectionTitles.filter((t) => !md.includes(t));
check(
  "all 14 mandatory Markdown sections are present",
  missingSections.length === 0,
  `missing: ${missingSections.join(", ")}`,
);

// 8. no live-API success claimed without Meta access
const claimsLiveSuccess = doc.meta?.live_api_test_performed === true;
const claimsNoAccess = doc.meta?.meta_developer_access_available === false;
check(
  "no live-API success claimed while Meta access is unavailable",
  !(claimsLiveSuccess && claimsNoAccess),
);
const testedOkWithoutAccess = tests.filter((t) => t.status === "TESTED_OK" && claimsNoAccess);
check(
  "no test marked TESTED_OK while Meta access is unavailable",
  testedOkWithoutAccess.length === 0,
  `ids: ${testedOkWithoutAccess.map((t) => t.id).join(", ")}`,
);
check(
  "Markdown states no API call was executed",
  md.includes("kein einziger echter API-Call ausgeführt"),
);

// 9. every test carries a declared status
const vocabulary = new Set(doc.status_tags?.vocabulary ?? []);
const badStatus = tests.filter((t) => !vocabulary.has(t.status));
check(
  "every test carries a declared status",
  badStatus.length === 0,
  `invalid: ${badStatus.map((t) => `${t.id}=${t.status}`).join(", ")}`,
);

// gate vocabulary check
const gateVocabulary = new Set(doc.status_tags?.gate_vocabulary ?? []);
const allGates = [
  ...(doc.app_review_gates?.ana_pilot ?? []),
  ...(doc.app_review_gates?.multi_creator ?? []),
].map((g) => g.gate);
const badGates = [...new Set(allGates)].filter((g) => !gateVocabulary.has(g));
check(
  "every gate uses the declared gate vocabulary",
  badGates.length === 0,
  `invalid: ${badGates.join(", ")}`,
);

console.log(`PASS ${passes.length}  FAIL ${failures.length}`);
for (const p of passes) console.log(`  ok   ${p}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
