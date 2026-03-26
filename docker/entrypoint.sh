#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
for i in 1 2 3 4 5; do
  if npx prisma migrate deploy; then
    break
  fi
  echo "[entrypoint] Migrations failed (attempt $i). Retrying in 30s..."
  sleep 30
done

if [ "$NODE_ENV" = "staging" ]; then
  echo "[entrypoint] Staging: running seed..."
  for i in 1 2 3; do
    npx prisma db seed && break || true
    echo "[entrypoint] Seed attempt $i completed (or failed). Retrying in 15s..."
    sleep 15
  done
fi

echo "[entrypoint] Starting application..."
exec node dist/src/main.js
