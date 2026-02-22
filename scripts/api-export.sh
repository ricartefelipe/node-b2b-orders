#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm api node dist/src/scripts/export-openapi.js
