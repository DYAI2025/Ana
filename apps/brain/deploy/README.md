# ANA Brain — operations

Contract: [`docs/brain/CONTRACT.md`](../../../docs/brain/CONTRACT.md). The Markdown vault is canonical; Qdrant points,
coordinates and clusters are rebuildable projections. No Brain content, keys or tokens belong in this repository.

## Layout on the VPS

| Path | Purpose |
|---|---|
| `/opt/ana-brain` | checkout of this repository (built `apps/brain/dist`) |
| `/var/lib/ana-brain/vault` | canonical vault (local git repo, **no remote**) |
| `/var/lib/ana-brain/state` | `keys.json`, `oauth.json`, `dashboard-token.json` (hashes only) |
| `/etc/ana-brain/env` | environment (see `env.example`), mode 0600 |
| `/var/backups/ana-brain` | nightly backups |

## Install

```sh
useradd --system --home /var/lib/ana-brain --shell /usr/sbin/nologin ana-brain
install -d -o ana-brain -g ana-brain -m 0700 /var/lib/ana-brain/vault /var/lib/ana-brain/state
sudo -u ana-brain git -C /var/lib/ana-brain/vault init
cd /opt/ana-brain/apps/brain && npm ci && npm run build
install -d -m 0750 /etc/ana-brain && cp deploy/env.example /etc/ana-brain/env   # fill in, chmod 0600
cp deploy/ana-brain.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now ana-brain
cp deploy/nginx-mcp.ana.dyai.cloud.conf /etc/nginx/sites-available/ && ln -s ../sites-available/nginx-mcp.ana.dyai.cloud.conf /etc/nginx/sites-enabled/
certbot --nginx -d mcp.ana.dyai.cloud && nginx -t && systemctl reload nginx
curl -fsS https://mcp.ana.dyai.cloud/healthz
```

Ollama and Qdrant stay on internal addresses (`OLLAMA_URL`, `QDRANT_URL`); they are never exposed publicly.

## Keys

Run every CLI command as the service user with the env file loaded, e.g.
`sudo -u ana-brain env $(cat /etc/ana-brain/env | xargs) node dist/cli.js <command>`.

- `issue-key ana|ben|vince` — prints a new personal access key **once**; hand it over privately. Only the SHA-256 is
  stored. The key works as `Authorization: Bearer <key>` for CLI clients and is typed into the `/authorize` form when
  connecting Claude Desktop / claude.ai (custom connector URL `https://mcp.ana.dyai.cloud/mcp`).
- Revoke: remove the person's entry from `state/keys.json` (and their tokens from `state/oauth.json`), restart.
- `issue-dashboard-token` — token for the dashboard server only (`/projection`). Alternatively set
  `BRAIN_DASHBOARD_TOKEN_SHA256`.

## Index

- `index` — incremental: unchanged notes skipped, changed notes re-embedded, superseded notes marked `retired`.
- `index --full` — drops `ana_brain_v1` and rebuilds from the vault (safe: the vault is canonical).
- `validate` — validates every note and reference; exit 1 on error. `stats` — counts by type/status, index size.
- Refuses to index if `bge-m3:latest` does not return 1024 dimensions or the collection has another size.
- Suggested timer: `index` every 15 minutes and after seeding.

## Backup

Nightly (cron/systemd timer as root):

```sh
tar -C /var/lib/ana-brain -czf /var/backups/ana-brain/ana-brain-$(date +%F).tar.gz vault state
find /var/backups/ana-brain -name 'ana-brain-*.tar.gz' -mtime +30 -delete
```

The vault's git history (`vault/.git`) is part of the archive, so every write is recoverable. Backups contain private
Brain content and key hashes: keep them `0600` and off public storage.

## Restore

```sh
systemctl stop ana-brain
tar -C /var/lib/ana-brain -xzf /var/backups/ana-brain/ana-brain-<date>.tar.gz
chown -R ana-brain:ana-brain /var/lib/ana-brain
systemctl start ana-brain
node dist/cli.js validate && node dist/cli.js index --full
```

To roll back a single bad write, use `git -C /var/lib/ana-brain/vault log` / `git revert` (never rewrite history).

## Rebuild index

Qdrant data is disposable: `node dist/cli.js index --full`. Projection (`/projection`) is computed from the index on
request, so it is rebuilt automatically.

## Timers (installed with the service)

| Unit | Schedule | Purpose |
|---|---|---|
| `ana-brain-index.timer` | every 5 min | incremental index; unchanged notes are skipped by content hash |
| `ana-brain-backup.timer` | daily 03:15 UTC | `tar` of `vault` + `state` to `/var/backups/ana-brain`, 30 days kept |

## Google Drive (ANA Evidence Root)

Read-only access to raw evidence in Drive (scope exactly `https://www.googleapis.com/auth/drive.readonly`),
confined in code to files under `ANA_DRIVE_ROOT_ID` (parent chain ≤ 12 hops; trashed/outside files refused).
Drive is off unless `ANA_DRIVE_ROOT_ID` is set and `ANA_DRIVE_OAUTH_FILE` (default
`/etc/ana-brain/drive-oauth.json`) exists. `/healthz` never calls Drive.

1. Google Cloud console: OAuth client of type **Desktop app**; the consent screen must be **In production**
   (in *Testing*, refresh tokens expire after 7 days).
2. On the Mac (browser available), with the downloaded client file:
   ```bash
   cd apps/brain && npm run build
   node dist/cli.js drive-auth --client ~/Downloads/client_secret_XXX.json --out ~/drive-oauth.json
   ```
   It prints only the consent URL (PKCE + state, loopback on 127.0.0.1), then `saved refresh token to …` and the
   granted scope. The file is written with mode 0600; `--force` is needed to overwrite.
3. Copy it to the VPS and lock it down, then delete the local copy:
   ```bash
   scp ~/drive-oauth.json root@<vps>:/etc/ana-brain/drive-oauth.json
   ssh root@<vps> 'chown root:ana-brain /etc/ana-brain/drive-oauth.json && chmod 0640 /etc/ana-brain/drive-oauth.json'
   rm ~/drive-oauth.json
   ```
4. Set `ANA_DRIVE_ROOT_ID` (and optionally `ANA_DRIVE_TRANSCRIPTS_ID`) in `/etc/ana-brain/env`, restart `ana-brain`.
5. Use (as the service user, env loaded):
   ```bash
   ana-brain drive-list [folderId]                       # JSON lines; default folder = root
   ana-brain drive-register <fileId> --id src-… --title "…" --actor ben [--data-class G2] [--topics a,b]
   ```
   `drive-register` stores metadata only (locator = file id, Drive title, mime/size/modifiedTime, sha256 of the
   readable text) — never content. MCP `brain_read_source` returns bounded text slices to the caller only.

## Smoke test against the running service

```bash
cd /opt/ana-brain/apps/brain
SMOKE_URL=http://127.0.0.1:8790 SMOKE_KEY_FILES=/root/ana-brain-keys/ana.key,/root/ana-brain-keys/ben.key node scripts/smoke.mjs
```

`SMOKE_WRITES=1` exercises the write tools and must only be pointed at a disposable copy of the vault
(a second `serve` on another port with `BRAIN_VAULT_DIR`/`BRAIN_STATE_DIR` in `/tmp`). The script prints
evidence JSON without keys or note bodies.
