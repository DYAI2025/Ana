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

## Release

```bash
SHA=<full git sha of main>
gh run download -R DYAI2025/Ana -n ana-dashboard-$SHA -D /tmp/ana-$SHA
ssh root@srv1308064.hstgr.cloud 'docker load' < /tmp/ana-$SHA/ana-dashboard-$SHA.tar.gz
ssh root@srv1308064.hstgr.cloud "cd /opt/ana-dashboard && cp .env .env.previous && sed -i 's/^ANA_RELEASE=.*/ANA_RELEASE=$SHA/' .env && docker compose up -d"
```

## Rollback

The previous image stays loaded. Restore the previous release and recreate the dashboard:

```bash
ssh root@srv1308064.hstgr.cloud 'cd /opt/ana-dashboard && cp .env.previous .env && docker compose up -d dashboard'
```

Emergency stop (the hostname then shows a Cloudflare error, nothing is exposed):
`ssh root@srv1308064.hstgr.cloud 'cd /opt/ana-dashboard && docker compose stop tunnel'`.

## Verify after every release

- `curl -sI https://ana.dyai.cloud/` → redirect to `<team>.cloudflareaccess.com` (no app content)
- `curl -s https://ana.dyai.cloud/api/social/instagram` → no data without a login
- invited account logs in and sees Now and Pulse → Instagram; an uninvited Google account is refused
- `docker compose ps` → both services healthy
