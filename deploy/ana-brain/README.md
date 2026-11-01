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
   `brain` workflow on `main`** for that commit. A pull_request run builds the PR head and names its artifact
   `ana-brain-pr-<sha>` (bundle `ana-brain-app-pr-<sha>.tar.gz`), any other non-release run `ana-brain-test-<sha>`:
   test output kept 3 days, never a release. The name alone is not trusted (pull_request runs before 329f4a9 uploaded
   release-shaped `ana-brain-<sha>` artifacts): fetch the bundle with `deploy/fetch-release.sh brain <sha> <dir>`,
   which checks the run through the GitHub API (event push, branch `main`, that commit, success, `brain.yml`, no
   fork), and `release.sh` refuses a bundle whose `.ana-build` (written by the run, covered by the `.sha256`) does not
   say event push, ref `refs/heads/main`, workflow `brain.yml` and that commit; bundles built before this rule have no
   `.ana-build` and are refused (`release.sh --check-bundle <sha> <dir>` runs only this check;
   `deploy/test-release-provenance.sh` proves it in CI).
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
   same way, step M4.3) and are verified (manifest, `git fsck`, HEAD, audit log) **before** the Brain starts on them,
   and with `validate` before anyone can write (M3: right after the first release, while no key exists; M4.3 and a
   nightly restore: before the Brain starts). Qdrant is rebuilt from the vault, never copied. Every vault write is
   committed as "ANA Brain" with exactly the files it wrote; changes in other files (a hand edit, a write whose commit
   failed) stay out of it and in `git status`. A file it wrote that already had uncommitted changes carries them into
   the commit, and the commit subject names that file. One case adds a file it did not write: a supersession retry
   commits the source note whose relation the failed first attempt left on disk, named the same way. A commit that fails is logged as an error, and the write stays
   on disk, in `.ana/audit.jsonl` and in `git status`.
6. **Provenance.** No status is relabelled, no source invented, no note rewritten during migration. A difference
   between legacy and restore that cannot be explained stops the migration.

## 2. Evidence required for an actual deployment

Kept in `~/ANA/evidence-private/ANA-35/<gate>-<date>/`, never in this repository. Counts and hashes, no note bodies,
no keys.

- Bundle sha256 = the `.sha256` of the CI artifact; the run id of the push run on `main`.
- `release.sh` final line; `ss -ltnH` of the host (nothing but 22, 80 and 443 listens on a non-loopback address).
- Restore: archive sha256, manifest diff (0 lines), `git fsck --full --strict` rc 0, HEAD and commit count, audit
  sha256, `brain.sh validate` and `brain.sh stats` against the counts recorded for that archive (M1: 73 notes; 48
  DERIVED, 18 CANDIDATE, 7 SOURCE; an M4.3 archive: its own counts, every difference to M1 explained).
- M4.0: the recorded pre-cutover state (legacy unit states, DNS answer for `mcp.ana.dyai.cloud`).
- Index: `brain.sh stats` (`indexed` = notes, `embed_digest`, `index_version` 2); the bge-m3 digest on legacy and here.
- Search conservation: top-5 ids of a fixed query set on legacy and here; every difference explained.
- MCP: `https://mcp.ana.dyai.cloud/healthz` 200, `/mcp` 401 without a key, `/projection` 403, a path outside the list
  404, and one authorized `brain_search` per re-issued key; ports 6333, 6334, 8790 and 11434 closed from outside.
- Dashboard: released from a commit that contains `/api/brain` (production `8dd3dfa` does not); with `indexed` =
  `notes` and `validate` clean, `/brain` on production shows `indexed` of `brain.sh stats` as its note count and
  `relations` as its relation count (the projection draws the indexed notes and the relations between them).
  `apps/dashboard/e2e-live/` has no Brain spec, so this is a manual check and is recorded as one.
- M5: `ana-brain.service` disabled since M4.2, `ana-brain-backup.timer` disabled, the legacy host otherwise untouched; `brain.sh drive-list` with the service
  account before the personal token is revoked; the revocation receipt.

