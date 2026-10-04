# ANA-4 — Fail-first evidence for the added gates

A gate is only trusted after it has been seen failing on code that has the defect. Each row is a measured run of the
**current** spec file against an **older commit** of this branch (checked out in a throwaway clone, spec copied in).

| Gate | Run against | Result on the old code | Result at the PR head |
|---|---|---|---|
| `e2e/contrast.spec.ts` (19 states × 1440/1280/1024) | `1816322` (before the contrast fix) | 57 of 57 tests failed; 172 distinct text runs below WCAG AA, worst 1.54:1 | all pass |
| `e2e/regressions.spec.ts` — 11 round-1 tests | `1816322` | 11 of 11 failed (the lens/search test only after it was strengthened to wait past the close animation; the weak first version passed and was replaced) | all pass |
| `e2e/regressions.spec.ts` — 8 round-2 tests | `3e83927` (round-1 head) | 8 of 8 failed; the 11 round-1 tests passed there, as they should | all pass |
| `e2e/regressions.spec.ts` — 7 round-3 tests | `4dc5ec4` (round-2 head) | 6 of 7 failed. The seventh ("a missing time focuses and marks the time field") passed there: round 2 already fixed that behaviour and review only reported the missing test, so it is a coverage test, not a fail-first test | all pass |
| `e2e/review-fixes.spec.ts` — Enterprise Code Review findings ANA-19/20/21 (9 tests) | `822c802` (PR #2 head reviewed) | 4 of 9 failed, each for the reported defect: focus left the still-mounted aria-modal lens during its exit animation (ANA-19); Toolbox action announced `aria-disabled` while operable, twice (ANA-20); combobox reported `aria-expanded=false` with zero results (ANA-21). The other 5 (stacked Escape, reduced-motion close, double close request, expanded with results, closed state) passed there: they guard behaviour that was already correct | all pass; ANA-19 tests 40/40 with `--repeat-each 10` |
| canaries in the working tree (reverted, `git diff` empty afterwards) | owner filter returning every ticket; Community card moved onto Knowledge; reduced-motion hook forced off | unit filter test, Board journey, `now` overlap check at 1440 and 1280, reduced-motion check failed | all pass |

Not shown failing on purpose: the 1024 `now` overlap check stayed green in the overlap canary because the 1024 layout
has its own grid placement (the sabotaged rule did not apply there).
