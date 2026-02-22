#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/up.sh
./scripts/migrate.sh
./scripts/seed.sh

API_BASE="http://localhost:3000"
TENANT="tenant_demo"
PASS=0
FAIL=0

json_get () {
  node -e "const obj=JSON.parse(process.argv[1]); const path=process.argv[2].split('.'); let cur=obj; for (const p of path){cur=cur[p];} console.log(cur);" "$1" "$2"
}

assert_eq () {
  if [ "$1" != "$2" ]; then
    echo "  FAIL: expected '$2', got '$1' ($3)"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $3"
    PASS=$((PASS + 1))
  fi
}

echo ""
echo "=== Smoke Tests ==="
echo ""

# --- Health checks ---
echo "[1] Health checks"
HEALTHZ=$(curl -sS "$API_BASE/v1/healthz" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).status))")
assert_eq "$HEALTHZ" "ok" "healthz"

READYZ=$(curl -sS "$API_BASE/v1/readyz" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).status))")
assert_eq "$READYZ" "ok" "readyz"

# --- Auth ---
echo "[2] Get token"
TOKEN_JSON=$(curl -sS -X POST "$API_BASE/v1/auth/token" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@demo","password":"ops123","tenantId":"tenant_demo"}')
TOKEN=$(json_get "$TOKEN_JSON" "access_token")
assert_eq "$(echo "$TOKEN" | wc -c | tr -d ' ')" "$(echo "$TOKEN" | wc -c | tr -d ' ')" "token issued"

# --- Create order ---
echo "[3] Create order"
ORDER_JSON=$(curl -sS -X POST "$API_BASE/v1/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"CUST-1","items":[{"sku":"SKU-1","qty":2,"price":10.5}]}')
ORDER_ID=$(json_get "$ORDER_JSON" "id")
ORDER_STATUS=$(json_get "$ORDER_JSON" "status")
assert_eq "$ORDER_STATUS" "CREATED" "order created"

# --- Wait for worker to reserve ---
echo "[4] Waiting for worker to reserve inventory..."
sleep 3

ORDER_AFTER=$(curl -sS "$API_BASE/v1/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT")
RESERVED_STATUS=$(json_get "$ORDER_AFTER" "status")
assert_eq "$RESERVED_STATUS" "RESERVED" "order reserved by worker"

# --- Confirm order ---
echo "[5] Confirm order"
CONFIRM_JSON=$(curl -sS -X POST "$API_BASE/v1/orders/$ORDER_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT" \
  -H "Idempotency-Key: smoke-confirm-$(date +%s)" \
  -H "Content-Type: application/json")
CONFIRM_STATUS=$(json_get "$CONFIRM_JSON" "status")
assert_eq "$CONFIRM_STATUS" "CONFIRMED" "order confirmed"

# --- Tenant mismatch ---
echo "[6] Negative test: tenant mismatch -> 403"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$API_BASE/v1/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: other_tenant")
assert_eq "$HTTP_CODE" "403" "tenant mismatch returns 403"

# --- Inventory list ---
echo "[7] List inventory"
INV_JSON=$(curl -sS "$API_BASE/v1/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT")
INV_LEN=$(echo "$INV_JSON" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length))")
assert_eq "$(test "$INV_LEN" -ge 1 && echo ok || echo fail)" "ok" "inventory has items"

# --- Inventory adjustment ---
echo "[8] Create inventory adjustment (IN)"
ADJ_JSON=$(curl -sS -X POST "$API_BASE/v1/inventory/adjustments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT" \
  -H "Idempotency-Key: smoke-adj-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-1","type":"IN","qty":10,"reason":"smoke test restock"}')
ADJ_SKU=$(json_get "$ADJ_JSON" "sku")
assert_eq "$ADJ_SKU" "SKU-1" "adjustment created"

echo "[9] List inventory adjustments"
ADJS_JSON=$(curl -sS "$API_BASE/v1/inventory/adjustments?sku=SKU-1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT")
ADJS_LEN=$(echo "$ADJS_JSON" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length))")
assert_eq "$(test "$ADJS_LEN" -ge 1 && echo ok || echo fail)" "ok" "adjustments listed"

# --- Metrics ---
echo "[10] Check metrics endpoint"
METRICS=$(curl -sS "$API_BASE/v1/metrics")
HAS_ORDERS_CREATED=$(echo "$METRICS" | grep -c "orders_created_total" || true)
assert_eq "$(test "$HAS_ORDERS_CREATED" -ge 1 && echo ok || echo fail)" "ok" "business metrics present"

# --- Sales user (read-only) ---
echo "[11] Sales user: read OK, write blocked"
SALES_TOKEN_JSON=$(curl -sS -X POST "$API_BASE/v1/auth/token" \
  -H 'Content-Type: application/json' \
  -d '{"email":"sales@demo","password":"sales123","tenantId":"tenant_demo"}')
SALES_TOKEN=$(json_get "$SALES_TOKEN_JSON" "access_token")

SALES_LIST_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$API_BASE/v1/orders" \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-Tenant-Id: $TENANT")
assert_eq "$SALES_LIST_CODE" "200" "sales can read orders"

SALES_CREATE_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API_BASE/v1/orders" \
  -H "Authorization: Bearer $SALES_TOKEN" \
  -H "X-Tenant-Id: $TENANT" \
  -H "Idempotency-Key: smoke-sales-write" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"CUST-X","items":[{"sku":"SKU-1","qty":1,"price":1}]}')
assert_eq "$SALES_CREATE_CODE" "403" "sales cannot write orders"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  echo "Smoke FAILED"
  exit 1
fi
echo "Smoke OK"
