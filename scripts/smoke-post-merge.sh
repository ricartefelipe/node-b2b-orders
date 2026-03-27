#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[smoke] node-b2b-orders post-merge smoke"
echo "[smoke] running lint/build/test/e2e"
npm run lint
npm run build
npm test
npm run test:e2e
