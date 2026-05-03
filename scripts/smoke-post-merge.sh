#!/usr/bin/env bash
set -euo pipefail

# Smoke HTTP pos-deploy (staging). Valida saude e documentacao OpenAPI.
#
# Variaveis:
#   ORDERS_SMOKE_URL ou SMOKE_BASE_URL
#   SMOKE_REQUIRE_URL=1 — exige URL
#   SMOKE_CHECK_READYZ=1 — GET /v1/readyz (DB/Redis conforme servidor)

BASE_URL="${ORDERS_SMOKE_URL:-${SMOKE_BASE_URL:-}}"
REQUIRE="${SMOKE_REQUIRE_URL:-0}"

if [[ -z "$BASE_URL" ]]; then
  echo "[smoke] ORDERS_SMOKE_URL/SMOKE_BASE_URL nao definido — smoke HTTP ignorado."
  [[ "$REQUIRE" == "1" ]] && exit 1
  exit 0
fi

BASE_URL="${BASE_URL%/}"
echo "[smoke] node-b2b-orders — base ${BASE_URL}"

curl -sfS --max-time 20 "${BASE_URL}/v1/healthz" >/dev/null || {
  echo "[smoke] FALHA: GET /v1/healthz"
  exit 1
}
echo "[smoke] OK /v1/healthz"

openapi_ok=0
for path in /docs-json /v1/docs-json; do
  if BODY=$(curl -sfS --max-time 20 "${BASE_URL}${path}" 2>/dev/null); then
    if grep -qE '"openapi"|"swagger"' <<<"$BODY"; then
      openapi_ok=1
      echo "[smoke] OK OpenAPI JSON em ${path}"
      break
    fi
  fi
done
if [[ "$openapi_ok" != "1" ]]; then
  echo "[smoke] FALHA: OpenAPI JSON (/docs-json ou /v1/docs-json)"
  exit 1
fi

if [[ "${SMOKE_CHECK_READYZ:-0}" == "1" ]]; then
  curl -sfS --max-time 25 "${BASE_URL}/v1/readyz" >/dev/null || {
    echo "[smoke] FALHA: GET /v1/readyz"
    exit 1
  }
  echo "[smoke] OK /v1/readyz"
fi

echo "[smoke] concluido com sucesso"
