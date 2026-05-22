#!/bin/bash
# listen-yesno behavior tests — RED/GREEN cycle
# Tests: compilation, binary existence, timeout exit code, error handling

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/listen-yesno"
SOURCE="$SCRIPT_DIR/listen-yesno.swift"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

# Test 1: Source file exists
if [ -f "$SOURCE" ]; then
  pass "listen-yesno.swift source exists"
else
  fail "listen-yesno.swift source missing"
fi

# Test 2: Source contains required framework imports
for framework in "import Speech" "import AVFoundation" "import Foundation"; do
  if grep -q "$framework" "$SOURCE" 2>/dev/null; then
    pass "Source imports $framework"
  else
    fail "Source missing $framework"
  fi
done

# Test 3: Source handles --timeout flag
if grep -q "timeout" "$SOURCE" 2>/dev/null; then
  pass "Source references timeout parameter"
else
  fail "Source does not handle timeout"
fi

# Test 4: Source checks authorization
if grep -q "requestAuthorization" "$SOURCE" 2>/dev/null; then
  pass "Source calls requestAuthorization"
else
  fail "Source does not call requestAuthorization"
fi

# Test 5: Source checks recognizer availability
if grep -q "isAvailable" "$SOURCE" 2>/dev/null; then
  pass "Source checks isAvailable"
else
  fail "Source does not check isAvailable"
fi

# Test 6: Binary compiles
if [ -f "$SOURCE" ]; then
  if swiftc -framework Speech "$SOURCE" -o "$BINARY" 2>&1; then
    pass "Binary compiles successfully"
  else
    fail "Binary compilation failed"
  fi
else
  fail "Cannot compile — source missing"
fi

# Test 7: Binary exists and is executable
if [ -x "$BINARY" ]; then
  pass "Binary exists and is executable"
else
  fail "Binary not found or not executable"
fi

# Test 8: Timeout path exits with code 2
if [ -x "$BINARY" ]; then
  EXIT_CODE=0
  "$BINARY" --timeout 1 >/dev/null 2>&1 || EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 2 ]; then
    pass "Timeout (1s) exits with code 2"
  else
    fail "Timeout exited with $EXIT_CODE (expected 2)"
  fi
else
  fail "Cannot test timeout — binary missing"
fi

# Summary
echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
