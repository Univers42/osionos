#!/bin/sh
# Integration harness for the osionos-ai service: a throwaway Postgres and a
# throwaway Redis on a private network, the AI migrations applied on top, the
# test suite run in node:22. Nothing here touches the running stack.
#
# usage: sh scripts/test.sh /path/to/osionos-ai-migration.sql [/path/to/other.sql ...]
# The migrations are applied in the order they are given, and as many as are
# given: the single-file call still works, the RAG migration (ai_chunks,
# ai_index_queue) is a second one, and the graph migration (ai_page_vectors) a
# third one. A migration given twice is applied twice — that is how the
# idempotence of a migration is proved. AI_TEST_FILES (paths relative to the
# service, default tests/*.test.ts) runs only those files: the review harness
# runs one test file per mutant.
set -eu

MIGRATIONS=""
for MIGRATION in "$@"; do
	if [ ! -f "$MIGRATION" ]; then
		echo "usage: test.sh <path to osionos-ai-migration.sql> [/path/to/other.sql ...]" >&2
		exit 2
	fi
	MIGRATIONS="$MIGRATIONS $MIGRATION"
done
if [ -z "$MIGRATIONS" ]; then
	echo "usage: test.sh <path to osionos-ai-migration.sql> [/path/to/other.sql ...]" >&2
	exit 2
fi

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
# The network, the fixture and the migrations are shared with the golden-set
# runner (eval/run.sh): the fixture SQL is written once, in eval/fixture.sql.
HARNESS_LABEL=test
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"
NETWORK="ai-test-$$"
PG_CONTAINER="ai-test-pg-$$"
REDIS_CONTAINER="ai-test-redis-$$"

cleanup() {
	docker rm -f -v "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[test] network $NETWORK"
harness_network_create "$NETWORK"
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_test_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_test \
	pgvector/pgvector:0.8.0-pg16 >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK" --network-alias redis \
	redis:7.4-alpine >/dev/null

harness_wait_postgres "$PG_CONTAINER" osionos_ai_test postgres
waited=0
until docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 60 ]; then
		echo "[test] redis never became ready" >&2
		exit 1
	fi
	sleep 1
done
echo "[test] postgres and redis are ready"

# The roles the AI migration grants to (service_role) and revokes from (anon,
# authenticated) must exist before it runs, and the tables the service reads
# must be there: that is the fixture, and it is the one the golden-set runner
# uses too.
harness_apply_fixture "$PG_CONTAINER" osionos_ai_test postgres

echo "[test] applying the migrations"
harness_apply_migrations "$PG_CONTAINER" osionos_ai_test postgres $MIGRATIONS

echo "[test] running the suite"
# --test-concurrency=1: the files share one database, and the conversations of
# one file must not disappear under the feet of another one.

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
	-e AI_TEST_FILES="${AI_TEST_FILES:-tests/*.test.ts}" \
	node:22-bookworm-slim sh -c 'node --experimental-strip-types --test --test-concurrency=1 $AI_TEST_FILES'
