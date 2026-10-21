# ANA-40 — Fail-first and canary evidence

A test is trusted only after it has been seen failing on code that has the defect. Test names are quoted without the
`health: ` prefix; numbers are omitted because they shift as tests are added.

## Fail-first (new tests run against the base implementation)

Both runs used the new `test/worker.test.mjs` (68 tests at that point) with `src/` of base `c7b2c06`:

| Run | Setup | Result |
|---|---|---|
| A | base `src/`, migrations without `0002_token_health.sql` | 18 failed / 68: every new test except "no new trigger …" |
| B | base `src/`, migrations with `0002_token_health.sql` | 16 failed / 68: as A, minus "migrations apply in file order …" (needs 0002, green once it exists) and "a refresh result for the old token …" (the base already guards the refresh write) |

Tests that are green on the base by design were proven by a canary instead (below): "no new trigger …" (M11),
"migrations apply in file order …" (red in run A), "a refresh result for the old token …" (red in run A, M2, M3, M15),
and "a failed refresh never reverts a REAUTH_REQUIRED set for the same token meanwhile", added after the implementation
(M7).

## Canaries (behaviour broken on purpose, file restored, sha256 checked afterwards)

Run on the final implementation, 69 tests, with `npm test` per mutation. Each mutation replaces exactly one pattern
(two for M14) and the runner refuses a pattern that does not occur exactly once.

| Mutation | Red (target) |
|---|---|
| M1 `/me` health write not bound to the checked ciphertext | "a /me result for the old token never touches a token re-authorized during the Meta call" |
| M2 refresh failure write (`mark`) not bound to the ciphertext | "a refresh result for the old token …"; existing "expired token is marked REAUTH_REQUIRED, but a concurrent re-authorization is never clobbered" |
| M3 refresh success write not bound to the ciphertext | "a refresh result for the old token …"; existing "a successful refresh never overwrites a token re-authorized concurrently" |
| M4 36 h boundary `>` instead of `>=` | "36 h boundary …"; "persistent UNVERIFIABLE turns UNVERIFIED …" |
| M5 cron calls `/me` after every refresh result | "Meta 190 at /me …"; "Meta 190 at a refresh-day refresh …"; "an expired token …"; "refresh day makes exactly one Meta call …"; "a refresh result for the old token …" |
| M6 callback `ON CONFLICT` path does not reset health | "a successful OAuth callback is fresh at once …" |
| M7 failed refresh writes the stale status back (base behaviour) | "a failed refresh never reverts a REAUTH_REQUIRED …" |
| M8 late `/me` result not limited to a `CONNECTED` row | "a late /me OK never revives a row …" |
| M9 code 190 at `/me` classified as UNVERIFIABLE | "Meta 190 at /me …"; "status contract …" |
| M10 `/me` accepts any `user_id` | "a different, missing or numeric user_id at /me …" |
| M11 a second cron trigger in `wrangler.toml` | "no new trigger …" |
| M12 status ignores freshness (base behaviour) | "cron /me OK …"; "36 h boundary …"; "persistent UNVERIFIABLE …"; "a successful POST /admin/refresh …"; "UNVERIFIED does not block reads …" |
| M13 Meta calls without the 10 s timeout signal | "cron /me OK …" (asserts the `AbortSignal` on the `/me` call) |
| M14 callback health reset moved to a separate, non-atomic `UPDATE` after the batch | "a successful OAuth callback is fresh at once …" (the one token write runs inside the batch and carries the reset) |
| M15 cron calls `/me` after a lost refresh write (`CONCURRENT_UPDATE`) | "a refresh result for the old token …" (asserts the call list is only the refresh) |

Every mutation turned at least its target red; all 15 left `src/index.mjs` and `wrangler.toml` byte-identical after
restore. M13–M15 and the assertions they kill were added after an adversarial review found them missing.

A first version of M7 replaced the call with `'CONNECTED'` inside a single-quoted string; the syntax error crashed the
whole file, which looks like a kill but proves nothing. It was replaced by the base call
`mark(reauth?'REAUTH_REQUIRED':row.connection_status, …)`, which turned only its target red.

## Migration backward compatibility (R2G 4)

`docs/evidence/ANA-40/backcompat-check.sh` carries its own canaries and exits 2 when one of them does not fail: a changed
0001; six forbidden 0002 forms (NOT NULL, DEFAULT, CHECK, UPDATE, TRIGGER, DROP); and a 0002 that drops
`last_refresh_error`, which must turn the base suite red. Its output on the candidate SHA is recorded with the R2G
evidence.
