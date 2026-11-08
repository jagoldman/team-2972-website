#!/bin/sh
# Light and dark themes in headless Chrome: WCAG AA text contrast on every page in both themes, the portal
# (with tiles, and the "waiting for a group" panel), the Light / Dark / System switch, and following the
# system setting. Needs Google Chrome and python3.   Usage: test/theme-test.sh
set -eu
cd "$(dirname "$0")/.."
node test/theme-test.cjs | grep -v '^ok ' || true
node test/theme-test.cjs >/dev/null

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)
PIDS=""
cleanup() { for p in $PIDS; do kill "$p" 2>/dev/null || true; done; rm -rf "$TMP"; }
trap cleanup EXIT

free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
serve() { # <dir> <port>
  (cd "$1" && exec python3 -m http.server "$2" --bind 127.0.0.1 >/dev/null 2>&1) &
  PIDS="$PIDS $!"
  i=0; until curl -fs -o /dev/null "http://127.0.0.1:$2/index.html"; do i=$((i+1)); [ $i -lt 50 ] || { echo "server did not start"; exit 1; }; sleep 0.1; done
}
# A copy of the site, with what the portal needs from infra's Caddy: /me.json and /apps.json.
site() { # <dest> <groups>
  mkdir -p "$1"
  tar -cf - --exclude=.git --exclude=.claude --exclude='assets/*.jpg' --exclude='assets/*/*.jpg' --exclude='assets/*/*.png' . | tar -xf - -C "$1"
  printf '{"email":"pat@example.com","name":"Pat Example","username":"pat@example.com","groups":"%s","uid":"u-1"}\n' "$2" > "$1/me.json"
  cp test/fixtures/apps.json "$1/apps.json"
}

fail=0
run() { # <label> <mode> <dir> [chrome flags...]
  label=$1; mode=$2; dir=$3; shift 3
  port=$(free_port); serve "$dir" "$port"
  out=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome-$label" \
    --force-prefers-reduced-motion "$@" --virtual-time-budget=240000 --dump-dom "http://127.0.0.1:$port/test/theme-test.html?mode=$mode" 2>/dev/null || true)
  printf '%s\n' "$out" | grep -E '^(ok  |FAIL) ' | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g; s/&quot;/"/g' | grep -v '^ok  ' || true
  n=$(printf '%s\n' "$out" | grep -c '^ok  ' || true)
  if printf '%s\n' "$out" | grep -q '<div id="done">THEME-TEST-PASS</div>'; then echo "ok   $label: $n checks passed"
  else echo "FAIL $label ($n checks passed; see FAIL lines above)"; printf '%s\n' "$out" | grep -q 'id="done"' || echo "     (the test page did not finish)"; fail=1; fi
}

site "$TMP/mentor" "mentor";  run "contrast (both themes, all pages, portal with tiles)" contrast "$TMP/mentor"
site "$TMP/nogroup" "";       run "contrast (portal for a user with no group)" nogroup "$TMP/nogroup"
site "$TMP/syslight" "mentor"; run "system setting: light" system-light "$TMP/syslight" --blink-settings=preferredColorScheme=1
site "$TMP/sysdark" "mentor";  run "system setting: dark" system-dark "$TMP/sysdark" --blink-settings=preferredColorScheme=0

[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
