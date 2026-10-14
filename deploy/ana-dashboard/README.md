# ANA LUMEN on ana.dyai.cloud (LIVE-01)

Private deployment of `apps/dashboard` on the DYAI VPS. Only the identities on the invite list can reach it.

```
browser ──▶ Cloudflare Access (Google login, policy: exact invited emails)
        ──▶ Cloudflare Tunnel "ana-dashboard" (outbound from the VPS, origin check: Access JWT required)
        ──▶ compose service `tunnel` (cloudflared) ──▶ `dashboard:3000` on the private compose network
        ──▶ src/proxy.ts + API routes verify the Access JWT again (issuer, AUD, signature, invited email)
```

- No host port is published and nginx/certbot on the VPS are not involved. The origin cannot be reached around
  Cloudflare: there is nothing listening for it.
- Secrets live only in `/opt/ana-dashboard/dashboard.env` and `tunnel.env` (root:root, 600). See the `*.example` files.
- Jira is not configured on the server until the least-privilege integration account of ANA-33 exists; the Jira
  views then show "not configured".
- The image is built by the `dashboard-image` workflow (amd64, with the access gate tested inside the container)
  and kept as the artifact `ana-dashboard-<sha>`.

## One-time setup on the VPS

```bash
ssh root@srv1308064.hstgr.cloud 'install -d -m 700 /opt/ana-dashboard'
scp deploy/ana-dashboard/{compose.yml,release.sh,dashboard.env.example,tunnel.env.example} root@srv1308064.hstgr.cloud:/opt/ana-dashboard/
# then on the VPS: create dashboard.env and tunnel.env from the *.example files (root:root, chmod 600)
```

`ANA_ACCESS_MODE=cloudflare` is pinned in compose.yml and is the image default, and the image refuses every other
mode (`ANA_CONTAINER=1`), so a lost or wrong env line can only make the dashboard refuse everything (503), never
trust the Host header.

## Release

```bash
SHA=<full git sha of main>
gh run download -R DYAI2025/Ana -n ana-dashboard-$SHA -D /tmp/ana-$SHA
ssh root@srv1308064.hstgr.cloud 'docker load' < /tmp/ana-$SHA/ana-dashboard-$SHA.tar.gz
ssh root@srv1308064.hstgr.cloud /opt/ana-dashboard/release.sh $SHA
```

`release.sh` refuses an image that is not loaded and secret files that are not root/600, switches `ANA_RELEASE`
atomically, recreates the dashboard and counts the release as verified only when the container is healthy **and**
the access gate answers 401 to a request without an Access assertion (503 = Access settings missing or wrong).
Only verified releases are appended to `.release.history`. Every loaded image stays on the host until removed by hand.
Re-running the current SHA recreates the container, which also recovers a dashboard that hangs while alive.

## Rollback

```bash
ssh root@srv1308064.hstgr.cloud /opt/ana-dashboard/release.sh --rollback
```

Goes to the most recent verified release other than the current one; a failed release is never a target. With no
earlier verified release (first deploy) it refuses and changes nothing.

Emergency stop (the hostname then shows a Cloudflare error, nothing is exposed):
`ssh root@srv1308064.hstgr.cloud 'cd /opt/ana-dashboard && docker compose stop tunnel'`.

## Verify after every release

- `curl -sI https://ana.dyai.cloud/` → redirect to `<team>.cloudflareaccess.com` (no app content)
- `curl -s https://ana.dyai.cloud/api/social/instagram` → no data without a login
- invited account logs in and sees Now and Pulse → Instagram; an uninvited Google account is refused
- `docker compose ps` → dashboard `healthy`, tunnel `Up` (cloudflared has no health check of its own)

Known limit: Docker restarts a container only when it exits. A dashboard that hangs while alive is marked
`unhealthy` but not restarted automatically; `release.sh <current sha>` recreates it.