## 3. Open decisions (Product Owner)

- Recovery owner of the Brain data (proposed: Ben).
- A second copy of the M1 archive passphrase in a password manager, before M5.
- Host firewall: `ufw` is inactive on `vmi3693936`. Everything here binds loopback anyway; enabling ufw (22, 80, 443)
  is a host change for M3 and must keep the operator's SSH session alive while it is switched on.

## 4. Contabo implementation (`vmi3693936`)

| Path | Owner, mode | Content |
|---|---|---|
| `/srv/dyai/runtime/ana-brain/{release.sh,brain.sh,restore-nightly.sh}` | root, 0755 | from this directory |
| `/srv/dyai/runtime/ana-brain/releases/<sha>`, `current` | root, read-only | unpacked bundles, active release |
| `/etc/dyai/credentials/ana-brain/` | root:root 0700 | `brain_env` (see `brain_env.example`), `qdrant_api_key`, `drive_sa` (0600 each) |
| `/var/lib/ana-brain/vault` | ana-brain, 0700 | restored vault (git) |
| `/var/lib/ana-brain/state` | ana-brain, 0700 | new key/token hashes; starts empty |
| `/opt/ana-qdrant/<version>`, `current` | root | pinned Qdrant binary |
| `/etc/dyai/ana-qdrant/config.yaml` | root, 0644 | `qdrant.yaml` |
| `/opt/ana-ollama/<version>`, `current` | root | pinned Ollama (`bin/`, `lib/`) |
| `/var/lib/ana-qdrant`, `/var/lib/ana-ollama` | unit state (DynamicUser) | collection `ana_brain_v1`, models |
| `/var/backups/ana-brain` | root, 0700 | nightly vault + state archives, 30 days (`state` is never restored) |

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
install -m 0755 release.sh brain.sh restore-nightly.sh /srv/dyai/runtime/ana-brain/
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

A later archive (step M4.3) is restored the same way with its own path, keychain entry and evidence values.

Then on the host, before anything starts on it, against the evidence of the archive being restored. The copy goes to
ana-brain first and git runs on it only as ana-brain, never as root: its `.git/config` and `.gitattributes` were
written by the legacy Brain's user, and git runs commands they name (fsmonitor, clean filters, pagers). CI refuses
any `git -C`/`git -c` in this kit that does not run as ana-brain.

```bash
chown -R ana-brain:ana-brain "$t"
g() { runuser -u ana-brain -- env -i PATH=/usr/bin:/bin GIT_OPTIONAL_LOCKS=0 git -C "$t/vault" "$@"; }
g fsck --full --strict && echo "fsck rc 0"
g rev-parse HEAD && g rev-list --count HEAD
dirty="$(g status --porcelain)" && echo "dirty $(printf '%s' "$dirty" | grep -c .)"
```

Each check prints its own line; a missing `fsck rc 0` or `dirty …` line is a failed check, whatever was printed before.

The per-file manifest of `$t/vault` (`find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum`) must equal its
`manifest.legacy.sha256` (diff 0 lines); `fsck rc 0`; HEAD, commit count, `dirty 0` and the `.ana/audit.jsonl` sha256 as
recorded (M1: HEAD `da70970…`, 1 commit, audit `a9f69a9f…`). Record the restored HEAD and `wc -l < $t/vault/.ana/audit.jsonl`; a rollback lists what came after
them. Only then (`/var/lib/ana-brain/vault` must not exist yet; step M4.3 moves the previous restore aside first):

```bash
mv -T "$t/vault" /var/lib/ana-brain/vault && rmdir "$t"
chown -R ana-brain:ana-brain /var/lib/ana-brain/vault && chmod 0700 /var/lib/ana-brain/vault
```

**Release** the Brain (first release, then every later one), detached from the SSH session. The bundle directory holds
`ana-brain-app-<sha>.tar.gz` and its `.sha256`, fetched on the operator's machine with
`deploy/fetch-release.sh brain <sha> <dir>` (invariant 1) and copied to the host:

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

