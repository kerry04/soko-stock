#!/bin/sh
# Paper-trading smoke: gated-access checks always run; the full
# buy → portfolio → sell loop runs when TEST_JWT is set.
# Usage: BASE=http://localhost:3000 TEST_JWT=<supabase-jwt> sh scripts/paper-smoke.sh
set -eu
BASE="${BASE:-http://localhost:3000}"

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }

# 1. Signed-out order is rejected, never filled.
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/paper/orders" \
  -H 'content-type: application/json' \
  -d '{"ticker":"NPN.JO","side":"BUY","qty":1,"idempotencyKey":"smoke-noauth-1"}')
[ "$code" = "401" ] || fail "POST no-auth expected 401, got $code"
echo "SMOKE PASS: POST no-auth → 401 login_required"

# 2. Signed-out portfolio is rejected.
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/paper/portfolio")
[ "$code" = "401" ] || fail "GET portfolio no-auth expected 401, got $code"
echo "SMOKE PASS: GET portfolio no-auth → 401 login_required"

# 3. Portfolio page renders (login gate for signed-out browsers).
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/portfolio")
[ "$code" = "200" ] || fail "GET /portfolio expected 200, got $code"
echo "SMOKE PASS: GET /portfolio → 200"

if [ -z "${TEST_JWT:-}" ]; then
  echo "SMOKE SKIP: TEST_JWT unset — set it to run the authed buy→portfolio→sell loop."
  exit 0
fi

AUTH="Authorization: Bearer $TEST_JWT"
KEY="smoke-$(date +%s)"
# 4. Buy 1 NPN.JO.
resp=$(curl -s -X POST "$BASE/api/paper/orders" -H 'content-type: application/json' -H "$AUTH" \
  -d "{\"ticker\":\"NPN.JO\",\"side\":\"BUY\",\"qty\":1,\"idempotencyKey\":\"$KEY\"}")
echo "$resp" | grep -q '"ok":true' || fail "BUY failed: $resp"
echo "SMOKE PASS: BUY 1 NPN.JO filled"

# 5. Same key returns the duplicate, not a second fill.
resp2=$(curl -s -X POST "$BASE/api/paper/orders" -H 'content-type: application/json' -H "$AUTH" \
  -d "{\"ticker\":\"NPN.JO\",\"side\":\"BUY\",\"qty\":1,\"idempotencyKey\":\"$KEY\"}")
echo "$resp2" | grep -q '"duplicate":true' || fail "idempotency failed: $resp2"
echo "SMOKE PASS: retry same key → duplicate:true"

# 6. Portfolio shows the position.
pf=$(curl -s "$BASE/api/paper/portfolio" -H "$AUTH")
echo "$pf" | grep -q 'NPN.JO' || fail "position missing: $pf"
echo "SMOKE PASS: portfolio lists NPN.JO"

# 7. Sell it back.
resp3=$(curl -s -X POST "$BASE/api/paper/orders" -H 'content-type: application/json' -H "$AUTH" \
  -d "{\"ticker\":\"NPN.JO\",\"side\":\"SELL\",\"qty\":1,\"idempotencyKey\":\"$KEY-sell\"}")
echo "$resp3" | grep -q '"ok":true' || fail "SELL failed: $resp3"
echo "SMOKE PASS: SELL 1 NPN.JO filled"
echo "SMOKE ALL PASS"
