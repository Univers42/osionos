#!/bin/sh
# The stack of the indexer measurement: a throwaway Postgres, a throwaway TEI
# with the REAL model, and node:22 that runs an indexer against them.
#
# The corpus is seeded BEFORE the RAG migration, so the backfill of the
# migration is what queues the pages — as bulk work, lane 1.
#
# The stack can run TWO embedders: the query one (the queries of the load) and
# the bulk one (the backfill of the indexer). They are the SAME image, the SAME
# model and the SAME volume — the bulk one reads the volume READ-ONLY.
#
# usage: sh spikes/indexer/harness.sh <label> <rag-migration> <worker-module> [ai-migration]
#   label         the name of the run in the report
#   rag-migration the RAG migration to apply
#   worker-module the module of the indexer under test, relative to
#                 spikes/indexer/measure.mjs
#   ai-migration  the AI migration (the default is the one of groot feat/ai)
#
# The environment:
#   AI_IDX_QUERY_CPUS  the CPUs of the query embedder (8 by default)
#   AI_IDX_BULK_CPUS   the CPUs of the bulk embedder (6 by default)
#   AI_IDX_BULK        1 starts the bulk embedder and points the indexer at it
#   AI_IDX_TEI_MEMORY  the memory of one embedder (3g by default)
#
# Nothing here touches the running stack: the containers and the network are
# named ai-idx-*, and the model volume is shared (the model is cached there).
set -eu

LABEL="${1:-run}"
RAG_MIGRATION="${2:?the RAG migration}"
WORKER_MODULE="${3:-../../src/indexer/worker.ts}"
AI_MIGRATION="${4:-/tmp/claude-1000/-home-dlesieur-Documents-groot-apps-opposite-osiris/f01db1ed-1f78-43ef-aaac-95b48d7f37b9/scratchpad/wt-groot-ai/models/osionos-ai-migration.sql}"

for FILE in "$RAG_MIGRATION" "$AI_MIGRATION"; do
	if [ ! -f "$FILE" ]; then
		echo "usage: harness.sh <label> <rag-migration> <worker-module> [ai-migration]" >&2
		exit 2
	fi
done

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
# The fixture is the one of the shared harness (eval/harness.sh): the roles,
# the two tables and the two functions, written once for the test suite and
# for the golden-set runner.
HARNESS_LABEL=indexer
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"

NETWORK="ai-idx-net"
PG_CONTAINER="ai-idx-pg"
TEI_CONTAINER="ai-idx-tei"
BULK_TEI_CONTAINER="ai-idx-tei-bulk"
DB_IMAGE="pgvector/pgvector:0.8.0-pg16"
TEI_IMAGE="ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4"
NODE_IMAGE="node:22-bookworm-slim"
MODEL="intfloat/multilingual-e5-small"
MODEL_VOLUME="osionos_ai_models_tei"
QUERY_CPUS="${AI_IDX_QUERY_CPUS:-8}"
BULK_CPUS="${AI_IDX_BULK_CPUS:-6}"
TEI_MEMORY="${AI_IDX_TEI_MEMORY:-3g}"

