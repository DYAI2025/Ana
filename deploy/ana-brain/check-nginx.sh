#!/usr/bin/env bash
# nginx -t of both site files with the distribution nginx of the Contabo host (Ubuntu 24.04: nginx 1.24),
# installed the way README.md section 4 installs it. Runs as root in CI (ubuntu-24.04 runner) or in an
# ubuntu:24.04 container; never on the host itself. Usage: check-nginx.sh <deploy/ana-brain dir>
set -euo pipefail
d="$(cd "$1" && pwd)"
fail() { echo "check-nginx: $*" >&2; exit 1; }

# another nginx would parse other directives (http2 on; needs 1.25.1): test the parser the host runs
v="$(nginx -v 2>&1)"
[[ "$v" == "nginx version: nginx/1.24."* ]] || fail "expected the Ubuntu 24.04 nginx 1.24, got: $v"

live=/etc/letsencrypt/live/mcp.ana.dyai.cloud
install -d -m 0755 "$live" /var/www/certbot
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=mcp.ana.dyai.cloud \
  -keyout "$live/privkey.pem" -out "$live/fullchain.pem" 2>/dev/null
rm -f /etc/nginx/sites-enabled/default

for site in nginx-mcp.ana.dyai.cloud.acme.conf nginx-mcp.ana.dyai.cloud.conf; do
  rm -f /etc/nginx/sites-enabled/mcp.ana.dyai.cloud
  install -m 0644 "$d/$site" /etc/nginx/sites-enabled/mcp.ana.dyai.cloud
  out="$(nginx -t 2>&1)" || fail "$site: $out"
  # a warning (deprecated or conflicting directive) is a defect too
  if grep -q '\[warn\]' <<<"$out"; then fail "$site: $out"; fi
  echo "check-nginx: $site ok"
done
