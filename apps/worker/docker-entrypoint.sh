#!/bin/sh
set -e

# node_modules lives in a named volume that keeps whatever was installed when
# it was created, so a new dependency (nodemailer) would never arrive. Install
# the worker's dependencies every start — a no-op when nothing changed. Only
# the worker's: apps/api is bind-mounted from the host, and installing there
# would put Linux builds into the host's node_modules.
echo "[entrypoint] Installing worker dependencies..."
cd /app && (pnpm install --frozen-lockfile --filter @tagg/worker... || pnpm install --filter @tagg/worker...)
cd /app/apps/worker

exec "$@"
