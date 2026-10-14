# ANA-38 — Fail-first and canary evidence

A gate is trusted only after it has been seen failing on code that has the defect.

## Fail-first (test written and run red before the implementation)

| Gate | Red run | Green |
|---|---|---|
| Worker: concurrent callbacks of one invitation (PR #10, `329590a`) | two interleaved callbacks returned `[200, 200]` | exactly one 200, the other 410; stored token is the winner's |
| Worker: 7 `social snapshot` tests (`47f1f6c`) | 7 of 7 failed before `/internal/social-snapshot` existed (37 existing passed) | 44 / 44 |

## Canaries (behaviour broken on purpose, file restored, `cmp` clean afterwards)

The dashboard tests were written after the code, so each was checked by sabotage:

| Sabotage | Expected | Result |
|---|---|---|
| normalizer turns a missing value into `0` (`value: v ?? 0`) | unit red | 1 failed / 216 |
| analysis groups all formats together | unit red | 2 failed / 216 |
| maturity gate removed (young posts compared) | unit red | 4 failed / 216 |
| failed refresh returns the old snapshot as current (`stale: false`) | unit red | 1 failed / 216 |
| permission failure hidden behind the cached snapshot | unit red | 1 failed / 216 |
| Topbar live-Instagram label disabled | e2e AC2/AC12 red | 1 failed |
| client bundle contains `SOCIAL_IG_INTERNAL_READ_KEY` and `/internal/social-snapshot` | `scan:bundle` exit 1 | 2 hits, exit 1; clean build: 0 hits, exit 0 |
| worker: missing insight value as `0` | worker red | 2 failed |
| worker: paging URL added to the output | worker red | 1 failed |
| worker: both sub-request budget layers removed | worker red | 1 failed (one layer alone keeps it green: each layer is sufficient) |
| DRS validator over a contract without `r2g` | non-zero exit | exit 1 (by crash, `KeyError`, not a clean validation message) |

## Contrast gate: SVG text

The pixel-contrast gate hides text with `color: transparent`. SVG text painted with `fill` stayed visible and was measured
against itself (1.00:1). Cockpit SVG text now paints with `fill: currentColor`, so the gate hides and measures it like HTML
text. The real failures it then found (muted 11 px text, gauge readout over the arc, unstyled segment buttons) were fixed;
all 5 cockpit states pass at 1440, 1280 and 1024.
