#!/bin/sh
# Baseline Prisma: marca migrações como aplicadas quando o PostgreSQL já tem schema
# mas _prisma_migrations está vazio ou desalinhado (erro P3005 em migrate deploy).
#
# Só usar se o schema existente corresponder ao resultado destas migrações (típico:
# BD criado antes do histórico Prisma ou reposto sem _prisma_migrations).
#
# Staging Railway (serviço node-b2b-orders):
#   railway ssh -s node-b2b-orders -- /app/scripts/prisma-baseline-resolve.sh
#
# Local (com DATABASE_URL apontando ao mesmo Postgres):
#   ./scripts/prisma-baseline-resolve.sh
set -eu

cd /app 2>/dev/null || cd "$(dirname "$0")/.."

echo "[baseline] Diretório: $(pwd)"
echo "[baseline] A marcar migrações como aplicadas (resolve --applied)..."

for m in \
  20260216024000_init \
  20260222000000_add_inventory_adjustment \
  20260303000000_add_products \
  20260312000000_add_fulfillment_fields \
  20260312000000_add_webhook_tables \
  20260312100000_add_order_total_amount \
  20260313000000_align_policy_with_shared_db
do
  echo "[baseline] resolve --applied $m"
  npx prisma migrate resolve --applied "$m"
done

echo "[baseline] migrate deploy (aplica o que ainda faltar)..."
npx prisma migrate deploy

echo "[baseline] migrate status:"
npx prisma migrate status

echo "[baseline] Concluído. Reinicie o serviço no Railway se quiser um arranque limpo."
