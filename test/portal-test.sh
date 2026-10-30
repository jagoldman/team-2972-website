#!/bin/sh
# Renders the portal in headless Chrome for one fake user per group and checks the tiles.
# A front Caddy stands in for infra's: it adds the secret and the identity headers.
# Usage: test/portal-test.sh   (needs docker and Google Chrome)
set -eu
cd "$(dirname "$0")/.."

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
SECRET=test-secret-not-real-0000
NET=landing-test-net-$$
LANDING=landing-test-$$
PROXY=landing-proxy-$$
HOST_PORT=${HOST_PORT:-13080}

docker build -q -t 2972/landing:test . >/dev/null
docker network create "$NET" >/dev/null
cleanup() {
  docker rm -f "$LANDING" "$PROXY" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$LANDING" --network "$NET" --network-alias landing \
  -e PORT=3001 -e SITE_DOMAIN=localhost -e SITE_SCHEME=http -e PROXY_SHARED_SECRET=$SECRET \
  -v "$PWD/test/fixtures/apps.json:/config/apps.json:ro" 2972/landing:test >/dev/null

PROXY_CONF=$(mktemp -d)
cat >"$PROXY_CONF/Caddyfile" <<'EOF'
{
	admin off
	auto_https off
}
:8080 {
	reverse_proxy landing:3001 {
		header_up X-Proxy-Secret {env.SECRET}
		header_up X-Authentik-Name {env.T_NAME}
		header_up X-Authentik-Email {env.T_EMAIL}
		header_up X-Authentik-Groups {env.T_GROUPS}
		header_up X-Authentik-Uid u-test
	}
}
EOF

fail=0
# run_user <groups> <expected tile names, comma-separated, in order> <expect notice: yes|no>
run_user() {
  groups=$1; want=$2; notice=$3
  docker rm -f "$PROXY" >/dev/null 2>&1 || true
  docker run -d --name "$PROXY" --network "$NET" -p "127.0.0.1:$HOST_PORT:8080" \
    -e SECRET=$SECRET -e "T_GROUPS=$groups" -e "T_NAME=Test <$groups>" -e "T_EMAIL=check@example.com" \
    -v "$PROXY_CONF/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11.7-alpine >/dev/null
  i=0; until curl -fs "http://127.0.0.1:$HOST_PORT/healthz" >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep 0.2; done

  dom=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROXY_CONF/chrome" \
    --virtual-time-budget=5000 --dump-dom "http://portal.localhost:$HOST_PORT/" 2>/dev/null)
  got=$(printf '%s' "$dom" | tr '\n' ' ' | sed 's/.*id="app-grid"//; s/id="app-empty".*//' \
    | grep -o '<h3>[^<]*</h3>' | sed 's/<[^>]*>//g' | paste -sd, - || true)
  has_notice=no
  printf '%s' "$dom" | grep -q 'id="no-group">' && has_notice=yes
  greet=$(printf '%s' "$dom" | tr '\n' ' ' | grep -o '<span[^>]*id="name"[^>]*>[^<]*' | sed 's/.*>//')
  label=${groups:-"(no group)"}
  if [ "$got" = "$want" ] && [ "$has_notice" = "$notice" ]; then
    echo "ok   $label: [$got] notice=$has_notice greeting='$greet'"
  else
    echo "FAIL $label: want [$want] notice=$notice, got [$got] notice=$has_notice"; fail=1
  fi
}

ALL="Task App,Admin,Everyone Link,Alumni News,Scouting"
run_user "admin"            "Task App,Admin,Everyone Link"                    no
run_user "mentor"           "Task App,Everyone Link,Alumni News,Scouting"     no
run_user "student"          "Task App,Everyone Link,Scouting"                 no
run_user "parent"           "Task App,Everyone Link"                          no
run_user "alumni"           "Everyone Link,Alumni News"                       no
run_user "mentor|parent"    "Task App,Everyone Link,Alumni News,Scouting"     no
run_user ""                 ""                                                yes
run_user "authentik Admins" ""                                                yes

rm -rf "$PROXY_CONF"
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
