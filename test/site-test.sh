#!/bin/sh
# Opens every page in headless Chrome against a temporary copy of the site and checks the content
# loader, data-ck keys, escaping and media paths (see test/site-test.html).
# Three scenarios: built-in content only, a published content.json (fake data), and a broken content.json.
# Usage: test/site-test.sh     (needs Google Chrome and python3)
set -eu
cd "$(dirname "$0")/.."

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)
PIDS=""
cleanup() { for p in $PIDS; do kill "$p" 2>/dev/null || true; done; rm -rf "$TMP"; }
trap cleanup EXIT

free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'; }

serve() { # <dir> <port>
  (cd "$1" && exec python3 -m http.server "$2" --bind 127.0.0.1 >/dev/null 2>&1) &
  PIDS="$PIDS $!"
  i=0; until curl -fs -o /dev/null "http://127.0.0.1:$2/index.html"; do i=$((i+1)); [ $i -lt 50 ] || { echo "server did not start"; exit 1; }; sleep 0.1; done
}

copy_site() { # <dest>
  mkdir -p "$1"
  tar -cf - --exclude=.git --exclude=.claude --exclude='assets/*.jpg' --exclude='assets/*/*.jpg' --exclude='assets/*/*.png' . | tar -xf - -C "$1"
}

fail=0
run_mode() { # <mode> <port> <dir>
  serve "$3" "$2"
  out=$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/chrome-$1" \
    --virtual-time-budget=120000 --dump-dom "http://127.0.0.1:$2/test/site-test.html?mode=$1" 2>/dev/null || true)
  # (Chrome sometimes exits non-zero after printing the page; the verdict comes from the page itself.)
  printf '%s\n' "$out" | grep -E '^(ok  |FAIL) ' | sed 's/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g; s/&quot;/"/g' | grep -v '^ok  ' || true
  n_ok=$(printf '%s\n' "$out" | grep -c '^ok  ' || true)
  if printf '%s\n' "$out" | grep -q '<div id="done">SITE-TEST-PASS</div>'; then
    echo "ok   $1 scenario: $n_ok checks passed"
  else
    echo "FAIL $1 scenario ($n_ok checks passed; see FAIL lines above)"
    printf '%s\n' "$out" | grep -q 'id="done"' || echo "     (the test page did not finish)"
    fail=1
  fi
}

# 1) built-in content only (no /content/content.json at all)
copy_site "$TMP/default"
run_mode default "$(free_port)" "$TMP/default"

# 2) a published content.json with fake data
copy_site "$TMP/fixture"
mkdir -p "$TMP/fixture/content"
cp test/fixtures/content/content.json "$TMP/fixture/content/content.json"
run_mode fixture "$(free_port)" "$TMP/fixture"

# 3) a content.json that is half-written / invalid
copy_site "$TMP/broken"
mkdir -p "$TMP/broken/content"
printf '{"SITE": {"mission": "cut off in the mid' > "$TMP/broken/content/content.json"
run_mode broken "$(free_port)" "$TMP/broken"

[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
