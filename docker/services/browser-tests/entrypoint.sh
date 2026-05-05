#!/bin/bash
set -euo pipefail

cd /app

git config --global --add safe.directory /app 2>/dev/null || true

LOCKFILES=("/app/package.json" "/app/pnpm-lock.yaml")
STAMP_DIR="/app/node_modules/.cache"
STAMP_FILE="${STAMP_DIR}/browser-tests-deps.sha256"

current_hash="$(
  cat "${LOCKFILES[@]}" | sha256sum | awk '{print $1}'
)"
cached_hash=""
shopt -s nullglob
playwright_core_metadata=(/app/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json)

if [[ -f "${STAMP_FILE}" ]]; then
  cached_hash="$(cat "${STAMP_FILE}")"
fi

if [[ ! -d /app/node_modules/.pnpm || "${#playwright_core_metadata[@]}" -eq 0 || "${cached_hash}" != "${current_hash}" ]]; then
  echo "[browser-tests] Installing pnpm dependencies inside Docker cache volume..."
  pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store
  mkdir -p "${STAMP_DIR}"
  printf '%s' "${current_hash}" > "${STAMP_FILE}"
  echo "[browser-tests] Dependencies ready."
else
  echo "[browser-tests] Using cached Docker dependencies."
fi

exec "$@"
#!/bin/bash
set -euo pipefail

cd /app

git config --global --add safe.directory /app 2>/dev/null || true

LOCKFILES=("/app/package.json" "/app/pnpm-lock.yaml")
STAMP_DIR="/app/node_modules/.cache"
STAMP_FILE="${STAMP_DIR}/browser-tests-deps.sha256"

current_hash="$(
  cat "${LOCKFILES[@]}" | sha256sum | awk '{print $1}'
)"
cached_hash=""

if [[ -f "${STAMP_FILE}" ]]; then
  cached_hash="$(cat "${STAMP_FILE}")"
fi

if [[ ! -d /app/node_modules/.pnpm || ! -f /app/node_modules/playwright-core/browsers.json || "${cached_hash}" != "${current_hash}" ]]; then
  echo "[browser-tests] Installing pnpm dependencies inside Docker cache volume..."
  pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store
  mkdir -p "${STAMP_DIR}"
  printf '%s' "${current_hash}" > "${STAMP_FILE}"
  echo "[browser-tests] Dependencies ready."
else
  echo "[browser-tests] Using cached Docker dependencies."
fi

exec "$@"