0. Record the pre-cutover state into the evidence. It is the only rollback target; nothing below assumes it:

   ```bash
   # on srv1308064 (read-only)
   systemctl is-enabled ana-brain.service ana-brain-index.timer ana-brain-backup.timer
   systemctl is-active ana-brain.service ana-brain-index.timer ana-brain-backup.timer
   # anywhere
   dig mcp.ana.dyai.cloud A @1.1.1.1 | grep status; dig +short AAAA mcp.ana.dyai.cloud @1.1.1.1
   ```

   Seen on 2026-10-28: `ana-brain.service` enabled and active, `ana-brain-index.timer` disabled and inactive (paused
   since 2026-10-09), `ana-brain-backup.timer` enabled and active; `mcp.ana.dyai.cloud` NXDOMAIN (no record at all).
1. `mcp.ana.dyai.cloud` has no record to lower: step 4 creates its first A record, DNS-only, with a 300 s TTL.
2. Stop the legacy Brain on `srv1308064` and disable it, so a reboot does not start it again (units, data and host
   stay; `ana-brain-backup.timer` keeps running, it only reads the vault). Disabling the index timer is a no-op when
   M4.0 recorded it disabled:
   `systemctl disable --now ana-brain.service ana-brain-index.timer && systemctl stop ana-brain-index.service`.
3. Bracket the legacy vault again with the M1 probe (HEAD, audit sha256, tree sha256). Equal to M1: the restored vault
   is final. Different: make a new encrypted archive the M1 way on `srv1308064` (evidence `M4-<date>`), copy it here,
   then stop this Brain so nothing writes while the vault is swapped, and keep the M3 restore:

   ```bash
   systemctl stop dyai-ana-brain-index.timer dyai-ana-brain-index.service dyai-ana-brain.service
   mv -T /var/lib/ana-brain/vault /var/lib/ana-brain/vault.m3      # kept, never deleted
   ```

   Restore and verify the new archive as in M3 with its own values and move it into place. Then, before the Brain
   starts, `brain.sh validate` (0 errors) and `brain.sh stats` against that archive's counts:

   ```bash
   /srv/dyai/runtime/ana-brain/brain.sh validate
   /srv/dyai/runtime/ana-brain/brain.sh stats
   systemctl start dyai-ana-brain.service
   /srv/dyai/runtime/ana-brain/brain.sh index --full   # the archive carries the legacy index state: re-embed every note
   systemctl start dyai-ana-brain-index.timer
   ```

4. Create the A record `mcp.ana.dyai.cloud` → this host's public IPv4 (DNS-only, not proxied, TTL 300). Install `nginx-mcp.ana.dyai.cloud.acme.conf` as
   `/etc/nginx/sites-available/mcp.ana.dyai.cloud` (linked from `sites-enabled/`), `nginx -t && systemctl reload nginx`,
   run `certbot certonly --webroot -w /var/www/certbot -d mcp.ana.dyai.cloud --deploy-hook "systemctl reload nginx"`
   (renewals use the same webroot through port 80 of the full configuration), then replace it with
   `nginx-mcp.ana.dyai.cloud.conf` and `nginx -t && systemctl reload nginx` again. CI runs `check-nginx.sh` on both
   files with the nginx 1.24 of Ubuntu 24.04.
5. Issue new keys (`brain.sh issue-key ana|ben|vince`) and hand each over privately; each person reconnects the
   Claude connector to `https://mcp.ana.dyai.cloud/mcp` and runs one `brain_search`.
6. Dashboard: `brain.sh issue-dashboard-token`; put `BRAIN_API_URL=http://127.0.0.1:8790` and the token into the
   dashboard's `dashboard_env` credential, then run the dashboard's `release.sh` for a commit that contains the
   Brain page and `/api/brain`: this PR merged into `main`. Re-releasing production `8dd3dfa` would serve no Brain.
