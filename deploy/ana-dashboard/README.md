# ANA LUMEN release contract (ANA-41, ANA-42, ADR-ANA-001)

**Host: the existing Contabo VPS `vmi3693936` (Ubuntu 24.04) is the only deployment environment for ANA LUMEN and
every other ANA application** (Product Owner decision of 2026-10-27, recorded in
[ADR-ANA-001](https://dyai2026.atlassian.net/wiki/spaces/Ana/pages/124977153) v3, which supersedes its earlier
ArchServer hosting decision; Cloudflare Access v1 and the Jira service-account decision stay valid). No other host is
a deployment target, a reference host or a test host for ANA. A different host needs a new explicit Product Owner
decision.

- **ANA owns** the application, its build, its app-level security and this release contract (sections 1 and 2).
- **The Contabo host operation** covers the systemd installation, the Cloudflare Tunnel connector, secret
  provisioning, monitoring, recovery and the actual release (sections 3 and 4). Each production change needs the
  Product Owner's action-specific approval.

Section 4 is the implementation that runs on `vmi3693936`. Nothing in this directory authorizes a deployment, a DNS
change, an Access or Tunnel change, a credential change or a host change.

## 1. Mandatory app-level invariants

These hold for every deployment of `apps/dashboard`, whatever host, supervisor or ingress runs it. CI tests the app
side: `.github/workflows/dashboard.yml` runs the unit tests of the access gate (401 without or with an invalid
assertion, 403 for an uninvited identity, signature, issuer, AUD, expiry) and of the Origin-against-Host check, and
scans the client bundle for secrets; `.github/workflows/dashboard-image.yml` tests the real image and the extracted
bundle (503 without settings or in any other mode, 401 without an assertion, pinned mode against a hostile credential
file, loopback bind, Node 24) and publishes the bundle with its sha256. Whether a deployment meets the invariants is
shown only by its evidence (section 2).

1. **Artifact.** Release only `ana-dashboard-app-<sha>.tar.gz` with its `.sha256` from a **successful push run of
   `dashboard-image` on `main`** for that commit, and verify the checksum before unpacking. A pull_request run builds
   the PR head and names its outputs `pr-<sha>` (artifact `ana-dashboard-pr-<sha>`), any other run that is not a push
   to `main` (e.g. `workflow_dispatch`) `test-<sha>`; both are test output kept 3 days, never a release. The name alone
   is not trusted: pull_request runs before 329f4a9 uploaded release-shaped `ana-dashboard-<sha>` artifacts, often
   named after GitHub's test merge commit. `deploy/fetch-release.sh` therefore checks the run itself through the
   GitHub API (event push, branch `main`, that commit, success, this workflow, no fork) before it downloads, and
   `release.sh` refuses any bundle whose `.ana-build` (written by the run into the bundle, covered by the `.sha256`)
   does not say event push, ref `refs/heads/main`, workflow `dashboard-image.yml` and that commit; bundles built
   before this rule have no `.ana-build` and are refused. `deploy/test-release-provenance.sh` proves both in CI. The
   bundle is the `/app` of the image whose access gate CI tested, plus that `.ana-build`; it is built for linux/amd64
   only, and its only native code is `sharp` for linux-x64/glibc.
2. **Runtime.** A Node version the bundle was tested with. The app declares Node >= 22.12; CI builds and tests the
   image on Node 22 and runs the extracted bundle under v24.22.0 (the Node of the Contabo host, observed 2026-10-27), checking that the
   listening process executes that binary. Any other major is untested until CI covers it; before each release the
   operator confirms the host's `node --version` (section 2).
3. **Pinned security mode.** The process environment, set by the supervisor, contains `ANA_ACCESS_MODE=cloudflare`
   and `ANA_CONTAINER=1`, and no file a deployment reads may override them. With `ANA_CONTAINER=1` the app refuses
   every other mode with 503, so a lost or wrong setting fails closed. `node --env-file` keeps variables already in
   the environment (CI proves this with a hostile file that tries `ANA_ACCESS_MODE=loopback` and
   `HOSTNAME=0.0.0.0`); systemd's `EnvironmentFile=` would instead override `Environment=` and must not carry these
   settings.
4. **Access enforcement.** Required settings: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `ANA_ALLOWED_EMAILS`
   (exactly the invitees of the Access policy), see `dashboard.env.example`. The proxy and every data API route verify
   the Cloudflare Access JWT (RS256 signature against the team's keys, issuer, AUD, expiry, invited email). Missing or
   incomplete settings answer 503; a request without a valid assertion answers 401, a valid one for an identity that
   is not invited 403. An assertion the app cannot verify is refused, so without the team's keys nobody gets in; keys
   fetched earlier stay in use for the key cache's lifetime (jose default, 10 minutes).
5. **No direct origin.** The app's port must not be reachable from outside except through an ingress that enforces
   Cloudflare Access for the app's hostname. The ingress must not rewrite the Host header: the Jira write and
   Instagram read checks compare Origin with Host.
6. **Secret isolation.** Secrets never appear in the repository, the image, the client bundle, argv, unit files or
   logs, and on the host only the service and its operator can read them. How they get there is decided for the Contabo host
   (sections 3 and 4).
7. **Health and gate signals.** `/api/healthz` answers 200; `/` without an assertion answers 401 (503 = Access
   settings missing or wrong). Both together are the minimum for a release to count as started. A wrong but
   well-formed AUD passes both; only a real login proves it (section 2).

## 2. Evidence required for an actual deployment

A deployment counts as done only with this evidence, recorded by whoever runs the release on Contabo and kept out of the
public repository (private evidence):

- the commit sha, the `dashboard-image` push run id on `main` and a matching sha256 of the bundle (invariant 1);
- the host's `node --version` (invariant 2) and the supervisor configuration showing the pinned settings of
  invariant 3;
- on the host, `/api/healthz` → 200 and `/` without an assertion → 401 (invariant 7);
- listening sockets on the host: the app port is not bound to a public interface or otherwise reachable around the
  ingress (invariant 5);
- from outside, without a login: `https://<hostname>/` redirects to `<team>.cloudflareaccess.com` (no app content)
  and `/api/social/instagram` does not answer 200 (invariants 4, 5);
- each invited account logs in and sees Now, Pulse → Instagram and the Board; an uninvited account is refused
  (invariant 4);
- the ingress configuration shows no Host header override, and once Jira is configured one Board write succeeds
  (the Origin-against-Host check passes) (invariant 5);
- where the secrets are held and who can read them, and that the process arguments, the unit or supervisor files and
  the logs since the start contain no secret value, checked by length or hash only, never by printing it
  (invariant 6);
- the rollback target (the previous verified release) and how it is reached.

## 3. Host and operator decisions (Contabo, separate approval)

Decided for the Contabo host under the Product Owner's approvals, not by this contract; section 4 records the current
choices:

- ingress configuration (Cloudflare Tunnel `ana-dashboard`), hostname and DNS;
- the Cloudflare Access application and policy setup (the policy's invitees must equal `ANA_ALLOWED_EMAILS`);
- supervisor and unit names, paths, service user, resource limits and hardening;
- how secrets are provisioned and rotated;
- monitoring, backups, recovery, the release and rollback mechanism, and when a release goes out.

## 4. Contabo implementation (`vmi3693936`)

`dyai-ana-dashboard.service`, `dyai-ana-tunnel.service` and `release.sh` satisfy section 1 on the Contabo VPS
`vmi3693936` (Ubuntu 24.04 x86_64, systemd, no Docker). The ANA-42 release of 2026-10-27 (Jira ANA-42, comment
18133) observed on the host: node v24.22.0, cloudflared 2026.10.3, both units installed and identical to these files,
`/srv/dyai/runtime/ana-dashboard/release.sh` byte-identical to `release.sh`. That is a dated observation, not a live
guarantee: before each release, compare the host's units and `release.sh` with this directory and stop on an
unexplained difference. CI lints these files, not the host, and each check proves only what it states. In the dashboard unit it pins the two `Environment=` lines and the single `ExecStart=` the
native-bundle test also starts with (invariants 3, 5, 6) and refuses `EnvironmentFile=`, `UnsetEnvironment=`,
`PassEnvironment=`, further `Environment=` or `ExecStart=` lines and `MemoryDenyWriteExecute=` (V8 aborts under it);
HOME and the node path are pinned only so that a change to them gets reviewed. In the tunnel unit it checks only
that the token is read from the unit's systemd credential, that no `EnvironmentFile=` and no secret-like
`Environment=` line (TOKEN, KEY, AUD, EMAIL) is used, and that metrics are served on `127.0.0.1:20242`, where
`release.sh` polls them. It does not lint how cloudflared is invoked otherwise, so review any other change to the tunnel
unit by hand against invariants 5 and 6.

```
browser ──▶ Cloudflare Access (application ANA LUMEN, policy: exactly the three invited emails)
        ──▶ Cloudflare Tunnel "ana-dashboard" (remotely managed, outbound from the Contabo VPS)
        ──▶ dyai-ana-tunnel.service (cloudflared) ──▶ http://127.0.0.1:3410
        ──▶ dyai-ana-dashboard.service (node server.js): src/proxy.ts + API routes verify the Access JWT again
            (issuer, AUD, RS256 signature, invited email)
```

- Nothing listens on a public interface: the dashboard binds 127.0.0.1:3410, cloudflared connects outbound. No
  firewall or SSH change. Other services on the host are not touched.
- `ANA_ACCESS_MODE=cloudflare`, `ANA_CONTAINER=1`, `HOSTNAME=127.0.0.1` and `PORT=3410` are pinned with `Environment=`
  in the unit. Secrets reach node as a credential file read with `node --env-file`, so a stray line in it cannot
  switch to Host-header trust or another bind address. There is deliberately no `EnvironmentFile=`.
- Secrets live only in `/etc/dyai/credentials/ana-dashboard/` (root:root, dir 700, files 600): `dashboard_env`
  (see `dashboard.env.example`) and `tunnel_token` (the connector token of the tunnel, one line). Both reach the
  services only through `LoadCredential=`; nothing secret is in argv, unit files or the journal.
- Jira is not configured until the least-privilege integration account of ANA-33 exists; the Jira views then show
  "not configured".

### One-time setup (owner, root on `vmi3693936`)

Already done on `vmi3693936`; kept for a reinstall or recovery, which needs the Product Owner's approval. In the
commands below `<contabo>` is the operator's own SSH target for `vmi3693936` (root, key-based login); it is not part
of this repository. Check the host key fingerprint before trusting the session.

Cloudflare (dashboard, account of `dyai.cloud`):

1. Zero Trust → Networks → Tunnels → `ana-dashboard` → Public hostname: `ana.dyai.cloud` → `http://127.0.0.1:3410`.
   This also creates the proxied CNAME `ana.dyai.cloud`. Under Additional settings → Access: "Protect with Access"
   for the ANA LUMEN application (cloudflared then refuses requests without a valid assertion as well).
2. Copy the tunnel's connector token (Install connector → the `eyJ…` value) for the host setup below.
3. Access application ANA LUMEN: AUD tag and team domain for `dashboard_env`; the allow policy holds exactly the
   three invited emails, and `ANA_ALLOWED_EMAILS` lists the same three. Do not set an HTTP Host header override on the
   route (invariant 5).

Host (attended root shell, `ssh -t <contabo>`):

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

### Release

```bash
SHA=<full git sha of main>
# only the artifact of the successful push run on main for that commit (invariant 1); stops on anything else
deploy/fetch-release.sh dashboard "$SHA" /tmp/ana-$SHA
ssh <contabo> install -d -m 700 /root/ana-release-in-$SHA
scp /tmp/ana-$SHA/ana-dashboard-app-$SHA.tar.gz{,.sha256} <contabo>:/root/ana-release-in-$SHA/
# runs as a transient unit, so a dropped ssh session cannot kill it half way
ssh -t <contabo> systemd-run --unit=ana-release --wait --collect /srv/dyai/runtime/ana-dashboard/release.sh $SHA /root/ana-release-in-$SHA
ssh <contabo> journalctl -u ana-release -o cat -n 50
```

`release.sh` takes a lock, refuses credential files that are empty or not root:root/600, a team domain whose signing
keys are not reachable from the host, a bundle whose checksum does not match, a bundle whose `.ana-build` does not
name a push run of `dashboard-image` on `main` for that commit (invariant 1; `release.sh --check-bundle <sha> <dir>`
runs only this check and touches nothing) and a bundle with symlinks that leave it.
It unpacks the bundle read-only under `releases/<sha>` (`.next/cache` points at the unit's CacheDirectory; kept data such as the world's daily audience history lives in the unit's StateDirectory, `/var/lib/private/dyai/ana-dashboard` under DynamicUser, which `systemctl clean --what=cache` leaves alone), switches
`current` atomically, restarts the dashboard (after `reset-failed`, so an earlier crash loop cannot block the start)
and counts the release as verified only when the unit is active, `/api/healthz` answers 200 from the unit's own
process **and** the access gate answers 401 to a request without an Access assertion (503 = Access settings missing
or wrong). A failing release is replaced at once by the newest verified release in `.release.history`, which is
checked the same way; if there is none or it fails too, dashboard and tunnel are disabled and the output says
`SITE DOWN`. Only a verified release enables the tunnel, which must then report a connection on `127.0.0.1:20242/ready`,
and is appended to `.release.history`. A wrong but well-formed AUD passes these checks; only a real login proves it
(see Verify). Re-running with the same sha reuses the unpacked release.

### Rollback

```bash
ssh -t <contabo> systemd-run --unit=ana-release --wait --collect /srv/dyai/runtime/ana-dashboard/release.sh --rollback
```

Goes to the most recent verified release other than the current one; a failed release is never a target. A rollback
is itself recorded as a release, so a second `--rollback` returns to the release you just left. With no earlier
verified release (first deploy) it refuses and changes nothing. Like a release, it runs through `systemd-run`.

Emergency stop (the hostname then shows a Cloudflare error, nothing is exposed):
`ssh -t <contabo> systemctl mask --now dyai-ana-tunnel.service`. Masked, the tunnel stays off even when release.sh runs
(it then stops with "tunnel ... could not start"); `systemctl unmask` undoes it. Full removal additionally disables
`dyai-ana-dashboard.service` and deletes the two unit files, `/srv/dyai/runtime/ana-dashboard` and
`/etc/dyai/credentials/ana-dashboard`; the public hostname is removed in the tunnel's settings.

### Verify after every release

Part of the section 2 evidence, in this section's terms; record the rest of section 2 as well:

- `curl -sI https://ana.dyai.cloud/` → redirect to `<team>.cloudflareaccess.com` (no app content)
- `curl -s -o /dev/null -w '%{http_code}' https://ana.dyai.cloud/api/social/instagram` → not 200 without a login
- each invited account logs in and sees Now, Pulse → Instagram and the Board; an uninvited account is refused
- on the host: `systemctl is-active dyai-ana-dashboard dyai-ana-tunnel` → `active active`;
  `ss -ltn` shows `127.0.0.1:3410` and `127.0.0.1:20242`, nothing new on `0.0.0.0`;
  `curl -s http://127.0.0.1:20242/ready` → `{"status":200,…}` with at least one connection

Known limit: systemd restarts the dashboard when it exits, not when it hangs while alive; restart it with
`ssh -t <contabo> systemctl restart dyai-ana-dashboard.service`.
