#!/usr/bin/env bash
# ============================================================
# run.sh — every suite, or the ones you name.
#
#   ./tests/run.sh              all of them
#   ./tests/run.sh tags shots   just those two
#
# It builds the single-file app first (some suites test that rather than
# the source), serves src/ on 8777, runs each suite in its own node
# process, and prints one line per suite. Anything that is not
# "N passed, 0 failed" is a failure, including a suite that crashed.
# ============================================================
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PORT="${QUIRE_PORT:-8777}"
OUT="${QUIRE_TEST_OUT:-/tmp/quire-tests}"
export QUIRE_TEST_OUT="$OUT"
mkdir -p "$OUT"

cd "$ROOT"
node build-single.mjs > /dev/null || { echo "the bundler failed — nothing was run"; exit 1; }
node build-single.mjs --preview > /dev/null || { echo "the preview bundle failed — nothing was run"; exit 1; }   # prev.mjs opens it

# The server is only ours if we started it.
MINE=""
if ! curl -fsS "http://127.0.0.1:$PORT/index.html" > /dev/null 2>&1; then
  python3 -m http.server "$PORT" --directory "$ROOT/src" > /dev/null 2>&1 &
  MINE=$!
  for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$PORT/index.html" > /dev/null 2>&1 && break
    sleep 0.25
  done
fi
finish() { [ -n "$MINE" ] && kill "$MINE" 2>/dev/null; }
trap finish EXIT

if [ "$#" -gt 0 ]; then NAMES=("$@")
else
  NAMES=()
  for f in "$HERE"/suites/*.mjs; do
    n="$(basename "$f" .mjs)"
    [ "$n" = "e2e" ] && continue          # read by the others for its fake journal
    [ "$n" = "lookhelp" ] && continue     # helpers for driving the Appearance sheet
    NAMES+=("$n")
  done
fi

bad=0
for n in "${NAMES[@]}"; do
  r="$(cd "$HERE/suites" && timeout 300 node "$n.mjs" 2>&1)"
  line="$(echo "$r" | grep -Eo '[0-9]+ passed, [0-9]+ failed|all passed|skipped — .*' | tail -1)"
  if [ -z "$line" ]; then line="DID NOT FINISH"; fi
  case "$line" in
    *", 0 failed"|"all passed"|skipped*) : ;;
    *) bad=$((bad+1)) ;;
  esac
  printf '%-12s %s\n' "$n" "$line"
  [ -n "${QUIRE_VERBOSE:-}" ] && echo "$r"
done

echo
if [ "$bad" -eq 0 ]; then echo "all suites green"; else echo "$bad suite(s) not green"; fi
exit "$bad"
