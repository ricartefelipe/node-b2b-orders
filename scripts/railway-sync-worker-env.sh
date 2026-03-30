#!/usr/bin/env bash
set -euo pipefail

# Copia variáveis necessárias do serviço API (node-b2b-orders) para o worker (node-b2b-orders-worker).
# Uso (na raiz do repo, com `railway link` ao projeto):
#   ./scripts/railway-sync-worker-env.sh
#   ./scripts/railway-sync-worker-env.sh 'amqp://user:pass@host/vhost'
#
# O segundo argumento (ou variável RABBITMQ_URL) define a URL AMQP nos dois serviços se ainda não existir na API.
# Requer: Railway CLI autenticado, `jq` instalado.

API_SERVICE="${RAILWAY_API_SERVICE:-node-b2b-orders}"
WORKER_SERVICE="${RAILWAY_WORKER_SERVICE:-node-b2b-orders-worker}"

KEYS=(
  DATABASE_URL
  REDIS_URL
  JWT_SECRET
  JWT_ISSUER
  JWT_ALGORITHM
  AUDIT_RETENTION_DAYS
  SAAS_CORE_URL
  NODE_ENV
)

need_jq() {
  command -v jq >/dev/null 2>&1 || {
    echo "Instale jq para usar este script." >&2
    exit 1
  }
}

need_jq

RABBIT_ARG="${1:-}"
if [[ -n "${RABBITMQ_URL:-}" && -z "$RABBIT_ARG" ]]; then
  RABBIT_ARG="$RABBITMQ_URL"
fi

API_JSON=$(railway variables --json -s "$API_SERVICE" 2>/dev/null) || {
  echo "Falha ao ler variáveis da API. Confirme que o projeto está ligado (railway link) e o nome do serviço." >&2
  exit 1
}

for key in "${KEYS[@]}"; do
  val=$(echo "$API_JSON" | jq -r --arg k "$key" '.[$k] // empty')
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "[sync] Aviso: $key ausente na API — ignorado" >&2
    continue
  fi
  echo "[sync] $key -> $WORKER_SERVICE"
  railway variable set "${key}=${val}" -s "$WORKER_SERVICE" --skip-deploys
done

EXISTING_RABBIT=$(echo "$API_JSON" | jq -r '.RABBITMQ_URL // empty')
if [[ -n "$EXISTING_RABBIT" && "$EXISTING_RABBIT" != "null" ]]; then
  echo "[sync] RABBITMQ_URL (da API) -> $WORKER_SERVICE"
  railway variable set "RABBITMQ_URL=${EXISTING_RABBIT}" -s "$WORKER_SERVICE" --skip-deploys
elif [[ -n "$RABBIT_ARG" ]]; then
  echo "[sync] RABBITMQ_URL (argumento) -> API e $WORKER_SERVICE"
  railway variable set "RABBITMQ_URL=${RABBIT_ARG}" -s "$API_SERVICE" --skip-deploys
  railway variable set "RABBITMQ_URL=${RABBIT_ARG}" -s "$WORKER_SERVICE" --skip-deploys
else
  echo "[sync] AVISO: RABBITMQ_URL ainda não definido (API nem argumento)." >&2
  echo "         Crie uma instância AMQP (ex.: CloudAMQP) e:" >&2
  echo "         $0 'amqp://user:pass@host/vhost'" >&2
fi

echo "[sync] Concluído. No Railway, no serviço worker, aponte o config file para railway.worker.toml (raiz do repo)."
echo "[sync] Redeploy: railway redeploy -y -s $WORKER_SERVICE"
