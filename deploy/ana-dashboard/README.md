# ANA LUMEN on ana.dyai.cloud (LIVE-01, ANA-DASH-GOLIVE-01)

Private deployment of `apps/dashboard` on the Arch host (`ssh arch`, Arch Linux x86_64, systemd, no Docker).
Only the identities on the invite list can reach it.

```
browser ──▶ Cloudflare Access (application ANA LUMEN, policy: exactly the three invited emails)
        ──▶ Cloudflare Tunnel "ana-dashboard" (remotely managed, outbound from the Arch host)
        ──▶ dyai-ana-tunnel.service (cloudflared) ──▶ http://127.0.0.1:3410
        ──▶ dyai-ana-dashboard.service (node server.js): src/proxy.ts + API routes verify the Access JWT again
            (issuer, AUD, RS256 signature, invited email)
```

- Nothing listens on a public interface: the dashboard binds 127.0.0.1:3410, cloudflared connects outbound. No router,
  firewall or SSH change. The canary units (`dyai-canary-*`, tunnel `dyai-archcanary`) and Hermes are not touched.
- `ANA_ACCESS_MODE=cloudflare`, `ANA_CONTAINER=1`, `HOSTNAME=127.0.0.1` and `PORT=3410` are pinned with `Environment=`
  in the unit. Secrets reach node as a credential file read with `node --env-file`, and variables already in the
  environment win over that file, so a stray line in it cannot switch to Host-header trust or another bind address
  (CI proves this with a hostile file). With `ANA_CONTAINER=1` the app refuses every other mode (503): a lost setting
  fails closed. There is deliberately no `EnvironmentFile=`, which would override `Environment=`.
- Secrets live only in `/etc/dyai/credentials/ana-dashboard/` (root:root, dir 700, files 600): `dashboard_env`
  (see `dashboard.env.example`) and `tunnel_token` (the connector token of the tunnel, one line). Both reach the
  services only through `LoadCredential=`, as with the canary units; nothing secret is in argv, unit files or the journal.
- Jira is not configured until the least-privilege integration account of ANA-33 exists; the Jira views then show
  "not configured".
- The bundle is the `/app` of the image built by the `dashboard-image` workflow (amd64, access gate tested inside the
  container, and the extracted bundle tested again under Node 24, the Node of the Arch host). Its only native code is
  `sharp` for linux-x64/glibc. Release only artifacts of **push runs on main**: a pull_request run builds the merge
  ref, so its `<sha>` names a merge commit, not the PR head.

## One-time setup (owner, root on the Arch host)

Cloudflare (dashboard, account of `dyai.cloud`):

1. Zero Trust → Networks → Tunnels → `ana-dashboard` → Public hostname: `ana.dyai.cloud` → `http://127.0.0.1:3410`.
   This also creates the proxied CNAME `ana.dyai.cloud`. Under Additional settings → Access: "Protect with Access"
   for the ANA LUMEN application (cloudflared then refuses requests without a valid assertion as well).
2. Copy the tunnel's connector token (Install connector → the `eyJ…` value) for the host setup below.
3. Access application ANA LUMEN: AUD tag and team domain for `dashboard_env`; the allow policy holds exactly the
   three invited emails, and `ANA_ALLOWED_EMAILS` lists the same three. Do not set an HTTP Host header override on the
   route: the Jira write and Instagram read checks compare Origin with the Host `ana.dyai.cloud`.

Host (attended root shell, e.g. `ssh -t arch sudo -i`):

```bash
install -d -m 755 /srv/dyai/runtime/ana-dashboard /srv/dyai/runtime/ana-dashboard/releases
install -d -m 700 /etc/dyai/credentials/ana-dashboard
install -m 600 /dev/null /etc/dyai/credentials/ana-dashboard/dashboard_env   # then fill it with an editor (not echo)
install -m 600 /dev/null /etc/dyai/credentials/ana-dashboard/tunnel_token
# paste the token without it reaching the shell history or the screen:
read -rs T && printf '%s\n' "$T" > /etc/dyai/credentials/ana-dashboard/tunnel_token && unset T
# from a checkout of this repo, copied to the host first:
install -m 644 dyai-ana-dashboard.service dyai-ana-tunnel.service /etc/systemd/system/
install -m 755 release.sh /srv/dyai/runtime/ana-dashboard/release.sh
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/dyai-ana-dashboard.service /etc/systemd/system/dyai-ana-tunnel.service
```

