#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm api ./node_modules/.bin/prisma migrate deploy
