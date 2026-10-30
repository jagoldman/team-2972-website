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
  -v "$PWD/test/fixtures/apps.json:/config/apps.json:ro" \
  -v "$PWD/test/fixtures/content:/srv/content:ro" -v "$PWD/test/fixtures/media:/srv/media:ro" "$IMAGE" >/dev/null
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
for p in / /install /me.json /apps.json /portal/ /css/style.css /fonts/inter-latin.woff2 /about.html; do
  check 401 "portal $p, no secret, fake headers" -H "Host: portal.$D" $FAKE "$URL$p"
  check 401 "portal $p, wrong secret" -H "Host: portal.$D" -H "X-Proxy-Secret: wrong" $FAKE "$URL$p"
done
check 401 "portal, secret plus extra characters" -H "Host: portal.$D" -H "X-Proxy-Secret: $SECRET-x" "$URL/me.json"

echo "-- direct requests (Host: landing) to portal paths need the secret"
for p in /me.json /apps.json /install /portal/ /portal/index.html; do
  check 401 "direct $p, no secret, fake headers" -H "Host: landing" $FAKE "$URL$p"
  check 401 "direct $p, wrong secret" -H "Host: landing" -H "X-Proxy-Secret: wrong" "$URL$p"
done

echo "-- with the secret"
S="-H X-Proxy-Secret:$SECRET"
check 200 "portal / (portal page)" -H "Host: portal.$D" $S "$URL/"
check 200 "portal /install (install page)" -H "Host: portal.$D" $S "$URL/install"
check 200 "portal /install/ (trailing slash)" -H "Host: portal.$D" $S "$URL/install/"
check 200 "portal /js/vendor/qrcode.js" -H "Host: portal.$D" $S "$URL/js/vendor/qrcode.js"
check 200 "portal /apps.json" -H "Host: portal.$D" $S "$URL/apps.json"
check 200 "portal /me.json" -H "Host: portal.$D" $S "$URL/me.json"
check 200 "portal /css/style.css" -H "Host: portal.$D" $S "$URL/css/style.css"
check 200 "portal /fonts/inter-latin.woff2" -H "Host: portal.$D" $S "$URL/fonts/inter-latin.woff2"
check 200 "portal /brand/team-2972-logo-256.png (header logo)" -H "Host: portal.$D" $S "$URL/brand/team-2972-logo-256.png"
check 200 "public /brand/team-2972-logo.png (resources download)" -H "Host: $D" "$URL/brand/team-2972-logo.png"
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
  for p in /me.json /apps.json /install /install/ /portal/ /portal/index.html /portal/install.html; do
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

echo "-- installable app: manifest, service worker, offline page, icons"
hdr_of() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
body_of() { curl -s "$@"; }
has_hdr() { echo "$1" | grep -qi "$2"; }
for h in $D www.$D landing; do
  check 200 "$h /manifest.webmanifest" -H "Host: $h" "$URL/manifest.webmanifest"
  check 200 "$h /sw.js" -H "Host: $h" "$URL/sw.js"
  check 200 "$h /offline.html" -H "Host: $h" "$URL/offline.html"
  check 200 "$h /pwa-icons/site/icon-512.png" -H "Host: $h" "$URL/pwa-icons/site/icon-512.png"
done
m=$(hdr_of -H "Host: $D" "$URL/manifest.webmanifest")
has_hdr "$m" '^content-type: application/manifest+json' && echo "ok   manifest is application/manifest+json" || { echo "FAIL manifest content type: $(echo "$m" | grep -i '^content-type')"; fail=1; }
has_hdr "$m" '^cache-control: no-cache' && echo "ok   manifest revalidates" || { echo "FAIL manifest cache header"; fail=1; }
body_of -H "Host: $D" "$URL/manifest.webmanifest" | grep -q '"short_name": "Team 2972"' && echo "ok   public host serves the site manifest" || { echo "FAIL public manifest"; fail=1; }
sw=$(hdr_of -H "Host: $D" "$URL/sw.js")
has_hdr "$sw" '^content-type: text/javascript' && echo "ok   sw.js is JavaScript" || { echo "FAIL sw.js content type: $(echo "$sw" | grep -i '^content-type')"; fail=1; }
has_hdr "$sw" '^cache-control: no-cache' && echo "ok   sw.js is never cached by the browser (no-cache)" || { echo "FAIL sw.js cache header"; fail=1; }
ic=$(hdr_of -H "Host: $D" "$URL/pwa-icons/site/icon-512.png")
has_hdr "$ic" '^content-type: image/png' && has_hdr "$ic" '^cache-control: public, max-age=86400' && echo "ok   icons are PNG and cacheable for a day" || { echo "FAIL icon headers"; fail=1; }
check 404 "public /pwa-icons/ listing is not served" -H "Host: $D" "$URL/pwa-icons/"
check 404 "public /pwa-icons/site/ listing is not served" -H "Host: $D" "$URL/pwa-icons/site/"
check 404 "public /pwa-icons/site/build.cjs is not served" -H "Host: $D" "$URL/pwa-icons/build-icons.cjs"
check 404 "public /pwa-icons/other/icon.svg (not an app) is not served" -H "Host: $D" "$URL/pwa-icons/other/icon.svg"
check 404 "public /portal/manifest.webmanifest is not served" -H "Host: $D" "$URL/portal/manifest.webmanifest"

