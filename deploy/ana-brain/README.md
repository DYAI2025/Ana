# ANA Brain release contract (ANA-35, ADR-ANA-001)

**Host: the Contabo VPS `vmi3693936` (Ubuntu 24.04), the only deployment environment for ANA applications**
([ADR-ANA-001](https://dyai2026.atlassian.net/wiki/spaces/Ana/pages/124977153)). The Brain still runs on the legacy
host `srv1308064` (`apps/brain/deploy/`). The Product Owner decision ANA35-HOST-002 of 2026-10-28 (Jira ANA-35) moves
it here under control: existing data and source history are backed up and verified first (gate M1, done), the old
service is switched off only after a verified cutover, and the personal Drive token is revoked only after the Brain
service account works.

Nothing in this directory authorizes a deployment, a host change, a DNS or ingress change, a credential change or a
change to the legacy host. Each of the gates M3 (provision and restore), M4 (cutover) and M5 (retire legacy, revoke
the Drive token) needs the Product Owner's action-specific approval. There is never a second writable Brain: the
legacy service is stopped before the DNS switch and is never started again next to this one, except to roll back.

## 1. Mandatory invariants

1. **Artifact.** Release only `ana-brain-app-<sha>.tar.gz` with its `.sha256` from a **successful push run of the
   `brain` workflow on `main`** for that commit. A pull_request run builds the merge ref, so its artifact is test output.
   CI builds the bundle (`dist/` + production `node_modules`), starts it under Node v24.22.0 and checks `/healthz` 200,
   `/mcp` and `/projection` 401 without a credential, and the loopback bind.
2. **Loopback only.** The Brain listens on `127.0.0.1:8790`, its Qdrant on `127.0.0.1:6333` (gRPC off), its Ollama on
   `127.0.0.1:11434`. The only public listeners for the Brain are nginx on 80/443 for `mcp.ana.dyai.cloud`. No public
   Qdrant, Ollama or filesystem endpoint, ever. `release.sh` refuses a release otherwise.
3. **Ingress.** nginx proxies only `/mcp`, `/authorize`, `/token`, `/register`, `/healthz` and `/.well-known/`;
   `/projection` is denied and everything else is 404. `apps/brain/test/http.test.ts` fails when a proxied path is not
   served by the app. The dashboard on this host reads `/projection` over loopback.
4. **Secrets.** Credentials live only in `/etc/dyai/credentials/ana-brain/` (root:root, directory 0700, files 0600) and
   reach the units through `LoadCredential=`; the pinned `Environment=` lines win over `node --env-file`; no unit has
   `EnvironmentFile=`. Every secret is **new**: the Qdrant API key, the MCP keys (`issue-key`), the dashboard token
   and the Drive service-account key. **Never copied from the legacy host:** `state/keys.json`, `state/oauth.json`,
   `state/dashboard-token.json`, `/etc/ana-brain/drive-oauth.json`, or any value of `/etc/ana-brain/env`.
5. **Vault.** The canonical Markdown and its git history come only from the M1 archive (or a later archive made the
   same way, step M4.3) and are verified (manifest, `git fsck`, HEAD, audit log, `validate`) **before** the Brain
   starts on them. Qdrant is rebuilt from the vault, never copied. Every vault write is committed as "ANA Brain"; a
   commit that fails is logged as an error, the write itself stays on disk and in `.ana/audit.jsonl`.
6. **Provenance.** No status is relabelled, no source invented, no note rewritten during migration. A difference
   between legacy and restore that cannot be explained stops the migration.

## 2. Evidence required for an actual deployment

Kept in `~/ANA/evidence-private/ANA-35/<gate>-<date>/`, never in this repository. Counts and hashes, no note bodies,
no keys.

- Bundle sha256 = the `.sha256` of the CI artifact; the run id of the push run on `main`.
- `release.sh` final line; `ss -ltnH` of the host (nothing but 22, 80 and 443 listens on a non-loopback address).
- Restore: archive sha256, manifest diff (0 lines), `git fsck --full --strict` rc 0, HEAD and commit count, audit
  sha256, `brain.sh validate` and `brain.sh stats` against the M0/M1 numbers (73 notes; 48 DERIVED, 18 CANDIDATE,
  7 SOURCE).
- Index: `brain.sh stats` (`indexed` = notes, `embed_digest`, `index_version` 2); the bge-m3 digest on legacy and here.
- Search conservation: top-5 ids of a fixed query set on legacy and here; every difference explained.
- MCP: `https://mcp.ana.dyai.cloud/healthz` 200, `/mcp` 401 without a key, `/projection` 403, a path outside the list
  404, and one authorized `brain_search` per re-issued key; ports 6333, 6334, 8790 and 11434 closed from outside.
- Dashboard: the Brain page on production shows the projection (live acceptance run).
- M5: legacy units stopped and disabled, the legacy host otherwise untouched; `brain.sh drive-list` with the service
  account before the personal token is revoked; the revocation receipt.

## 3. Open decisions (Product Owner)

- Recovery owner of the Brain data (proposed: Ben).
- A second copy of the M1 archive passphrase in a password manager, before M5.
- Host firewall: `ufw` is inactive on `vmi3693936`. Everything here binds loopback anyway; enabling ufw (22, 80, 443)
  is a host change for M3 and must keep the operator's SSH session alive while it is switched on.

## 4. Contabo implementation (`vmi3693936`)

| Path | Owner, mode | Content |
|---|---|---|
| `/srv/dyai/runtime/ana-brain/{release.sh,brain.sh}` | root, 0755 | from this directory |
| `/srv/dyai/runtime/ana-brain/releases/<sha>`, `current` | root, read-only | unpacked bundles, active release |
| `/etc/dyai/credentials/ana-brain/` | root:root 0700 | `brain_env` (see `brain_env.example`), `qdrant_api_key`, `drive_sa` (0600 each) |
| `/var/lib/ana-brain/vault` | ana-brain, 0700 | restored vault (git) |
| `/var/lib/ana-brain/state` | ana-brain, 0700 | new key/token hashes; starts empty |
| `/opt/ana-qdrant/<version>`, `current` | root | pinned Qdrant binary |
| `/etc/dyai/ana-qdrant/config.yaml` | root, 0644 | `qdrant.yaml` |
| `/opt/ana-ollama/<version>`, `current` | root | pinned Ollama (`bin/`, `lib/`) |
| `/var/lib/ana-qdrant`, `/var/lib/ana-ollama` | unit state (DynamicUser) | collection `ana_brain_v1`, models |
| `/var/backups/ana-brain` | root, 0700 | nightly vault + state archives, 30 days |

Units: `dyai-ana-brain.service`, `dyai-ana-brain-index.{service,timer}` (2 min after boot, then 5 min after each run),
`dyai-ana-brain-backup.{service,timer}` (03:15 host time), `dyai-ana-qdrant.service`, `dyai-ana-ollama.service`.

### M3 — provision and restore (root on `vmi3693936`)

```bash
apt-get install -y nginx certbot zstd
rm /etc/nginx/sites-enabled/default && systemctl reload nginx   # the package's welcome page, not ours
useradd --system --user-group --home-dir /var/lib/ana-brain --shell /usr/sbin/nologin ana-brain
install -d -m 0755 /srv/dyai/runtime/ana-brain /var/www/certbot /etc/dyai/ana-qdrant
install -d -m 0700 -o root -g root /etc/dyai/credentials/ana-brain /var/backups/ana-brain
install -d -m 0700 -o ana-brain -g ana-brain /var/lib/ana-brain /var/lib/ana-brain/state
# from a checkout of this repo at the released commit, copied to the host first:
install -m 0755 release.sh brain.sh /srv/dyai/runtime/ana-brain/
install -m 0644 qdrant.yaml /etc/dyai/ana-qdrant/config.yaml
install -m 0644 dyai-ana-*.service dyai-ana-*.timer /etc/systemd/system/
# Qdrant and Ollama: pinned releases, sha256 recorded in the evidence (Ollama: against the release's sha256sum.txt)
#   /opt/ana-qdrant/<v>/qdrant      <- qdrant-x86_64-unknown-linux-gnu.tar.gz of release v<v>
#   /opt/ana-ollama/<v>/{bin,lib}   <- ollama-linux-amd64.tar.zst of release v<v>
ln -sfn <v> /opt/ana-qdrant/current; ln -sfn <v> /opt/ana-ollama/current
# credentials: one new Qdrant key, written to both places without echoing it
k="$(openssl rand -hex 32)"; umask 077
printf '%s\n' "$k" > /etc/dyai/credentials/ana-brain/qdrant_api_key
printf 'QDRANT_API_KEY=%s\n' "$k" > /etc/dyai/credentials/ana-brain/brain_env; unset k
install -m 0600 /dev/null /etc/dyai/credentials/ana-brain/drive_sa   # empty while Drive is off
systemctl daemon-reload && systemctl enable --now dyai-ana-qdrant dyai-ana-ollama
OLLAMA_HOST=127.0.0.1:11434 /opt/ana-ollama/current/bin/ollama pull bge-m3
```

**Restore the vault** from the encrypted M1 copy that is already on this host
(`/var/backups/ana-brain-migration/ana-brain-vault-20261028.tar.gpg`, sha256 `ae993cc5…aaa5501`). The passphrase
stays on the operator's Mac and reaches `gpg` only through the SSH channel's stdin:

```bash
# on the Mac
security find-generic-password -s ana35-brain-backup -a M1-20261028 -w | ssh <contabo> '
  set -eo pipefail; A=/var/backups/ana-brain-migration/ana-brain-vault-20261028.tar.gpg
  sha256sum "$A"; t="$(mktemp -d /var/lib/ana-brain/.restore.XXXXXX)"
  gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt "$A" | tar -C "$t" -xf - --no-same-owner
  echo "restored into $t"'
```

Then on the host, before anything starts on it: the per-file manifest of `$t/vault`
(`find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum`) must equal `manifest.legacy.sha256` of the M1
evidence (diff 0 lines); `GIT_OPTIONAL_LOCKS=0 git -C $t/vault fsck --full --strict` rc 0; HEAD `da70970…`, 1 commit,
0 dirty; `.ana/audit.jsonl` sha256 `a9f69a9f…`. Only then:

```bash
mv -T "$t/vault" /var/lib/ana-brain/vault && rmdir "$t"
chown -R ana-brain:ana-brain /var/lib/ana-brain/vault && chmod 0700 /var/lib/ana-brain/vault
```

**Release** the Brain (first release, then every later one), detached from the SSH session:

```bash
systemd-run --unit=ana-brain-release --wait --collect /srv/dyai/runtime/ana-brain/release.sh <sha> <bundle dir>
journalctl -u ana-brain-release -o cat -n 20
/srv/dyai/runtime/ana-brain/brain.sh validate     # 73 valid notes, 0 errors
/srv/dyai/runtime/ana-brain/brain.sh stats        # after the first index run: indexed 73, index_version 2
```

The first index run creates the collection and embeds every note. Compare the bge-m3 digest in `stats` with the
legacy Ollama's (read-only `GET /api/tags` on `srv1308064`); a different digest is a finding for the Product Owner
before M4, not something to accept silently.

### M4 — cutover (each step approved; the legacy service is stopped, never deleted)

1. Lower the TTL of the DNS-only A record `mcp.ana.dyai.cloud` ahead of time.
2. Stop the legacy Brain and its index timer on `srv1308064` (`systemctl stop`; units, data and host stay).
3. Bracket the legacy vault again with the M1 probe (HEAD, audit sha256, tree sha256). Equal to M1: the restored vault
   is final. Different: make a new encrypted archive the M1 way, restore and verify it as above, re-run `index`.
4. Switch the A record to this host (DNS-only, not proxied). Install `nginx-mcp.ana.dyai.cloud.acme.conf` as
   `/etc/nginx/sites-available/mcp.ana.dyai.cloud` (linked from `sites-enabled/`), run
   `certbot certonly --webroot -w /var/www/certbot -d mcp.ana.dyai.cloud --deploy-hook "systemctl reload nginx"`
   (renewals use the same webroot through port 80 of the full configuration), then replace it with
   `nginx-mcp.ana.dyai.cloud.conf`, `nginx -t`, reload.
5. Issue new keys (`brain.sh issue-key ana|ben|vince`) and hand each over privately; each person reconnects the
   Claude connector to `https://mcp.ana.dyai.cloud/mcp` and runs one `brain_search`.
6. Dashboard: `brain.sh issue-dashboard-token`; put `BRAIN_API_URL=http://127.0.0.1:8790` and the token into the
   dashboard's `dashboard_env` credential, then re-run the dashboard's `release.sh` for its current sha.
7. G4 release gate on the evidence of section 2.

**Rollback before step 4:** nothing public changed; start the legacy service again. **After step 4:** point the A
record back to `srv1308064`, start its Brain; writes made here since the restore (`git log <restored HEAD>..` in the
vault) are listed for the Product Owner, never merged automatically.

### M5 — retire the legacy Brain (after G4)

Disable the Brain units on `srv1308064` (`ana-brain`, `ana-brain-index.timer`, `ana-brain-backup.timer`); the VPS and
its other services stay. Revoke the personal Drive token only after `brain.sh drive-list` has listed the Evidence
root as the service account and that access was verified independently; delete `/etc/ana-brain/drive-oauth.json`
on the legacy host only after the revocation.
