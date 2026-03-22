#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
npx prisma migrate deploy

if [ "$NODE_ENV" = "staging" ]; then
  echo "[entrypoint] Staging: running seed..."
  npx prisma db seed || true
fi

echo "[entrypoint] Starting application..."
exec node dist/src/main.js
