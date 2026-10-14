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

## Review round 1 (PR #11, 37 confirmed findings)

An independent read-only review (5 dimensions, each finding adversarially verified) confirmed 1 BLOCKER, 19 MAJOR and
17 MINOR findings. The BLOCKER — the live proof screenshotted real captions and thumbnails — was closed by deleting those
files (they never entered the repository) and by a live spec that refuses to run without an out-of-repo evidence
directory, blanks every caption and thumbnail before any screenshot and asserts that none is visible.

Worker fixes were test-first (5 tests red before the change, 47 / 47 after). Dashboard fixes, each checked by sabotage:

| Sabotage | Result |
|---|---|
| high-intent index without its own n ≥ 5 gate | 1 failed / 45 |
| hidden winner gated on all posts with reach instead of the compared posts | 1 failed / 45 |
| a post exactly at the median counted as supporting | 1 failed / 45 |
| H1/H4 lean computed on overlapping posts | 1 failed / 45 |
| save call to action used as a theme keyword | 1 failed / 45 |
| failing worker re-called inside the minimum interval | 1 failed / 45 |
| cross-site request check removed | 1 failed / 45 |
| VIDEO without product type treated as a comparable format | 1 failed / 45 |

e2e: under a machine load average of ~94 the 1.5 s e2e worker timeout made the fake worker look down (the cockpit
correctly showed ERROR); the e2e timeout is now 5 s. The Brain canvas journey and its contrast state failed locally
under the same load; they do not touch any changed file and are judged by CI on an unloaded runner.
