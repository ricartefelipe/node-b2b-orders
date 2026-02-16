#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/up.sh
./scripts/migrate.sh
./scripts/seed.sh

API_BASE="http://localhost:3000"
TENANT="tenant_demo"

json_get () {
  node -e "const obj=JSON.parse(process.argv[1]); const path=process.argv[2].split('.'); let cur=obj; for (const p of path){cur=cur[p];} console.log(cur);" "$1" "$2"
}

echo "Getting token..."
TOKEN_JSON=$(curl -sS -X POST "$API_BASE/v1/auth/token"   -H 'Content-Type: application/json'   -d '{"email":"ops@demo","password":"ops123","tenantId":"tenant_demo"}')
TOKEN=$(json_get "$TOKEN_JSON" "access_token")

echo "Creating order..."
ORDER_JSON=$(curl -sS -X POST "$API_BASE/v1/orders"   -H "Authorization: Bearer $TOKEN"   -H "X-Tenant-Id: $TENANT"   -H "Idempotency-Key: smoke-1"   -H "Content-Type: application/json"   -d '{"customerId":"CUST-1","items":[{"sku":"SKU-1","qty":2,"price":10.5}] }')
ORDER_ID=$(json_get "$ORDER_JSON" "id")

echo "Waiting worker to reserve inventory..."
sleep 2

echo "Confirming order..."
curl -sS -X POST "$API_BASE/v1/orders/$ORDER_ID/confirm"   -H "Authorization: Bearer $TOKEN"   -H "X-Tenant-Id: $TENANT"   -H "Idempotency-Key: smoke-2" > /dev/null

echo "Negative test (tenant mismatch -> 403)..."
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$API_BASE/v1/orders/$ORDER_ID"   -H "Authorization: Bearer $TOKEN"   -H "X-Tenant-Id: other_tenant")
if [ "$HTTP_CODE" != "403" ]; then
  echo "Expected 403, got $HTTP_CODE"
  exit 1
fi

echo "Smoke OK ✅"
