#!/bin/sh
# Builds the landing image, runs it alone with a throwaway secret and fake apps.json, and checks
# the gate with hand-sent headers. Usage: test/container-test.sh   (needs docker and curl)
set -eu
cd "$(dirname "$0")/.."

IMAGE=2972/landing:test
NAME=landing-test-$$
HOST_PORT=${HOST_PORT:-13001}
SECRET=test-secret-not-real-0000
D=localhost

docker build -q -t "$IMAGE" . >/dev/null
docker run -d --rm --name "$NAME" -p "127.0.0.1:$HOST_PORT:3001" \
  -e PORT=3001 -e SITE_DOMAIN=$D -e SITE_SCHEME=http -e PROXY_SHARED_SECRET=$SECRET \
  -v "$PWD/test/fixtures/apps.json:/config/apps.json:ro" "$IMAGE" >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

URL="http://127.0.0.1:$HOST_PORT"
i=0; until curl -fs "$URL/healthz" >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 50 ] || { docker logs "$NAME"; exit 1; }; sleep 0.2; done

fail=0
FAKE="-H X-Authentik-Email:pat@example.com -H X-Authentik-Groups:admin -H X-Authentik-Name:Pat"

# check <expected status> <description> <curl args...>
check() {
  want=$1; desc=$2; shift 2
  got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  if [ "$got" = "$want" ]; then echo "ok   $want $desc"; else echo "FAIL $desc: want $want, got $got"; fail=1; fi
}

# body <expected exact body> <description> <curl args...>
body() {
  want=$1; desc=$2; shift 2
  got=$(curl -s "$@")
  if [ "$got" = "$want" ]; then echo "ok   body $desc"; else echo "FAIL $desc: want '$want', got '$got'"; fail=1; fi
}

echo "-- health"
check 200 "/healthz, no secret" "$URL/healthz"
body '{"status":"ok"}' "/healthz" "$URL/healthz"
check 200 "/healthz on portal host, no secret" -H "Host: portal.$D" "$URL/healthz"

echo "-- portal host needs the secret"
for p in / /me.json /apps.json /portal/ /css/style.css /about.html; do
  check 401 "portal $p, no secret, fake headers" -H "Host: portal.$D" $FAKE "$URL$p"
  check 401 "portal $p, wrong secret" -H "Host: portal.$D" -H "X-Proxy-Secret: wrong" $FAKE "$URL$p"
done
check 401 "portal, secret plus extra characters" -H "Host: portal.$D" -H "X-Proxy-Secret: $SECRET-x" "$URL/me.json"

echo "-- direct requests (Host: landing) to portal paths need the secret"
for p in /me.json /apps.json /portal/ /portal/index.html; do
  check 401 "direct $p, no secret, fake headers" -H "Host: landing" $FAKE "$URL$p"
  check 401 "direct $p, wrong secret" -H "Host: landing" -H "X-Proxy-Secret: wrong" "$URL$p"
done

echo "-- with the secret"
S="-H X-Proxy-Secret:$SECRET"
check 200 "portal / (portal page)" -H "Host: portal.$D" $S "$URL/"
check 200 "portal /apps.json" -H "Host: portal.$D" $S "$URL/apps.json"
check 200 "portal /me.json" -H "Host: portal.$D" $S "$URL/me.json"
check 200 "portal /css/style.css" -H "Host: portal.$D" $S "$URL/css/style.css"
check 302 "portal /about.html redirects to public host" -H "Host: portal.$D" $S "$URL/about.html"
body '{"email":"pat@example.com","name":"Pat \"O\u003cb\u003e","username":"pat@example.com","groups":"mentor|parent","uid":"u-1"}' \
  "me.json echoes headers, lowercases email, escapes \" and <" \
  -H "Host: portal.$D" $S -H "X-Authentik-Email: Pat@Example.com" -H 'X-Authentik-Name: Pat "O<b>' \
  -H "X-Authentik-Username: pat@example.com" -H "X-Authentik-Groups: mentor|parent" -H "X-Authentik-Uid: u-1" \
  "$URL/me.json"
body '{"email":"","name":"","username":"","groups":"","uid":""}' "me.json with no identity headers" \
  -H "Host: portal.$D" $S "$URL/me.json"
hdr=$(curl -s -D - -o /dev/null -H "Host: portal.$D" $S "$URL/apps.json" | tr -d '\r' | grep -i '^x-robots-tag:' || true)
if [ -n "$hdr" ]; then echo "ok   portal sends $hdr"; else echo "FAIL portal has no X-Robots-Tag"; fail=1; fi
# Nothing behind login may be cached, or a signed-out browser could still show it.
for p in / /me.json /apps.json /css/style.css /js/components.js; do
  cc=$(curl -s -D - -o /dev/null -H "Host: portal.$D" $S "$URL$p" | tr -d '\r' | grep -i '^cache-control:' | cut -d' ' -f2- || true)
  if [ "$cc" = "no-store" ]; then echo "ok   portal $p Cache-Control: no-store"; else echo "FAIL portal $p Cache-Control is '$cc'"; fail=1; fi
done
for p in /me.json /apps.json /portal/; do
  cc=$(curl -s -D - -o /dev/null -H "Host: landing" $S "$URL$p" | tr -d '\r' | grep -i '^cache-control:' | cut -d' ' -f2- || true)
  if [ "$cc" = "no-store" ]; then echo "ok   direct $p Cache-Control: no-store"; else echo "FAIL direct $p Cache-Control is '$cc'"; fail=1; fi
done

echo "-- public hosts never serve portal files"
for h in $D www.$D; do
  for p in /me.json /apps.json /portal/ /portal/index.html; do
    check 404 "$h $p even with the secret" -H "Host: $h" $S "$URL$p"
  done
  check 200 "$h / with forged headers" -H "Host: $h" $FAKE "$URL/"
done
check 302 "public /team-login.html redirects to portal" -H "Host: $D" "$URL/team-login.html"
check 200 "public /about.html" -H "Host: $D" "$URL/about.html"
cfg=$(curl -s -H "Host: $D" "$URL/config.js")
case "$cfg" in
  *"scheme: 'http'"*"domain: 'localhost'"*) echo "ok   config.js rendered from env" ;;
  *) echo "FAIL config.js not rendered: $cfg"; fail=1 ;;
esac

echo "-- nothing private in the image"
for f in /srv/site/README.md /srv/site/CLAUDE.md /srv/site/.git /srv/site/test /srv/site/docs /srv/site/container /srv/site/.env.example; do
  if docker exec "$NAME" test -e "$f"; then echo "FAIL image contains $f"; fail=1; fi
done
if docker exec "$NAME" sh -c 'find /srv/site -iname "*.jpg" -o -iname "*.png" | grep -q .'; then
  echo "FAIL image contains photos"; fail=1
else echo "ok   no photos or repo files in the image"; fi

[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
