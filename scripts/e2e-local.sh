#!/usr/bin/env bash
# Sobe infra E2E e executa testes. Uso: ./scripts/e2e-local.sh

set -e

echo "Subindo postgres, redis, rabbitmq..."
docker compose -f docker-compose.e2e.yml up -d

echo "Aguardando serviços..."
sleep 5

echo "Build e migrate..."
npm ci
npm run build
npx prisma generate
DATABASE_URL=postgresql://app:app@localhost:5432/orders_test npx prisma migrate deploy
DATABASE_URL=postgresql://app:app@localhost:5432/orders_test npx prisma db seed

echo "Executando E2E..."
DATABASE_URL=postgresql://app:app@localhost:5432/orders_test \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=e2e-test-secret-key-do-not-use-in-production \
RABBITMQ_URL=amqp://guest:guest@localhost:5672 \
npm run test:e2e

echo "Parando containers..."
docker compose -f docker-compose.e2e.yml down
