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
