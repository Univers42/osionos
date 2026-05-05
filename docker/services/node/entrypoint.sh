#!/bin/sh
set -e

# ── Trust /app so git-based tooling works inside container ───────────────────
git config --global --add safe.directory /app 2>/dev/null || true

# ── Install dependencies if needed ──────────────────────────────────────────
# Uses a package.json + pnpm-lock.yaml hash to detect staleness.
# Named volumes persist node_modules and the pnpm store across restarts.
STAMP_DIR="/app/node_modules/.cache"
STAMP="${STAMP_DIR}/pnpm-deps.sha256"

current_hash="$(cat /app/package.json /app/pnpm-lock.yaml | sha256sum | awk '{print $1}')"
cached_hash=""

if [ -f "$STAMP" ]; then
  cached_hash="$(cat "$STAMP")"
fi

if [ ! -d /app/node_modules/.pnpm ] || [ "$cached_hash" != "$current_hash" ]; then
  echo "[entrypoint] Installing dependencies..."
  pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store
  mkdir -p "$STAMP_DIR"
  printf '%s' "$current_hash" > "$STAMP"
  echo "[entrypoint] Dependencies ready."
else
  echo "[entrypoint] Dependencies up to date."
fi

exec "$@"
