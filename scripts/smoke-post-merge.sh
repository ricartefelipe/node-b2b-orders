#!/usr/bin/env bash
set -euo pipefail

# Smoke HTTP pos-deploy (staging). Valida saude e documentacao OpenAPI.
#
# Variaveis:
#   ORDERS_SMOKE_URL ou SMOKE_BASE_URL
#   SMOKE_REQUIRE_URL=1 — exige URL

BASE_URL="${ORDERS_SMOKE_URL:-${SMOKE_BASE_URL:-}}"
REQUIRE="${SMOKE_REQUIRE_URL:-0}"

if [[ -z "$BASE_URL" ]]; then
  echo "[smoke] ORDERS_SMOKE_URL/SMOKE_BASE_URL nao definido — smoke HTTP ignorado."
  [[ "$REQUIRE" == "1" ]] && exit 1
  exit 0
fi

BASE_URL="${BASE_URL%/}"
echo "[smoke] node-b2b-orders — base ${BASE_URL}"

curl -sfS --max-time 20 "$BASE_URL/v1/healthz" >/dev/null || {
  echo "[smoke] FALHA: GET /v1/healthz"
  exit 1
}
echo "[smoke] OK /v1/healthz"

BODY=$(curl -sfS --max-time 20 "$BASE_URL/v1/docs-json") || {
  echo "[smoke] FALHA: GET /v1/docs-json (Swagger)"
  exit 1
}
if ! grep -q '"openapi"' <<<"$BODY" && ! grep -q '"swagger"' <<<"$BODY"; then
  echo "[smoke] FALHA: documento OpenAPI inesperado"
  exit 1
fi
echo "[smoke] OK /v1/docs-json"
echo "[smoke] concluido com sucesso"
