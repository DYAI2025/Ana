# ANA Instagram OAuth – isolated Cloudflare Worker

Status: **locally tested, not deployed**. Scope: single account `@anasavu`, Instagram API **with Instagram Login**, Standard Access, strictly read-only. No part of ANA LUMEN's localhost-only Next.js dashboard is deployed here.

## Architecture

Ana (remote, own device) -> time-limited invitation URL -> Worker `GET /instagram/start` (consent page) -> `POST /instagram/start` (sets browser-bound cookie, shows link) -> Instagram consent -> Worker `/instagram/callback` -> verify one-time `state` + HttpOnly cookie -> exchange short- to long-lived token -> verify exact account via `GET /me` `user_id` + `username` -> AES-256-GCM encrypt -> D1. A server (never a browser) can later call the protected `GET /internal/media`.

Only two scopes are requested: `instagram_business_basic`, `instagram_business_manage_insights`. **No messaging, publishing or comment permissions.** There is no token export endpoint.

## Identity: which ID goes into `EXPECTED_IG_USER_ID`

Meta's Instagram Login docs define, for `GET /me`:
- `user_id` — the Instagram **professional account ID** (`<IG_ID>`, usually `17841…`). **This is what the worker compares.**
- `id` — an **app-scoped** user ID. Not used for identity.

