#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMMAND="${1:-}"
shift || true

cd "${ROOT_DIR}"

run_inside_container() {
  case "${COMMAND}" in
    build) exec pnpm run build:local "$@" ;;
    preview) exec pnpm run preview:local "$@" ;;
    typecheck) exec pnpm run typecheck:local "$@" ;;
    lint) exec pnpm run lint:local "$@" ;;
    lint-fix) exec pnpm run lint:fix:local "$@" ;;
    test-e2e) exec pnpm run test:e2e:local -- "$@" ;;
    test-e2e-serial) exec pnpm run test:e2e:serial:local -- "$@" ;;
    test-e2e-smoke) exec pnpm run test:e2e:smoke:local -- "$@" ;;
    test-doctor) exec pnpm run test:doctor:local "$@" ;;
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
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground pnpm run build:local "$@"
    ;;
  preview)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --service-ports --no-deps playground pnpm run preview:local "$@"
    ;;
  typecheck)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground pnpm run typecheck:local "$@"
    ;;
  lint)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground pnpm run lint:local "$@"
    ;;
  lint-fix)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps playground pnpm run lint:fix:local "$@"
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
  test-doctor)
    MONGO_PORT="${playground_mongo_port}" "${compose[@]}" run --rm --no-deps browser-tests pnpm run test:doctor:local "$@"
    ;;
  *)
    echo "Usage: $0 {build|preview|typecheck|lint|lint-fix|test-e2e|test-e2e-serial|test-e2e-smoke|test-doctor}" >&2
    exit 2
    ;;
esac