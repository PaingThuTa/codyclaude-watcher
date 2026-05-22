#!/bin/bash
# hook.sh behavior tests — RED/GREEN cycle
# Tests: X-CodyWatcher-Key header, FIFO pre-creation, timeout, jq usage

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/../hook.sh"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

# Test 1: hook.sh exists
if [ -f "$HOOK" ]; then
  pass "hook.sh exists"
else
  fail "hook.sh not found"
  echo "Cannot continue — hook.sh missing" >&2
  exit 1
fi

# Test 2: hook.sh sends X-CodyWatcher-Key header
if grep -q 'X-CodyWatcher-Key' "$HOOK"; then
  pass "hook.sh includes X-CodyWatcher-Key header"
else
  fail "hook.sh missing X-CodyWatcher-Key header"
fi

# Test 3: X-CodyWatcher-Key uses CODYWATCHER_KEY env var
if grep -q 'CODYWATCHER_KEY' "$HOOK"; then
  pass "X-CodyWatcher-Key reads from CODYWATCHER_KEY env var"
else
  fail "X-CodyWatcher-Key does not reference CODYWATCHER_KEY"
fi

# Test 4: hook.sh pre-creates FIFOs
if grep -q 'mkfifo' "$HOOK"; then
  pass "hook.sh pre-creates FIFOs with mkfifo"
else
  fail "hook.sh missing mkfifo (FIFO pre-creation)"
fi

# Test 5: hook.sh has FIFO read timeout
if grep -q 'timeout' "$HOOK"; then
  pass "hook.sh has FIFO read timeout"
else
  fail "hook.sh missing FIFO read timeout"
fi

# Test 6: hook.sh uses jq for JSON encoding
if grep -q 'jq -n' "$HOOK"; then
  pass "hook.sh uses jq for JSON encoding"
else
  fail "hook.sh not using jq (risk of injection)"
fi

# Test 7: curl output is silenced
if grep -q '>/dev/null\|> /dev/null' "$HOOK"; then
  pass "curl output silenced"
else
  fail "curl output not silenced (may leak to stdout)"
fi

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
