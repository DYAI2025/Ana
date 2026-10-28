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
- `revoke-key ana|ben|vince` — removes every key of that person and their OAuth tokens; effective at the next
  request, no restart. OAuth tokens are bound to the key that authorized them, so a key removed any other way also
  ends its tokens. Issue a new key with `issue-key` afterwards if the person keeps access.
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
The Brain reads Drive as its own **service account** (PO decision 2), never with a person's Google token: it
sees only the folders shared with it. Drive is off when `ANA_DRIVE_ROOT_ID` is unset. When it is set, the key
`ANA_DRIVE_SA_KEY_FILE` (default `/etc/ana-brain/drive-sa.json`) must exist, or the service refuses to start.
The retired personal-token setting `ANA_DRIVE_OAUTH_FILE` is refused at startup. `/healthz` never calls Drive.

1. Google Cloud console (project owned by the operator): create a service account without any project role, enable
   the Drive API, create one JSON key. Domain-wide delegation stays **off** (the Brain never sets `sub`).
2. In Drive, share the `ANA Evidence Root` folder (ANA-3) with the service account's e-mail as **Viewer** — nothing
   else is shared with it.
3. Install the key on the host and delete every other copy (the downloaded file included):
   ```bash
   scp <key.json> root@<host>:/root/drive-sa.json
   ssh root@<host> 'install -m 0640 -o root -g ana-brain /root/drive-sa.json /etc/ana-brain/drive-sa.json && shred -u /root/drive-sa.json'
   rm <key.json>
   ```
4. Set `ANA_DRIVE_ROOT_ID` (and optionally `ANA_DRIVE_TRANSCRIPTS_ID`) in `/etc/ana-brain/env`, restart `ana-brain`.
   Verify: `ana-brain drive-list` lists the root; a file id outside the root is refused with `outside ANA Evidence Root`.
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
