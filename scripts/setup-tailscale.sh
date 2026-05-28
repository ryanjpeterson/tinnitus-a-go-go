#!/usr/bin/env bash
# Tinnitus A Go Go — Tailscale setup helper
# Run this once to configure your .env for Tailscale access.
#
# Prerequisites:
#   - Tailscale installed and running on this Mac (https://tailscale.com/download)
#   - .env already exists (cp .env.example .env)

set -euo pipefail

cd "$(dirname "$0")/.."

# Detect the Tailscale IPv4 address
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

if [[ -z "$TAILSCALE_IP" ]]; then
  echo "❌  Tailscale is not running or not installed."
  echo "    Install from: https://tailscale.com/download"
  echo "    Then run: sudo tailscale up"
  exit 1
fi

echo "✅  Tailscale IP detected: $TAILSCALE_IP"

if [[ ! -f .env ]]; then
  echo "❌  .env not found. Run: cp .env.example .env  — then re-run this script."
  exit 1
fi

# Update (or add) the relevant .env values
update_env() {
  local KEY="$1"
  local VALUE="$2"
  if grep -q "^${KEY}=" .env; then
    # Replace existing line
    sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" .env
    echo "   ✓ Updated ${KEY}"
  else
    # Append
    echo "${KEY}=${VALUE}" >> .env
    echo "   + Added ${KEY}"
  fi
}

echo ""
echo "Updating .env for Tailscale access..."

update_env "CORS_ORIGINS" "http://localhost:5173,http://${TAILSCALE_IP}:5173"
update_env "MINIO_PUBLIC_URL" "http://${TAILSCALE_IP}:9000"
update_env "APP_URL" "http://${TAILSCALE_IP}:5173"

echo ""
echo "✅  Done! Start the stack with:"
echo "    pnpm dev:tailscale"
echo ""
echo "Access from macmini / macbookair at:"
echo "    http://${TAILSCALE_IP}:5173"
echo ""
echo "Make sure Tailscale is running on each device that needs access."
