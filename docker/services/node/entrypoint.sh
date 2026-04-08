#!/bin/sh
set -e

# ── Trust /app so git (used by turbo for dirty-hash) works inside container ─
git config --global --add safe.directory /app

# ── Install dependencies if needed ──────────────────────────────────────────
# Uses pnpm-lock.yaml modification time to detect staleness.
# Named volume persists node_modules across restarts.
LOCK="/app/pnpm-lock.yaml"
STAMP="/app/node_modules/.install-stamp"

if [ ! -f "$STAMP" ] || [ "$LOCK" -nt "$STAMP" ]; then
  echo "[entrypoint] Installing dependencies..."
  pnpm install --frozen-lockfile --prefer-offline 2>&1 | tail -3
  touch "$STAMP"
  echo "[entrypoint] Dependencies ready."
else
  echo "[entrypoint] Dependencies up to date."
fi

# ── Build packages (types → core → api) if dist is missing ──────────────────
if [ ! -f "/app/packages/types/dist/index.js" ]; then
  echo "[entrypoint] Building packages..."
  pnpm turbo run build --filter='./packages/*' 2>&1 | tail -5
  echo "[entrypoint] Packages built."
fi

exec "$@"
