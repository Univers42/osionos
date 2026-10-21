#!/bin/sh
# The golden-set runner: a throwaway Postgres (the fixture of the test
# harness, the AI migration and the RAG migration), a throwaway TEI with the
# REAL embedder, and node:22 that measures the retrieval on them.
#
# Nothing here touches the running stack: the containers, the network and the
# model volume of the deployment are not the ones of the run (the model volume
# is shared: the model is cached there, and TEI reads it).
#
# usage: sh eval/run.sh <path to osionos-ai-migration.sql> <path to osionos-ai-rag-migration.sql>
set -eu

MIGRATION=""
RAG_MIGRATION=""
for MIGRATION_ARG in "$@"; do
	if [ ! -f "$MIGRATION_ARG" ]; then
		echo "usage: run.sh <path to osionos-ai-migration.sql> <path to osionos-ai-rag-migration.sql>" >&2
		exit 2
	fi
	if [ -z "$MIGRATION" ]; then
		MIGRATION="$MIGRATION_ARG"
	else
		RAG_MIGRATION="$MIGRATION_ARG"
	fi
done
if [ -z "$MIGRATION" ] || [ -z "$RAG_MIGRATION" ]; then
	echo "usage: run.sh <path to osionos-ai-migration.sql> <path to osionos-ai-rag-migration.sql>" >&2
	exit 2
fi

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
# The network, the fixture and the migrations are the ones of the test
# harness: the fixture SQL is written once, in eval/fixture.sql.
HARNESS_LABEL=eval
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"

NETWORK="ai-eval-net-$$"
DB_CONTAINER="ai-eval-db"
TEI_CONTAINER="ai-eval-tei"
DB_IMAGE="pgvector/pgvector:0.8.0-pg16"
TEI_IMAGE="ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4"
NODE_IMAGE="node:22-bookworm-slim"
MODEL="intfloat/multilingual-e5-small"
MODEL_VOLUME="osionos_ai_models_tei"

cleanup() {
	docker rm -f "$DB_CONTAINER" "$TEI_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[eval] network $NETWORK"
harness_network_create "$NETWORK"

# The names of the containers are fixed, so a run that was killed leaves
# nothing behind: what is there is removed first.
docker rm -f "$DB_CONTAINER" "$TEI_CONTAINER" >/dev/null 2>&1 || true

docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
	-e POSTGRES_PASSWORD=ai_test_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_test \
	"$DB_IMAGE" >/dev/null
# The embedder: the model is cached in the volume of the deployment, the
# service is not published (nothing outside the network reaches it).
docker run -d --name "$TEI_CONTAINER" --network "$NETWORK" \
	-v "$MODEL_VOLUME:/data" \
	--cpus 8 --memory 4g \
	"$TEI_IMAGE" --model-id "$MODEL" >/dev/null

harness_wait_postgres "$DB_CONTAINER" osionos_ai_test postgres
echo "[eval] postgres is ready"

echo "[eval] waiting for the embedder"
docker run --rm --network "$NETWORK" -e TEI_URL="http://$TEI_CONTAINER:80" "$NODE_IMAGE" node -e '
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
echo "[eval] the embedder is ready"

harness_apply_fixture "$DB_CONTAINER" osionos_ai_test postgres
harness_apply_migrations "$DB_CONTAINER" osionos_ai_test postgres "$MIGRATION" "$RAG_MIGRATION"

echo "[eval] running the measurement"
docker run --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@$DB_CONTAINER:5432/osionos_ai_test" \
	-e OSIONOS_AI_EMBED_URL="http://$TEI_CONTAINER:80" \
	-e OSIONOS_AI_EMBED_MODEL="$MODEL" \
	-e AI_EVAL_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	-e AI_EVAL_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
	-e AI_EVAL_COMMAND="sh services/osionos-ai/eval/run.sh $MIGRATION $RAG_MIGRATION" \
	-e AI_EVAL_DB_IMAGE="$DB_IMAGE" \
	-e AI_EVAL_TEI_IMAGE="$TEI_IMAGE" \
	-e AI_EVAL_NODE_IMAGE="$NODE_IMAGE" \
	-e AI_EVAL_RESULTS_FILE="${AI_EVAL_RESULTS_FILE:-RESULTS.md}" \
	-e AI_EVAL_SKIP_ACL_FILTER="${AI_EVAL_SKIP_ACL_FILTER:-}" \
	"$NODE_IMAGE" sh -c 'node --experimental-strip-types eval/run.ts'
