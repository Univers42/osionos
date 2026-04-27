#!/bin/bash
set -euo pipefail

cd /app

git config --global --add safe.directory /app

LOCKFILES=("/app/package.json" "/app/package-lock.json")
STAMP_DIR="/app/node_modules/.cache"
STAMP_FILE="${STAMP_DIR}/browser-tests-deps.sha256"

current_hash="$(
  cat "${LOCKFILES[@]}" | sha256sum | awk '{print $1}'
)"
cached_hash=""

if [[ -f "${STAMP_FILE}" ]]; then
  cached_hash="$(cat "${STAMP_FILE}")"
fi

if [[ ! -d /app/node_modules/playwright || "${cached_hash}" != "${current_hash}" ]]; then
  echo "[browser-tests] Installing npm dependencies inside Docker cache volume..."
  npm ci --no-audit --fund=false --prefer-offline --progress=false
  mkdir -p "${STAMP_DIR}"
  printf '%s' "${current_hash}" > "${STAMP_FILE}"
  echo "[browser-tests] Dependencies ready."
else
  echo "[browser-tests] Using cached Docker dependencies."
fi

exec "$@"