7. G4 release gate on the evidence of section 2.

**Rollback** returns to the state recorded in M4.0, never to an assumed one. On `srv1308064`, enable and start
exactly the units M4.0 recorded as enabled and active, and nothing else (2026-10-28: only
`systemctl enable --now ana-brain.service`; the index timer stays off). **Before step 4** nothing public changed, so
that is all. **After step 4**, first take this Brain and its public site down, so there is never a second writable
Brain, then delete the A record of `mcp.ana.dyai.cloud` (M4.0: the name had none; `srv1308064` never served it and
has no vhost or certificate for it), then restore the legacy units as above. MCP clients are then without a Brain,
as before M4, and the dashboard's Brain page here shows BLOCKED:

```bash
systemctl disable --now dyai-ana-brain-index.timer dyai-ana-brain.service
rm /etc/nginx/sites-enabled/mcp.ana.dyai.cloud && nginx -t && systemctl reload nginx
```

Writes made here since the restore are listed for the Product Owner, never merged automatically. git runs as
`ana-brain` (as root it stops at "dubious ownership"), and the audit log also holds writes whose commit failed:

```bash
v=/var/lib/ana-brain/vault
runuser -u ana-brain -- env HOME=/var/lib/ana-brain git -C "$v" log --oneline <restored HEAD>..HEAD
tail -n +$((<restored audit lines> + 1)) "$v/.ana/audit.jsonl"
```

### Restore from a nightly archive (`/var/backups/ana-brain`)

```bash
/srv/dyai/runtime/ana-brain/restore-nightly.sh ana-brain-<YYYY-MM-DD>.tar.gz
```

What it does, each outcome checked in CI by `test-restore-nightly.sh` (as root on Ubuntu 24.04, with stubbed systemctl,
`brain.sh` and node):

- It stops the Brain and its index first, recreates `/var/lib/ana-brain` and `state` (owner ana-brain, 0700) if they
  were lost, and extracts only `vault`. **`state` is never restored:** it holds the key, OAuth-token and dashboard-token
  hashes of that night, so a key revoked since then would work again. When `state` was empty or lost, the script says
  so: issue keys again (`brain.sh issue-key ana|ben|vince` as in M4.5, `brain.sh issue-dashboard-token` and the
  dashboard credential as in M4.6); until then the Brain refuses every caller.
- Nothing from the archive runs as root: its content, `.git/config` included, was written by the Brain's own user, so
  extraction, `git fsck` (with `core.fsmonitor` off) and the release's own `validate` run as ana-brain, on the
  extracted copy, **before** anything is moved. If either check fails, nothing was moved, the Brain stays stopped, the copy stays in `/var/lib/ana-brain/.restore.*` for
  inspection, and the message says so. Start the old vault again with
  `systemctl start dyai-ana-brain.service dyai-ana-brain-index.timer`.
- A vault that is still there is kept as `vault.before-restore-<date-time>`, never deleted; a lost one is replaced.
- Then it starts the Brain, runs `brain.sh index --full` (the archive's index state is older than the live
  collection; an incremental run would keep stale points) and starts the index timer. If one of these fails, the
  restored and validated vault is in place, the previous one is kept, the timer stays off, and the message names the
  steps to finish by hand.

Writes made after the archive stay in the kept vault (if there is one) and are listed for the Product Owner as in the
rollback above. If only `state` is lost, nothing is restored: recreate it
(`install -d -m 0700 -o ana-brain -g ana-brain /var/lib/ana-brain/state`; the units cannot start without it) and issue
keys again as above; every connector then reconnects.

### M5 — retire the legacy Brain (after G4)

The Brain units on `srv1308064` stay disabled since M4.2; disable `ana-brain-backup.timer` as well. The VPS and its
other services stay. Revoke the personal Drive token only after `brain.sh drive-list` has listed the Evidence
root as the service account and that access was verified independently; delete `/etc/ana-brain/drive-oauth.json`
on the legacy host only after the revocation.