Set `EXPECTED_IG_USER_ID` to the professional account ID (Meta Dashboard → Instagram API → *Generate access tokens* → account row). IDs are compared as JSON **strings** only (17-digit values exceed JavaScript's safe-integer range); a numeric `user_id` is rejected.

## Repo integration

Lives in `DYAI2025/Ana/workers/instagram-oauth/`, separate from the dashboard. Do not add worker resources to the root package scripts. Keep secrets and user data out of the public repository.

## Read-only preflight (before any cloud write)

- Meta Dashboard: **Instagram API with Instagram Login**, Instagram App ID (NOT the Facebook App ID), `anasavu` tester accepted, exactly `instagram_business_basic` + `instagram_business_manage_insights`, `anasavu` is a Creator/Business account.
- Cloudflare: `npx wrangler whoami` shows the account that holds `dyai.cloud`; record plan type and the number of existing Cron Triggers (Free plan: max 5 per account).
- **`login.dyai.cloud` must have no DNS record and no Workers custom domain.** `wrangler deploy` in a non-interactive shell *overrides* existing records instead of prompting, so this check is mandatory before the first deploy.

## Local checks (no Cloudflare account needed)

Requires Node.js ≥ 22.13 (tests use `node:sqlite` to run the real migration SQL).

```sh
cd workers/instagram-oauth
npm install
npm run check      # syntax + unit/security tests (Meta mocked)
npm run validate   # wrangler dry-run build + D1 migration applied to a local database
```

Optional browser check: put **synthetic** values in `.dev.vars` (gitignored) with `PUBLIC_ORIGIN=https://localhost:8799`, then run `npx wrangler dev --local-protocol https --port 8799 --local-upstream localhost:8799`. Without `--local-upstream`, `wrangler dev` rewrites the `Origin` header to the configured route host, and the origin check rejects every POST. That is a local-dev artifact only.

## One-time Cloudflare setup — order matters

The **Human Gate** applies before steps 1–4: confirm account, plan and cost, and get operator approval.

1. **D1**: `npx wrangler d1 create ana_instagram_oauth` and paste the printed `database_id` into `wrangler.toml` (not secret). Then `npm run db:migrate` (tracked via `d1_migrations`).
2. **Deploy the fail-closed Worker first**: `npm run deploy`. Without secrets every route except `/healthz` returns `503 service-not-configured`. `wrangler.toml` pins: custom domain `login.dyai.cloud` only, `workers_dev = false`, `preview_urls = false`, no invocation logs, query strings redacted, no traces. Running `secret put` before the first deploy would make Wrangler create a stub Worker with platform defaults, so deploy first.
3. **Secrets**: generate three independent random values locally, then store them in a password manager. Do not print them or paste them into chat:
   - `ADMIN_API_KEY`, `INTERNAL_READ_KEY`: ≥ 32 characters each and different from each other (`openssl rand -base64 33`).
   - `AES_GCM_KEY_BASE64`: 32 bytes (`openssl rand -base64 32`).

   Then, in your own terminal, enter each value at Wrangler's prompt:

   ```sh
   npx wrangler secret put ADMIN_API_KEY
   npx wrangler secret put INTERNAL_READ_KEY
   npx wrangler secret put AES_GCM_KEY_BASE64
   npx wrangler secret put INSTAGRAM_APP_SECRET
   npx wrangler secret put INSTAGRAM_APP_ID
   npx wrangler secret put EXPECTED_IG_USER_ID      # professional account ID, see above
   npx wrangler secret put EXPECTED_IG_USERNAME     # anasavu
   npx wrangler secret put PUBLIC_ORIGIN            # https://login.dyai.cloud
   ```

   The worker stays `503` if any value is missing or weak: keys too short or identical, AES key not 32 bytes, origin not `https://` without a trailing slash.
4. **Verify**: `https://login.dyai.cloud/healthz` returns `{"ok":true,...}` over valid TLS. Admin routes without a bearer key return `401`. In the dashboard, Workers Logs shows no request URLs. The workers.dev hostname is disabled.
5. **Meta (human, browser)**: in Instagram API → Business Login settings, register the **exact** redirect URI `https://login.dyai.cloud/instagram/callback`. Do not switch the app to Live and do not request Advanced Access for this one-account pilot.

## Invitation (only when Ana is ready)

```sh
curl --fail-with-body -sS -X POST 'https://login.dyai.cloud/admin/invitations' \
  -H "Authorization: Bearer ${ANA_ADMIN_API_KEY}"
```

You get back a link valid for **30 minutes** that allows up to **3 attempts**. It is spent only when a token for the expected account has been stored. Send only the `url` to Ana. She should open it **in a browser (not inside the Instagram app)**, sign in as `@anasavu`, review the two permissions and accept. Each press of "Weiter" starts one attempt (so a double click uses two). A denial, the wrong account or an aborted attempt can be retried by reopening the same link. An attempt started within the 30 minutes may finish up to 10 minutes later. Once a token is stored, all other open attempts of that invitation are void. A different account can never be saved.

## Verification (Ben only)

```sh
H="Authorization: Bearer ${ANA_ADMIN_API_KEY}"
curl --fail-with-body -sS -H "$H" https://login.dyai.cloud/admin/status          # CONNECTED, expiry, permissions, last refresh error
curl --fail-with-body -sS -H "$H" https://login.dyai.cloud/admin/probe           # real media sample; caption_field ACCEPTED | REJECTED_BY_META
curl --fail-with-body -sS -H "$H" https://login.dyai.cloud/admin/insights-probe  # insights PASS | FAILED (reach, period=day)
```

Insights support may be claimed only after `insights-probe` returns `PASS` against the live account. Meta's IG Media reference marks `caption` as "Instagram API with Facebook Login only", so the media reads fall back to requesting no caption and report which outcome occurred.

`GET /internal/media?limit=1..25` uses the **separate** `INTERNAL_READ_KEY`. It is server-to-server only and must never appear in browser JavaScript or `NEXT_PUBLIC_*` variables. It returns the first page only.

## Security boundaries

- `/admin/*` uses a header-only bearer key with digest-based constant-time comparison. `/internal/media` uses its own key, and each key is rejected on the other's routes.
- `/instagram/start` requires a valid invitation (30 min, ≤ 3 attempts) and an exact `Origin` match on the POST. The consent page uses `Referrer-Policy: same-origin`, because with `no-referrer` browsers send `Origin: null`. The redirect to Instagram is a plain link, not a 303, because CSP `form-action 'self'` also applies to redirects of a form submission.
- `/instagram/callback` requires one-time `state` bound to a `__Secure-` HttpOnly SameSite=Lax cookie. A forged callback link (`?error=` or `?code=` without the matching state and cookie) neither cancels, consumes nor clears an attempt. The token is stored only after `user_id` and `username` match. Storing the token and spending the invitation commit in one D1 batch.
- Tokens are encrypted with AES-256-GCM using a random IV, and the ciphertext is bound to its `account_id` via AAD. If the key is lost, stored tokens become undecryptable. If it is changed, Ana must re-authorize.
- Graph calls pass the token via the documented `access_token` query parameter. The App Secret goes only to `api.instagram.com` and `graph.instagram.com`. Because Meta mandates query-string credentials, `wrangler.toml` disables invocation logs and traces and redacts query strings. The worker's own logs carry event names, error classes and non-secret metadata (expiry timestamps, granted scopes, refresh status, request path), never URLs, query strings, codes, tokens or secrets.
- Cron `0 5 * * *` refreshes tokens when ≤ 15 days remain (never before 24 h). A transient failure keeps the old token and records `last_refresh_error`. Meta error 190 (revoked) sets `REAUTH_REQUIRED`. Expired invitations and attempts are removed in FK-safe order.

## Tests / known limitations

`npm run check` runs Node's built-in tests against the real SQL schema with **mocked Meta responses**. It does **not** prove a Cloudflare deployment, the D1 remote, a live Meta OAuth login, captions or Insights. A real-browser run (Chromium, WebKit, Firefox) of the start → Instagram → callback leg covers only the denial path with Instagram intercepted. Still unverified live: graph version `v26.0` availability, caption availability, the Insights metric, behaviour when an Instagram-app universal link takes over the authorize URL (the cookie would not travel; Ana should use a browser), and refresh in production.

Not implemented: rate limiting on `/admin/*` (add a Cloudflare rate-limiting rule on the custom domain if needed) and encryption-key rotation.

## Rollback

1. Stop issuing invitations.
2. Remove the custom domain `login.dyai.cloud` from the Worker; the callback then stops working.
3. Optionally, have Ana remove the app in Instagram → Settings → Apps and websites.
4. Delete the Worker and the D1 database only with explicit approval.

Never delete the Meta app or other Workers.

## Closeout checklist

- [ ] PR merged after review; dashboard unchanged
- [ ] D1 created and migrated; keys stored outside Git
- [ ] Worker deployed on `login.dyai.cloud` only; TLS verified; workers.dev disabled; other Workers unchanged
- [ ] Exact redirect URI saved at Meta; 2 scopes confirmed
- [ ] Ana authorized remotely from her own session
- [ ] `/admin/status` shows `CONNECTED`; `/admin/probe` returns real media
- [ ] `/admin/insights-probe` `PASS` (or recorded `BLOCKED` with reason)
- [ ] Decision, evidence and maintainer recorded in ANA Jira/Confluence after actual success
