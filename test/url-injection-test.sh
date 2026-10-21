#!/bin/sh
# robot.html?year=<hostile> must show the odd text, not run it. Serves a temporary copy of the site
# and loads the page in headless Chrome. Usage: test/url-injection-test.sh   (needs Chrome and python3)
set -eu
cd "$(dirname "$0")/.."
node test/url-injection-test.cjs

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)
PID=""
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
tar -cf - --exclude=.git --exclude=.claude . | tar -xf - -C "$TMP"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
(cd "$TMP" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
PID=$!
i=0; until curl -fs -o /dev/null "http://127.0.0.1:$PORT/robot.html"; do i=$((i+1)); [ $i -lt 50 ] || { echo "server did not start"; exit 1; }; sleep 0.1; done

fail=0
try() { # <description> <raw year value> <a word of the payload that must be visible as text>
  enc=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$2")
  dom=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome" \
    --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$PORT/robot.html?year=$enc" 2>/dev/null || true)
  bad=""
  printf '%s' "$dom" | grep -q '<title>Robot not found' || bad="$bad page did not show 'Robot not found';"
  printf '%s' "$dom" | grep -q '<title>[^<]*PWNED' && bad="$bad the script ran (title changed);"
  printf '%s' "$dom" | grep -qE '<h1[^>]*>(<span[^>]*>)*INJECTED' && bad="$bad injected <h1> appeared;"
  printf '%s' "$dom" | grep -q '<script>document.title' && bad="$bad injected <script> appeared;"
  printf '%s' "$dom" | grep -qi '<img src="x"' && bad="$bad injected <img> appeared;"
  printf '%s' "$dom" | grep -q "We don.t have a page for .*$3" || bad="$bad the payload is not visible as text;"
  if [ -z "$bad" ]; then echo "ok   $1"; else echo "FAIL $1:$bad"; fail=1; fi
}
try "?year= with an <img onerror> is shown as text" "<img src=x onerror=\"document.title='PWNED'\">" onerror
try "?year= that closes the paragraph is shown as text" "</p><h1>INJECTED</h1>" INJECTED
try "?year= with a script tag is shown as text" "\"><script>document.title='PWNED'</script>" script
try "?year= with quotes and ampersands is shown as text" "' onmouseover='document.title=\"PWNED\"' &amp; \"" onmouseover

plain=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome2" --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$PORT/robot.html?year=1999" 2>/dev/null || true)
if printf '%s' "$plain" | grep -q "We don't have a page for 1999 yet"; then echo "ok   an ordinary unknown year reads normally"; else echo "FAIL an ordinary unknown year message"; fail=1; fi
real=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome3" --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$PORT/robot.html?year=2025" 2>/dev/null || true)
if printf '%s' "$real" | grep -q 'Sea Bunny'; then echo "ok   a real season still renders"; else echo "FAIL a real season did not render"; fail=1; fi

[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
