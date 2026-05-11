#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMMAND="${1:-}"
shift || true

cd "${ROOT_DIR}"

run_inside_container() {
  case "${COMMAND}" in
    build) exec sh -c 'pnpm exec tsc --noEmit && pnpm exec vite build' ;;
    preview) exec pnpm exec vite preview --host 0.0.0.0 "$@" ;;
    typecheck) exec pnpm exec tsc --noEmit "$@" ;;
    lint) exec pnpm exec eslint src/ --max-warnings=0 "$@" ;;
    lint-fix) exec pnpm exec eslint src/ --fix "$@" ;;
    test-e2e) exec pnpm exec playwright test "$@" ;;
    test-e2e-serial) exec pnpm exec playwright test --workers=1 "$@" ;;
    test-e2e-smoke) exec pnpm exec playwright test tests/e2e/smoke "$@" ;;
    test-canvas) exec node --experimental-strip-types --experimental-loader ./tests/canvas/ts-extension-loader.mjs --test tests/canvas/*.test.ts "$@" ;;
    test-doctor) exec node tests/test-env-doctor.mjs "$@" ;;
    test-bridge) exec node --test tests/bridge/*.test.mjs "$@" ;;
    bridge-api) exec node scripts/bridge-api.mjs "$@" ;;
    mcp-claude) exec node scripts/osionos-mcp-server.mjs "$@" ;;
    quality) pnpm exec tsc --noEmit && exec pnpm exec eslint src/ --max-warnings=0 "$@" ;;
    *) echo "Unknown docker-run command: ${COMMAND}" >&2; exit 2 ;;
  esac
}

if [[ -f /.dockerenv || "${OSIONOS_IN_DOCKER:-}" == "1" ]]; then
  run_inside_container "$@"
fi

if ! docker info >/dev/null 2>&1; then
  echo "[docker-run] Docker is required for '${COMMAND}'." >&2
  exit 1
fi

compose=(docker compose -f docker-compose.base.yml -f docker-compose.dev.yml)
playground_mongo_port="${PLAYGROUND_MONGO_PORT:-27018}"

case "${COMMAND}" in
  build)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh build "$@"
    ;;
  preview)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --service-ports --no-deps playground bash scripts/docker-run.sh preview "$@"
    ;;
  typecheck)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh typecheck "$@"
    ;;
  lint)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh lint "$@"
    ;;
  lint-fix)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh lint-fix "$@"
    ;;
  test-e2e)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps browser-tests pnpm exec playwright test "$@"
    ;;
  test-e2e-serial)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps browser-tests pnpm exec playwright test --workers=1 "$@"
    ;;
  test-e2e-smoke)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps browser-tests pnpm exec playwright test tests/e2e/smoke "$@"
    ;;
  test-canvas)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh test-canvas "$@"
    ;;
  test-doctor)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps browser-tests node tests/test-env-doctor.mjs "$@"
    ;;
  test-bridge)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh test-bridge "$@"
    ;;
  quality)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh quality "$@"
    ;;
  bridge-api)
    (cd ../../.. && docker compose up -d --build osionos-bridge)
    ;;
  mcp-claude)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground bash scripts/docker-run.sh mcp-claude "$@"
    ;;
  *)
    echo "Usage: $0 {build|preview|typecheck|lint|lint-fix|test-e2e|test-e2e-serial|test-e2e-smoke|test-canvas|test-doctor|test-bridge|quality|bridge-api|mcp-claude}" >&2
    exit 2
    ;;
esac