echo "-- ...and the same files are public on the portal host, with no secret; nothing else is"
P="portal.$D"
check 200 "portal host /manifest.webmanifest, no secret" -H "Host: $P" "$URL/manifest.webmanifest"
check 200 "portal host /sw.js, no secret" -H "Host: $P" "$URL/sw.js"
check 200 "portal host /offline.html, no secret" -H "Host: $P" "$URL/offline.html"
for a in site portal tasks admin kickoff; do
  for f in icon.svg icon-192.png icon-512.png maskable-512.png apple-touch-icon.png; do
    check 200 "portal host /pwa-icons/$a/$f, no secret" -H "Host: $P" "$URL/pwa-icons/$a/$f"
  done
done
body_of -H "Host: $P" "$URL/manifest.webmanifest" | grep -q '"short_name": "2972 Portal"' && echo "ok   portal host serves the PORTAL manifest (2972 Portal)" || { echo "FAIL portal manifest"; fail=1; }
body_of -H "Host: $P" "$URL/manifest.webmanifest" | grep -q '/pwa-icons/portal/maskable-512.png' && echo "ok   the portal manifest uses the portal icons" || { echo "FAIL portal manifest icons"; fail=1; }
for p in / /me.json /apps.json /portal/index.html /portal/manifest.webmanifest /config.js /css/style.css /js/components.js /fonts/inter-latin.woff2 /about.html "/pwa-icons/../me.json" "/pwa-icons/site/../../apps.json" /pwa-icons/ /pwa-icons/build-icons.cjs /pwa-icons/other/icon.svg; do
  got=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -H "Host: $P" "$URL$p")
  case "$got" in 401|404) echo "ok   portal host $p still needs the secret or is not served ($got)" ;; *) echo "FAIL portal host $p without the secret got $got"; fail=1 ;; esac
done
check 401 "portal host /me.json, no secret" -H "Host: $P" "$URL/me.json"
check 401 "portal host /apps.json, no secret" -H "Host: $P" "$URL/apps.json"
check 200 "portal host /me.json with the secret still works" -H "Host: $P" $S "$URL/me.json"
nm=$(hdr_of -H "Host: $P" $S "$URL/")
has_hdr "$nm" '^cache-control: no-store' && echo "ok   the portal page itself is still no-store" || { echo "FAIL portal page cache header"; fail=1; }
oh=$(hdr_of -H "Host: $P" "$URL/offline.html")
has_hdr "$oh" '^x-robots-tag: noindex' && echo "ok   the offline page is kept out of search results" || { echo "FAIL offline page robots header"; fail=1; }
body_of -H "Host: $D" "$URL/offline.html" | grep -q "You're offline" && echo "ok   offline page says it" || { echo "FAIL offline page text"; fail=1; }

echo "-- published content (read-only mounts from the site editor)"
hdr_of() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
for h in $D www.$D; do
  check 200 "$h /content/content.json" -H "Host: $h" "$URL/content/content.json"
  check 200 "$h /media/00000000000000000001-400.webp" -H "Host: $h" "$URL/media/00000000000000000001-400.webp"
