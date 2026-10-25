#!/bin/sh
# The service suite, one test file: the same throwaway stack as scripts/test.sh,
# but with the file the caller names. For the slow suites only.
#
# usage: sh scripts/one-test.sh <path to osionos-ai-migration.sql> <path to rag.sql> <path to graph.sql> <test file>
set -eu

MIGRATIONS=""
for MIGRATION in "$1" "$2" "$3"; do
	MIGRATIONS="$MIGRATIONS $MIGRATION"
done
TEST_FILE="$4"

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
HARNESS_LABEL=test
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"
NETWORK="ai-one-$$"
PG_CONTAINER="ai-one-pg-$$"
REDIS_CONTAINER="ai-one-redis-$$"

cleanup() {
	docker rm -f -v "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

harness_network_create "$NETWORK"
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_test_password -e POSTGRES_USER=postgres -e POSTGRES_DB=osionos_ai_test \
	pgvector/pgvector:0.8.0-pg16 >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" --network-alias redis redis:7.4-alpine >/dev/null

harness_wait_postgres "$PG_CONTAINER" osionos_ai_test postgres
waited=0
until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 60 ]; then echo "[one] redis never became ready" >&2; exit 1; fi
	sleep 1
done

harness_apply_fixture "$PG_CONTAINER" osionos_ai_test postgres
harness_apply_migrations "$PG_CONTAINER" osionos_ai_test postgres $MIGRATIONS


docker run --rm --network "$NETWORK" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_PORT=0 \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@pg:5432/osionos_ai_test" \
	-e OSIONOS_AI_REDIS_URL="redis://redis:6379" \
	-e OSIONOS_APP_SESSION_SECRET="test-app-session-secret" \
	-e OSIONOS_APP_SESSION_TTL_SECONDS=3600 \
	-e OSIONOS_SESSION_CUTOFFS=off \
	-e OSIONOS_BAAS_URL="https://baas.invalid" \
	-e SERVICE_ROLE_KEY="test-service-role-key" \
	-e OSIONOS_AI_UPSTREAM_BASE_URL="https://127.0.0.1:1/v1" \
	-e OSIONOS_AI_PLATFORM_MODELS='[{"id":"placeholder","label":"Placeholder","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0,"default":true}]' \
	-e OSIONOS_AI_MAX_OUTPUT_TOKENS=1024 \
	-e OSIONOS_AI_USER_DAILY_MICROUSD=200000 \
	-e OSIONOS_AI_PLATFORM_DAILY_MICROUSD=20000000 \
	-e OSIONOS_AI_RUNS_PER_MINUTE=100 \
	node:22-bookworm-slim sh -c "node --experimental-strip-types --test --test-concurrency=1 $TEST_FILE"
