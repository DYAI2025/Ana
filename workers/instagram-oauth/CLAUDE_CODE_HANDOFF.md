# Claude Code implementation/deployment handoff — ANA Instagram OAuth

> Historical input brief (2026-10-14). Where it differs from `README.md`, the README is current:
> the independent review changed identity verification (`/me` `user_id`, not `id`), the start flow
> (link instead of 303 redirect), invitation consumption (spent only on success, max 3 attempts),
> and added `GET /admin/insights-probe`.

## Operator mission

Implement and deploy the isolated OAuth gateway for @anasavu using the attached, locally tested worker source. Own the technical lifecycle from reviewed code to Cloudflare and Meta readiness. Never expose ANA LUMEN's localhost-only dashboard, Jira credentials, or Instagram tokens. Work in `DYAI2025/Ana` and preserve its constraints.

## Input bundle

The accompanying ChatGPT artifact `ana-instagram-oauth-worker.zip` contains the complete working directory, `src/index.mjs`, `wrangler.toml`, D1 migration, Node tests and README. Copy files, not the zip itself, into the new `workers/instagram-oauth/` folder in a dedicated branch. Do not assume you can fetch a `sandbox:` URL from Claude Code directly; Ben must make the ZIP available in his local session.

## 0. Repo and provider reality check (read-only)

- Open project README and `PROJECT_GPT_ORIENTATION.md`; read canonical current state and current question files when present; inspect relevant Jira/Confluence requirements read-only if connected.
- Confirm repository `DYAI2025/Ana`, clean working tree and actual branch/head; preserve untracked work. Create a dedicated feature branch. No unrelated edits.
- Confirm Cloudflare `dyai.cloud` is active, `login.dyai.cloud` is still unoccupied, and the intended account/workspace is selected via `wrangler whoami`.
- Verify the real Meta Instagram App ID versus the *Facebook Meta App ID*; verify exactly the two permission scopes and accepted `anasavu` tester role. The current screenshot is historical and MUST NOT authorize assumptions about settings at deployment time.
- Read the current Meta Business Login guidance, including the authorization URL, scope grammar, code exchange and long-lived token endpoints. A prior project note dates to Oct 13 2026 and has NOT demonstrated a live API call.

## 1. Validate implementation before any cloud write

- Unpack into `workers/instagram-oauth` in the project.
- Run `npm install`, `npm run check`, and validate D1 migration and Worker deployment config with Wrangler dry-run when supported.
- Review callback authorization code, state/cookie binding, single-use and expiry, cross-account acceptance, token encryption, forced read-only scopes, and admin endpoint auth. Add adversarial tests for missing config, malformed callbacks, unauthorized access, replay, expired links, negative permission outcomes and token refresh errors.
- Pay particular attention to Meta response ID precision: user IDs can exceed JS's safe integer range, so never compare parsed JSON numbers as authoritative identities. Use `GET /me` string ID.
- Do not trust test mocks as evidence of a working Meta connection.
- If high-severity issues appear, **fix and rerun checks before deploying**. Do not edit dashboard code unless separately authorized.

## 2. Code persistence gate

- Prepare a small coherent PR with the isolated Worker, SQL schema, tests, setup docs and no secrets. Review for private data and accidental `.env` files. Do not merge without meeting the project's delivery policy.
- Record repo commit SHA and checks, distinguish mock results from production verification. If Jira is connected and there is an existing issue, attach evidence there; never invent an issue key.

## 3. Provision separately in existing Cloudflare account

**Human gate:** Before creating billable resources, adding DNS/domain or deploying public endpoints, confirm the intended account, estimated cost/tier and operator approval. The conversation authorizes implementation and overall setup but previous instructions require caution before live configuration.

- Create one D1 database named `ana_instagram_oauth` (if missing); do not reuse unrelated systems; apply `migrations/0001_init.sql` remotely.
- Replace the D1 `database_id` placeholder in `wrangler.toml`. Do not commit Cloudflare account tokens or API secrets.
- Deploy the new **isolated** worker `ana-instagram-oauth` without modifying existing Workers. Verify `/healthz` and that non-health endpoints fail closed until configured.
- Register only `login.dyai.cloud` as the custom domain if the hostname is still unoccupied, then verify HTTPS and TLS.
- Have Ben set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `EXPECTED_IG_USER_ID`, `EXPECTED_IG_USERNAME`, `PUBLIC_ORIGIN`, `AES_GCM_KEY_BASE64`, `ADMIN_API_KEY`, `INTERNAL_READ_KEY` via Wrangler interactive secrets or Cloudflare UI. Never print or log values, put them in code, or ask for them in chat. Generate independent random admin/internal/encryption keys and back them up securely. Expect `PUBLIC_ORIGIN=https://login.dyai.cloud` and username `anasavu`.
- Recheck deployed configuration and isolated route. Do not let an auth failure tempt you to broaden scopes or make the dashboard public.

## 4. Meta OAuth manual gate

- Operator in Meta Dashboard (logged in as Ben) registers the **exact** redirect URI `https://login.dyai.cloud/instagram/callback` in Instagram Business Login settings. This is a human browser task; Claude Code should not request passwords or secrets and should not switch the app to Live or request Advanced Access without a demonstrated requirement.
- Confirm the scopes under **Instagram Login** (not Facebook Login) and whether Meta provides an embed URL whose parameters must be used instead of constructing one. Resolve any mismatch against current official docs before inviting Ana.

## 5. Real remote acceptance with Ana (remote, own device)

- Generate a fresh invitation by protected `POST /admin/invitations` using the terminal's private admin bearer key; send only the one-time invitation URL to Ana; do not share the key.
- Ana authenticates on her own device as `@anasavu`, reviews/approves scopes. Do not prompt Ben for Ana's password.
- Verify the provider redirect returns to the exact Worker HTTPS callback and that `/admin/status` is `CONNECTED` for the expected account.
- Call `/admin/probe` and verify a **real** Instagram media result, including the known open `caption` compatibility question. A second validation of the Insights scope (one supported real insights metric request) is required before claiming live analytics support.
- Document actual permission data and token lifetime; never persist a raw token or OAuth code in Git/Jira/Confluence or logs.

## 6. Operability / rollback / terminal report

- Verify scheduled refresh behavior and monitor expiry, errors and reauth requirements without disclosing sensitive URLs.
- Give operator a clean rollback: disable new invites, remove custom Worker route, optionally revoke Instagram app access, and delete D1 only with explicit user approval. Do not delete the existing Meta app or any current Cloudflare Worker.
- Final report MUST classify each stage as `DONE`, `BLOCKED`, `NOT_TESTED`, `FAILED`, or `UNKNOWN` with evidence: repository and PR, tests, Cloudflare URL/health, D1 migration, Meta callback, Ana approval, token stored, basic media and insights validated. Do not report `DONE` for live login from mocked tests.

## Success criteria

(1) Public ANA LUMEN dashboard remains entirely private/local. (2) A separate Worker HTTPS callback exists. (3) `@anasavu` can authorize remotely with no credential-sharing. (4) Exact account verification and secure encrypted token storage. (5) Real authorized media smoke test. (6) Insights test explicitly `PASS` or `BLOCKED`, not invented. (7) Provenance/owner for future token refresh and revocation.
