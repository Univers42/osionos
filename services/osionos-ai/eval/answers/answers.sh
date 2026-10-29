#!/bin/sh
# The answer runner: a throwaway stack (same as run.sh) plus the local
# llama.cpp model, and node:22 that answers, judges and writes RESULTS.md.
#
# Usage: sh eval/answers/answers.sh <migration> <rag-migration>
# ANSWERS_CHECKPOINT=<path inside the repo>: save each finished question as it ends, resume next run.
# LLM_BACKEND=cpu (default) or vulkan: the backend of the llama.cpp model.
# ANSWERS_LLM_VOLUME (default osionos_ai_models_llm) and ANSWERS_LLM_GLOB (default *Q4_K_M*.gguf):
#   another answer model, e.g. to build a label set the judge was never tuned on.
set -eu

MIGRATION=""
RAG_MIGRATION=""
for MIGRATION_ARG in "$@"; do
	if [ ! -f "$MIGRATION_ARG" ]; then
		echo "usage: answers.sh <path to osionos-ai-migration.sql> <path to osionos-ai-rag-migration.sql>" >&2
		exit 2
	fi
	if [ -z "$MIGRATION" ]; then
		MIGRATION="$MIGRATION_ARG"
	else
		RAG_MIGRATION="$MIGRATION_ARG"
	fi
done
if [ -z "$MIGRATION" ] || [ -z "$RAG_MIGRATION" ]; then
	echo "usage: answers.sh <path to osionos-ai-migration.sql> <path to osionos-ai-rag-migration.sql>" >&2
	exit 2
fi

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)

# Only the repo is mounted into the node container, so a checkpoint outside it
# would be written nowhere. Refuse it here rather than lose the run.
CHECKPOINT_MOUNT=""
if [ -n "${ANSWERS_CHECKPOINT:-}" ]; then
	REPO_ABS=$(realpath -m -- "$REPO_ROOT")
	case "$ANSWERS_CHECKPOINT" in
	/*) CHECKPOINT_ABS=$(realpath -m -- "$ANSWERS_CHECKPOINT") ;;
	*) CHECKPOINT_ABS=$(realpath -m -- "$REPO_ROOT/$ANSWERS_CHECKPOINT") ;;
	esac
	case "$CHECKPOINT_ABS" in
	"$REPO_ABS"/*) CHECKPOINT_MOUNT="/app/${CHECKPOINT_ABS#"$REPO_ABS"/}" ;;
	*)
		echo "[answers] ANSWERS_CHECKPOINT must be inside the repo ($REPO_ROOT): $ANSWERS_CHECKPOINT" >&2
		exit 2
		;;
	esac
fi

HARNESS_LABEL=answers
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"

NETWORK="ai-answers-net-$$"
DB_CONTAINER="ai-answers-db"
TEI_CONTAINER="ai-answers-tei"
LLM_CONTAINER="ai-answers-llm"
DB_IMAGE="pgvector/pgvector:0.8.0-pg16"
TEI_IMAGE="ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4"
NODE_IMAGE="node:22-bookworm-slim"
MODEL="intfloat/multilingual-e5-small"
MODEL_VOLUME="osionos_ai_models_tei"
LLM_MODEL_VOLUME="${ANSWERS_LLM_VOLUME:-osionos_ai_models_llm}"
LLM_MODEL_GLOB="${ANSWERS_LLM_GLOB:-*Q4_K_M*.gguf}"
LLM_MODEL_ALIAS="qwen3-4b"
ANSWER_JUDGE="${ANSWER_JUDGE:-whole}"

cleanup() {
	docker rm -f -v "$DB_CONTAINER" "$TEI_CONTAINER" "$LLM_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[answers] network $NETWORK"
harness_network_create "$NETWORK"

docker rm -f -v "$DB_CONTAINER" "$TEI_CONTAINER" "$LLM_CONTAINER" >/dev/null 2>&1 || true

docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
	-e POSTGRES_PASSWORD=ai_test_password \
	-e POSTGRES_USER=postgres \
	-e POSTGRES_DB=osionos_ai_test \
	"$DB_IMAGE" >/dev/null

docker run -d --name "$TEI_CONTAINER" --network "$NETWORK" \
	-v "$MODEL_VOLUME:/data" \
	--cpus 8 --memory 4g \
	"$TEI_IMAGE" --model-id "$MODEL" >/dev/null

echo "[answers] looking for the model of the LLM"
LLM_MODEL=$(docker run --rm -v "$LLM_MODEL_VOLUME:/models:ro" alpine find /models -name "$LLM_MODEL_GLOB" | head -n 1)
if [ -z "$LLM_MODEL" ]; then
	echo "[answers] no $LLM_MODEL_GLOB model in $LLM_MODEL_VOLUME" >&2
	exit 2
fi
echo "[answers] the model: $LLM_MODEL"

harness_start_llm "$LLM_CONTAINER" "$NETWORK" "$LLM_MODEL_VOLUME" "$LLM_MODEL" 6g 4096

harness_wait_postgres "$DB_CONTAINER" osionos_ai_test postgres
echo "[answers] postgres is ready"

echo "[answers] waiting for the embedder"
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
echo "[answers] the embedder is ready"

echo "[answers] waiting for the LLM"
docker run --rm --network "$NETWORK" -e LLM_URL="http://$LLM_CONTAINER:8080" "$NODE_IMAGE" node -e '
(async () => {
	const deadline = Date.now() + 300000;
	while (Date.now() < deadline) {
		try {
			const answer = await fetch(process.env.LLM_URL + "/health");
			if (answer.ok) process.exit(0);
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	console.error("the LLM never became ready");
	process.exit(1);
})();
'
echo "[answers] the LLM is ready"

harness_apply_fixture "$DB_CONTAINER" osionos_ai_test postgres
harness_apply_migrations "$DB_CONTAINER" osionos_ai_test postgres "$MIGRATION" "$RAG_MIGRATION"

echo "[answers] running the measurement"
set -- --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@$DB_CONTAINER:5432/osionos_ai_test" \
	-e OSIONOS_AI_EMBED_URL="http://$TEI_CONTAINER:80" \
	-e OSIONOS_AI_EMBED_MODEL="$MODEL" \
	-e OSIONOS_AI_LLM_URL="http://$LLM_CONTAINER:8080" \
	-e OSIONOS_AI_LLM_MODEL="$LLM_MODEL_ALIAS" \
	-e ANSWER_JUDGE="$ANSWER_JUDGE"
if [ -n "$CHECKPOINT_MOUNT" ]; then
	set -- "$@" -e ANSWERS_CHECKPOINT="$CHECKPOINT_MOUNT"
fi
docker run "$@" "$NODE_IMAGE" sh -c 'node --experimental-strip-types eval/answers/answers.ts'