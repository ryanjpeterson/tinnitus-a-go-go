#!/bin/sh
set -e

# apps/web is bind-mounted, so its node_modules links come from whatever was
# installed last, not from this image. Install every start (a no-op when the
# lockfile hasn't changed) so a dependency change in a deploy is picked up.
echo "[entrypoint] Installing dependencies..."
cd /app && (pnpm install --frozen-lockfile || pnpm install)
cd /app/apps/web

exec "$@"
