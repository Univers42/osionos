#!/bin/sh
# The golden set with the GPU embedder (AI-P0d, Part B).
#
# The runner of the golden set (eval/run.sh) starts its own TEI and points
# OSIONOS_AI_EMBED_URL at it. It cannot be pointed at llama.cpp: the two
# services do not speak the same API (TEI answers POST /embed with a bare
# array, llama.cpp answers POST /v1/embeddings with {data:[...]}).
#
# So this script does what eval/run.sh does, with ONE thing changed: the
# embedding service is the shim (spikes/gpu/tei-shim.mjs), which is the TEI
# shape on top of the llama.cpp server. The retrieval of the service
# (src/retrieval/search.ts), the indexer (src/indexer/worker.ts) and the
# runner (eval/run.ts) are the real ones, unchanged.
#
# The migrations come from the paths of the brief.
#
# usage: sh run-eval-gpu.sh <osionos-ai-migration.sql> <osionos-ai-rag-migration.sql>
set -eu
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH= cd -- "$SPIKE_DIR/../.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
OUT_DIR="${OUT_DIR:-$SPIKE_DIR/results}"
mkdir -p "$OUT_DIR"

MIGRATION=""
RAG_MIGRATION=""
for argument in "$@"; do
	if [ -z "$MIGRATION" ]; then
		MIGRATION="$argument"
	else
		RAG_MIGRATION="$argument"
	fi
done
if [ ! -f "$MIGRATION" ] || [ ! -f "$RAG_MIGRATION" ]; then
	echo "usage: run-eval-gpu.sh <osionos-ai-migration.sql> <osionos-ai-rag-migration.sql>" >&2
	exit 2
fi

NETWORK="ai-gpu-eval-net"
DB_CONTAINER=ai-gpu-eval-db
EMBED_CONTAINER=ai-gpu-eval-embed
SHIM_CONTAINER=ai-gpu-eval-shim
DB_IMAGE=pgvector/pgvector:0.8.0-pg16
TEI_IMAGE=ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4
NODE_IMAGE=node:22-bookworm-slim
VULKAN_IMAGE=ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580
# The image of the embedder: the GPU one, or the CPU one (the test of the
# harness itself, which must not touch the card while the LLM runs).
EMBED_IMAGE="${EMBED_IMAGE:-$VULKAN_IMAGE}"
EMBED_DEVICE="${EMBED_DEVICE:---device /dev/dri --group-add 993}"
MODEL=intfloat/multilingual-e5-small
GGUF=/models/multilingual-e5-small-official-f16.gguf

cleanup() {
	docker rm -f "$DB_CONTAINER" "$EMBED_CONTAINER" "$SHIM_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "$DB_CONTAINER" "$EMBED_CONTAINER" "$SHIM_CONTAINER" >/dev/null 2>&1 || true
docker network rm "$NETWORK" >/dev/null 2>&1 || true
# The address pool of docker can be exhausted on a busy machine: the network
# of the run then takes a subnet of its own (the same trick as harness.sh).
if ! docker network create "$NETWORK" >/dev/null 2>&1; then
	docker network create --subnet 10.89.7.0/24 "$NETWORK" >/dev/null
fi

docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
	-e POSTGRES_PASSWORD=ai_test_password -e POSTGRES_USER=postgres -e POSTGRES_DB=osionos_ai_test \
	"$DB_IMAGE" >/dev/null

# The embedder: the GPU one, llama.cpp in embedding mode.
docker run -d --name "$EMBED_CONTAINER" --network "$NETWORK" \
	$EMBED_DEVICE \
	-v osionos_ai_models_tei_gguf:/models:ro \
	"$EMBED_IMAGE" \
	-m "$GGUF" --alias e5-small --host 0.0.0.0 --port 8080 \
	--embedding --pooling mean -ub 512 -np 8 -ngl 99 -t 4 -c 2048 >/dev/null

# The shim: the TEI shape on top of it.
docker run -d --name "$SHIM_CONTAINER" --network "$NETWORK" \
	-v "$SPIKE_DIR:/s:ro" \
	-e "LLAMA_URL=http://$EMBED_CONTAINER:8080" -e "PORT=8081" \
	"$NODE_IMAGE" node /s/tei-shim.mjs >/dev/null

echo "[eval-gpu] waiting for postgres"
waited=0
until docker exec "$DB_CONTAINER" pg_isready -U postgres -d osionos_ai_test >/dev/null 2>&1; do
	waited=$((waited + 1))
	[ "$waited" -gt 90 ] && { echo "postgres never became ready" >&2; exit 1; }
	sleep 1
done

echo "[eval-gpu] waiting for the embedder and the shim"
docker run --rm --network "$NETWORK" -e "SHIM_URL=http://$SHIM_CONTAINER:8081" "$NODE_IMAGE" node -e '
(async () => {
	const deadline = Date.now() + 300000;
	while (Date.now() < deadline) {
		try {
			const health = await fetch(process.env.SHIM_URL + "/health");
			if (health.ok) {
				const embed = await fetch(process.env.SHIM_URL + "/embed", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ inputs: ["query: hello"] }),
				});
				const body = await embed.json();
				if (Array.isArray(body) && body.length === 1 && body[0].length === 384) { process.exit(0); }
				console.error("the shim answers", JSON.stringify(body).slice(0, 200));
			}
		} catch (error) { console.error(String(error.message)); }
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	console.error("the embedder never became ready");
	process.exit(1);
})();
'

echo "[eval-gpu] applying the fixture and the migrations"
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test \
	< "$SERVICE_DIR/eval/fixture.sql" >/dev/null
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test \
	< "$MIGRATION" >/dev/null
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d osionos_ai_test \
	< "$RAG_MIGRATION" >/dev/null

echo "[eval-gpu] running the golden set with the GPU embedder"
docker run --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" \
	-v "$REPO_ROOT:/app" -v "$OUT_DIR:/out" -w /app/services/osionos-ai \
	-e OSIONOS_AI_DATABASE_URL="postgres://postgres:ai_test_password@$DB_CONTAINER:5432/osionos_ai_test" \
	-e OSIONOS_AI_EMBED_URL="http://$SHIM_CONTAINER:8081" \
	-e OSIONOS_AI_EMBED_MODEL="$MODEL" \
	-e AI_EVAL_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	-e AI_EVAL_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
	-e AI_EVAL_COMMAND="sh services/osionos-ai/spikes/gpu/run-eval-gpu.sh $MIGRATION $RAG_MIGRATION" \
	-e AI_EVAL_DB_IMAGE="$DB_IMAGE" \
	-e AI_EVAL_TEI_IMAGE="$TEI_IMAGE" \
	-e AI_EVAL_NODE_IMAGE="$NODE_IMAGE" \
	-e AI_EVAL_RESULTS_FILE="/out/eval-gpu-results.md" \
	"$NODE_IMAGE" sh -c 'node --experimental-strip-types eval/run.ts'
echo "[eval-gpu] the report is in $OUT_DIR/eval-gpu-results.md"