done
check 404 "the editor-only thumbnail is not served" -H "Host: $D" "$URL/media/00000000000000000001-thumb.webp"
check 404 "a media file with a width that is not stored is not served" -H "Host: $D" "$URL/media/00000000000000000001-9999.webp"
check 200 "direct host /content/content.json (public)" -H "Host: landing" "$URL/content/content.json"
check 200 "portal host /content/content.json with the secret" -H "Host: portal.$D" $S "$URL/content/content.json"
check 401 "portal host /content/content.json without the secret" -H "Host: portal.$D" "$URL/content/content.json"
check 401 "portal host /media/00000000000000000001-400.webp without the secret" -H "Host: portal.$D" "$URL/media/00000000000000000001-400.webp"
ct=$(hdr_of -H "Host: $D" "$URL/content/content.json")
echo "$ct" | grep -qi '^content-type: application/json' && echo "ok   content.json is application/json" || { echo "FAIL content.json content type: $(echo "$ct" | grep -i '^content-type')"; fail=1; }
echo "$ct" | grep -qi '^cache-control: no-cache' && echo "ok   content.json revalidates (Cache-Control: no-cache)" || { echo "FAIL content.json cache header: $(echo "$ct" | grep -i '^cache-control')"; fail=1; }
echo "$ct" | grep -qi '^etag:' && echo "ok   content.json has an ETag" || { echo "FAIL content.json has no ETag"; fail=1; }
echo "$ct" | grep -qi '^x-content-type-options: nosniff' && echo "ok   content.json sends nosniff" || { echo "FAIL content.json has no nosniff"; fail=1; }
md=$(hdr_of -H "Host: $D" "$URL/media/00000000000000000001-400.webp")
echo "$md" | grep -qi '^content-type: image/webp' && echo "ok   media is image/webp" || { echo "FAIL media content type: $(echo "$md" | grep -i '^content-type')"; fail=1; }
echo "$md" | grep -qi '^cache-control: public, max-age=31536000, immutable' && echo "ok   media is cached for a year, immutable" || { echo "FAIL media cache header: $(echo "$md" | grep -i '^cache-control')"; fail=1; }
echo "$md" | grep -qi '^x-content-type-options: nosniff' && echo "ok   media sends nosniff" || { echo "FAIL media has no nosniff"; fail=1; }
body '' "no identity or secret in /content/content.json" -o /dev/null -H "Host: $D" "$URL/content/content.json"
curl -s -H "Host: $D" "$URL/content/content.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["content"]["SITE"]["teamName"]' && echo "ok   content.json body is the mounted file" || { echo "FAIL content.json body"; fail=1; }

# Only content.json and <id>-<w>.webp are reachable; everything else in those folders is not.
for p in /content/ /content /content/other.json /content/content.json.tmp /content/content.json/ /media/ /media /media/nope-400.webp \
         /media/00000000000000000001-400.png /media/00000000000000000001-400.webp.txt /media/.hidden.webp "/media/a%2Fb-400.webp" /media/test-image-400.WEBP; do
  check 404 "public $p is not served" -H "Host: $D" "$URL$p"
done
miss=$(hdr_of -H "Host: $D" "$URL/media/nope-400.webp")
echo "$miss" | grep -qi '^cache-control:.*immutable' && { echo "FAIL a missing media file is marked immutable"; fail=1; } || echo "ok   a missing media file is not marked immutable"
# (Caddy cleans "/media/../content/content.json" to the public content.json, which is fine, so these aim at
# files that must stay private: the portal page, the portal tile list, and the system.)
for p in "/media/../site/portal/index.html" "/content/../site/portal/index.html" "/media/../../config/apps.json" \
         "/content/../../etc/passwd" "/media/%2e%2e/%2e%2e/etc/passwd" "/media/..%2f..%2fconfig%2fapps.json" "/content/%2e%2e/site/portal/index.html"; do
  got=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -H "Host: $D" "$URL$p")
  case "$got" in 400|404) echo "ok   traversal $p refused ($got)" ;; *) echo "FAIL traversal $p got $got"; fail=1 ;; esac
done

echo "-- without the mounts the site still starts and serves its pages"
NAME2=landing-test-nomount-$$
docker run -d --rm --name "$NAME2" -p "127.0.0.1:$((HOST_PORT+1)):3001" \
  -e PORT=3001 -e SITE_DOMAIN=$D -e SITE_SCHEME=http -e PROXY_SHARED_SECRET=$SECRET "$IMAGE" >/dev/null
trap 'docker stop "$NAME" "$NAME2" >/dev/null 2>&1 || true' EXIT
URL2="http://127.0.0.1:$((HOST_PORT+1))"
i=0; until curl -fs "$URL2/healthz" >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 50 ] || { docker logs "$NAME2"; exit 1; }; sleep 0.2; done
check 200 "no mounts: / still served" -H "Host: $D" "$URL2/"
check 404 "no mounts: /content/content.json is a plain 404" -H "Host: $D" "$URL2/content/content.json"
check 404 "no mounts: /media/00000000000000000001-400.webp is a plain 404" -H "Host: $D" "$URL2/media/00000000000000000001-400.webp"
check 200 "no mounts: /js/content-loader.js is served" -H "Host: $D" "$URL2/js/content-loader.js"

echo "-- nothing private in the image"
for f in /srv/site/README.md /srv/site/CLAUDE.md /srv/site/.git /srv/site/test /srv/site/docs /srv/site/container /srv/site/.env.example; do
  if docker exec "$NAME" test -e "$f"; then echo "FAIL image contains $f"; fail=1; fi
done
if docker exec "$NAME" sh -c 'find /srv/site \( -path /srv/site/pwa-icons -o -path /srv/site/brand \) -prune -o \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) -print | grep -q .'; then
  echo "FAIL image contains photos"; fail=1
else echo "ok   no photos or repo files in the image (the app icons in pwa-icons/ and the logo in brand/ are meant to be there)"; fi

[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