## Release

```bash
SHA=<full git sha of main>
# only the artifact of the successful push run on main for that commit (a PR run builds the merge ref)
RUN=$(gh run list -R DYAI2025/Ana -w dashboard-image.yml -b main -e push -c "$SHA" -s success --json databaseId -q '.[0].databaseId')
[ -n "$RUN" ] && gh run download "$RUN" -R DYAI2025/Ana -n ana-dashboard-$SHA -D /tmp/ana-$SHA
scp /tmp/ana-$SHA/ana-dashboard-app-$SHA.tar.gz{,.sha256} arch:/tmp/
# runs as a transient unit, so a dropped ssh session cannot kill it half way
ssh -t arch sudo systemd-run --unit=ana-release --wait --collect /srv/dyai/runtime/ana-dashboard/release.sh $SHA /tmp
ssh arch journalctl -u ana-release -o cat -n 50
```

`release.sh` takes a lock, refuses credential files that are empty or not root:root/600, a team domain whose signing
keys are not reachable from the host, a bundle whose checksum does not match and a bundle with symlinks that leave it.
It unpacks the bundle read-only under `releases/<sha>` (`.next/cache` points at the unit's CacheDirectory), switches
`current` atomically, restarts the dashboard (after `reset-failed`, so an earlier crash loop cannot block the start)
and counts the release as verified only when the unit is active, `/api/healthz` answers 200 from the unit's own
process **and** the access gate answers 401 to a request without an Access assertion (503 = Access settings missing
or wrong). A failing release is replaced at once by the newest verified release in `.release.history`, which is
checked the same way; if there is none or it fails too, dashboard and tunnel are disabled and the output says
`SITE DOWN`. Only a verified release enables the tunnel, which must then report a connection on `127.0.0.1:20242/ready`,
and is appended to `.release.history`. A wrong but well-formed AUD passes these checks; only a real login proves it
(see Verify). Re-running with the same sha reuses the unpacked release.

## Rollback

```bash
ssh -t arch sudo /srv/dyai/runtime/ana-dashboard/release.sh --rollback
```

Goes to the most recent verified release other than the current one; a failed release is never a target. A rollback
is itself recorded as a release, so a second `--rollback` returns to the release you just left. With no earlier
verified release (first deploy) it refuses and changes nothing. Run it through `systemd-run` like a release.

Emergency stop (the hostname then shows a Cloudflare error, nothing is exposed):
`ssh -t arch sudo systemctl mask --now dyai-ana-tunnel.service`. Masked, the tunnel stays off even when release.sh runs
(it then stops with "tunnel ... could not start"); `systemctl unmask` undoes it. Full removal additionally disables
`dyai-ana-dashboard.service` and deletes the two unit files, `/srv/dyai/runtime/ana-dashboard` and
`/etc/dyai/credentials/ana-dashboard`; the public hostname is removed in the tunnel's settings.

## Verify after every release

- `curl -sI https://ana.dyai.cloud/` → redirect to `<team>.cloudflareaccess.com` (no app content)
- `curl -s -o /dev/null -w '%{http_code}' https://ana.dyai.cloud/api/social/instagram` → not 200 without a login
- each invited account logs in and sees Now, Pulse → Instagram and the Board; an uninvited account is refused
- on the host: `systemctl is-active dyai-ana-dashboard dyai-ana-tunnel` → `active active`;
  `ss -ltn` shows `127.0.0.1:3410` and `127.0.0.1:20242`, nothing new on `0.0.0.0`;
  `curl -s http://127.0.0.1:20242/ready` → `{"status":200,…}` with at least one connection

Known limit: systemd restarts the dashboard when it exits, not when it hangs while alive; restart it with
`ssh -t arch sudo systemctl restart dyai-ana-dashboard.service`.
