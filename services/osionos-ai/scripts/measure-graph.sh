#!/bin/sh
# The measures of the graph's slice, on the eval corpus: a throwaway Postgres
# and a throwaway Redis, the fixture, the migrations, the corpus of the golden
# set, and the measure itself.
#
# usage: sh scripts/measure-graph.sh <path to osionos-ai-migration.sql> <path to rag.sql> <path to graph.sql> <mode>
#   the mode is indexer, retrieval or related (see eval/measure-graph.ts)
set -eu

MIGRATIONS=""
for MIGRATION in "$1" "$2" "$3"; do
	MIGRATIONS="$MIGRATIONS $MIGRATION"
done
MODE="$4"

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
HARNESS_LABEL=measure
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"
NETWORK="ai-measure-$$"
PG_CONTAINER="ai-measure-pg-$$"

cleanup() {
	docker rm -f -v "$PG_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

harness_network_create "$NETWORK"
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_test_password -e POSTGRES_USER=postgres -e POSTGRES_DB=osionos_ai_test \
	pgvector/pgvector:0.8.0-pg16 >/dev/null
harness_wait_postgres "$PG_CONTAINER" osionos_ai_test postgres
harness_apply_fixture "$PG_CONTAINER" osionos_ai_test postgres
harness_apply_migrations "$PG_CONTAINER" osionos_ai_test postgres $MIGRATIONS

# The corpus of the golden set: the pages the questions ask about. The seed
# runs in a node container (the host has no node), the SQL goes to psql.
docker run --rm -v "$REPO_ROOT:/app" -w /app/services/osionos-ai node:22-bookworm-slim node eval/seed.mjs \
	| docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test >/dev/null

docker run --rm --network "$NETWORK" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@pg:5432/osionos_ai_test" \
	-e OSIONOS_AI_EMBED_MODEL="intfloat/multilingual-e5-small" \
	node:22-bookworm-slim node --experimental-strip-types eval/measure-graph.ts "$MODE"
