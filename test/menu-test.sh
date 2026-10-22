#!/bin/sh
# The phone menu must fill the screen on every page, including pages whose header has its glass background.
# Opens the menu at 390px wide in headless Chrome. Usage: test/menu-test.sh   (needs Chrome and python3)
set -eu
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d); PID=""
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
tar -cf - --exclude=.git --exclude=.claude --exclude='assets/*.jpg' --exclude='assets/*/*.jpg' --exclude='assets/*/*.png' . | tar -xf - -C "$TMP"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
(cd "$TMP" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
PID=$!
i=0; until curl -fs -o /dev/null "http://127.0.0.1:$PORT/index.html"; do i=$((i+1)); [ $i -lt 50 ] || { echo "server did not start"; exit 1; }; sleep 0.1; done
out=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome" --force-prefers-reduced-motion \
  --virtual-time-budget=60000 --dump-dom "http://127.0.0.1:$PORT/test/menu-test.html" 2>/dev/null || true)
printf '%s\n' "$out" | grep -E '^(ok  |FAIL) ' | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g; s/&quot;/"/g'
if printf '%s\n' "$out" | grep -q '<div id="done">MENU-TEST-PASS</div>'; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; exit 1; fi