cleanup() {
	docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[indexer] the network $NETWORK"
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
	# The address pool of Docker is exhausted on this host: the network takes
	# a subnet of its own.
	docker network create --subnet "172.16.$(( 240 + ($$ % 10) )).0/24" "$NETWORK" >/dev/null
fi

echo "[indexer] the database $PG_CONTAINER"
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" --network-alias pg \
	-e POSTGRES_PASSWORD=ai_test_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_test \
	"$DB_IMAGE" >/dev/null

# The embedder of one run.
#
# The container is REUSED when it runs with the CPUs of this run and REPLACED
# when it does not: the CPU of the embedder is what the measurement is about,
# and a container that kept the CPUs of the last run would measure the wrong
# thing. The model is in the shared volume, so a replacement costs a load and
# no download.
#
# usage: tei_ensure <container> <alias> <cpus> <mount-mode>
tei_ensure() {
	tei_name="$1"
	tei_alias="$2"
	tei_cpus="$3"
	tei_mode="$4"
	if docker inspect "$tei_name" >/dev/null 2>&1; then
		running=$(docker inspect --format '{{.HostConfig.NanoCpus}}' "$tei_name")
		if [ "$running" = "$((tei_cpus * 1000000000))" ]; then
			return 0
		fi
		echo "[indexer] the embedder $tei_name ran with $running CPUs: it is replaced"
		docker rm -f "$tei_name" >/dev/null 2>&1 || true
	fi
	docker run -d --name "$tei_name" --network "$NETWORK" --network-alias "$tei_alias" \
		-v "$MODEL_VOLUME:/data$tei_mode" \
		--cpus "$tei_cpus" --memory "$TEI_MEMORY" \
		"$TEI_IMAGE" --model-id "$MODEL" --port 80 >/dev/null
}

# The embedder is ready when it answers its health.
tei_wait() {
	docker run --rm --network "$NETWORK" -e TEI_URL="http://$1:80" "$NODE_IMAGE" node -e '
(async () => {
	const deadline = Date.now() + 300000;
	while (Date.now() < deadline) {
		try {
			const answer = await fetch(process.env.TEI_URL + "/health");
			if (answer.ok) process.exit(0);
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	console.error("the embedder never became ready");
	process.exit(1);
})();
'
}

echo "[indexer] the embedder $TEI_CONTAINER ($QUERY_CPUS CPUs)"
tei_ensure "$TEI_CONTAINER" tei "$QUERY_CPUS" ""

BULK_URL=""
if [ "${AI_IDX_BULK:-0}" = "1" ]; then
	echo "[indexer] the bulk embedder $BULK_TEI_CONTAINER ($BULK_CPUS CPUs)"
	tei_ensure "$BULK_TEI_CONTAINER" tei-bulk "$BULK_CPUS" ":ro"
	BULK_URL="http://$BULK_TEI_CONTAINER:80"
else
	# The run has ONE embedder: the bulk one of the last run is removed, so
	# the stack of this run is exactly the stack of the shared rows.
	docker rm -f "$BULK_TEI_CONTAINER" >/dev/null 2>&1 || true
fi

harness_wait_postgres "$PG_CONTAINER" osionos_ai_test postgres
echo "[indexer] postgres is ready"

echo "[indexer] waiting for the embedder"
tei_wait "$TEI_CONTAINER"
echo "[indexer] the embedder is ready"
if [ -n "$BULK_URL" ]; then
	echo "[indexer] waiting for the bulk embedder"
	tei_wait "$BULK_TEI_CONTAINER"
	echo "[indexer] the bulk embedder is ready"
fi

harness_apply_fixture "$PG_CONTAINER" osionos_ai_test postgres

echo "[indexer] seeding the corpus"
SEED_FILE=$(mktemp)
trap 'rm -f "$SEED_FILE"; cleanup' EXIT
docker run --rm --network "$NETWORK" -v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	"$NODE_IMAGE" node spikes/indexer/seed-ten.mjs > "$SEED_FILE"
docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test < "$SEED_FILE" >/dev/null

echo "[indexer] applying the migrations"
harness_apply_migrations "$PG_CONTAINER" osionos_ai_test postgres "$AI_MIGRATION" "$RAG_MIGRATION"

echo "[indexer] the run $LABEL ($WORKER_MODULE)"
docker run --rm --network "$NETWORK" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e AI_IDX_DATABASE_URL="postgres://postgres:ai_test_password@pg:5432/osionos_ai_test" \
	-e AI_IDX_EMBED_URL="http://$TEI_CONTAINER:80" \
	-e AI_IDX_EMBED_BULK_URL="$BULK_URL" \
	-e AI_IDX_WORKER="$WORKER_MODULE" \
	-e AI_IDX_LABEL="$LABEL" \
	-e OSIONOS_AI_EMBED_TARGET_MS="${OSIONOS_AI_EMBED_TARGET_MS:-}" \
	-e OSIONOS_AI_EMBED_MAX_CONCURRENCY="${OSIONOS_AI_EMBED_MAX_CONCURRENCY:-}" \
	-e OSIONOS_AI_EMBED_TOKEN_BUDGET="${OSIONOS_AI_EMBED_TOKEN_BUDGET:-}" \
	"$NODE_IMAGE" node --experimental-strip-types spikes/indexer/measure.mjs
