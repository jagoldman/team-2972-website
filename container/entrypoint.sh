#!/bin/sh
# Fail closed: without a usable secret the portal gate would be meaningless.
set -eu

for v in PORT SITE_DOMAIN SITE_SCHEME PROXY_SHARED_SECRET; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then
    echo "{\"level\":\"error\",\"msg\":\"$v is not set\"}" >&2
    exit 1
  fi
done

# Caddy's header matcher treats * as a wildcard, and spaces would split the value.
case "$PROXY_SHARED_SECRET" in
  *'*'* | *' '*)
    echo '{"level":"error","msg":"PROXY_SHARED_SECRET must not contain * or spaces"}' >&2
    exit 1 ;;
esac
if [ "${#PROXY_SHARED_SECRET}" -lt 16 ]; then
  echo '{"level":"error","msg":"PROXY_SHARED_SECRET is shorter than 16 characters"}' >&2
  exit 1
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
