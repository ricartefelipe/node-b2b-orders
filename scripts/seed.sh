#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm api node dist/prisma/seed.js || docker compose run --rm api npx prisma db seed
