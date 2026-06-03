#!/bin/sh
set -e

# If node_modules is empty or missing vite, run pnpm install
if [ ! -d "node_modules/.bin" ] || [ ! -f "node_modules/.bin/vite" ]; then
  echo "[entrypoint] Installing dependencies..."
  cd /app && pnpm install --frozen-lockfile || pnpm install
fi

exec "$@"
