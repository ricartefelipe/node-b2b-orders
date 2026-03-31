#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
for i in 1 2 3; do
  if out=$(npx prisma migrate deploy 2>&1); then
    echo "$out"
    break
  fi
  echo "$out"
  if echo "$out" | grep -q "Error: P3005"; then
    echo "[entrypoint] Existing schema sem baseline Prisma (P3005). Seguindo startup sem aplicar migration destrutiva."
    break
  fi
  echo "[entrypoint] Migrations failed (attempt $i). Retrying in 20s..."
  if [ "$i" -eq 3 ]; then
    echo "[entrypoint] Migration retries exhausted."
    exit 1
  fi
  sleep 20
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
