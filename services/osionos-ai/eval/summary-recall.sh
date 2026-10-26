#!/bin/sh
# The quality gate of the conversation summary (context C392): a throwaway
# llama.cpp server with the deployment's model, then summary-recall.ts, which
# writes RESULTS-summary.md and exits non-zero when the gate fails.
#
# usage: sh services/osionos-ai/eval/summary-recall.sh
#   LLM_BACKEND=vulkan (default) or cpu; AI_EVAL_THREADS (20), AI_EVAL_CONCURRENCY (2).
#
# Caveat: Vulkan and CPU can differ slightly at temperature 0; the backend is
# written in the results so two runs are compared on the same one.
set -eu

SERVICE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SERVICE_DIR/../.." && pwd)
HARNESS_LABEL=summary-eval
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"

NETWORK="ai-summary-eval-net-$$"
LLM_CONTAINER="ai-summary-eval-llm-$$"
LLM_VOLUME="osionos_ai_models_llm"
NODE_IMAGE="node:22-bookworm-slim"
CONCURRENCY="${AI_EVAL_CONCURRENCY:-2}"
export LLM_BACKEND="${LLM_BACKEND:-vulkan}"

cleanup() {
	docker rm -f "$LLM_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

MODEL_FILE=$(docker run --rm -v "$LLM_VOLUME:/models:ro" alpine find /models -name '*Q4_K_M*.gguf' | head -n 1)
MODEL_SHA=$(docker run --rm -v "$LLM_VOLUME:/models:ro" alpine sha256sum "$MODEL_FILE" | cut -d' ' -f1)
harness_network_create "$NETWORK"
# One slot per thread in flight, each with room for the 24 000-character window, the summary and the answer.
CONTEXT=$((CONCURRENCY * 12288))
if [ "$LLM_BACKEND" = vulkan ]; then
	docker run -d --name "$LLM_CONTAINER" --network "$NETWORK" \
		--device /dev/dri \
		--group-add "$(getent group render | cut -d: -f3)" \
		--group-add "$(getent group video | cut -d: -f3)" \
		-v "$LLM_VOLUME:/models:ro" --cpus 8 --memory 8g \
		ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
		-m "$MODEL_FILE" --host 0.0.0.0 --port 8080 -c "$CONTEXT" -t 8 --jinja \
		-ngl 99 -fa on -np "$CONCURRENCY" -ctk q8_0 -ctv q8_0 >/dev/null
else
	harness_start_llm "$LLM_CONTAINER" "$NETWORK" "$LLM_VOLUME" "$MODEL_FILE" 8g "$CONTEXT"
fi

docker run --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" \
	-v "$REPO_ROOT:/app" -w /app/services/osionos-ai \
	-e LLM_URL="http://$LLM_CONTAINER:8080" -e LLM_MODEL=qwen3-4b \
	-e OSIONOS_AI_SUMMARY=on \
	-e OSIONOS_AI_DATABASE_URL=postgres://unused@127.0.0.1:1/unused \
	-e OSIONOS_AI_REDIS_URL=redis://127.0.0.1:1 \
	-e OSIONOS_AI_UPSTREAM_BASE_URL=http://127.0.0.1:1 \
	-e OSIONOS_APP_SESSION_SECRET=unused-by-the-eval \
	-e OSIONOS_AI_PLATFORM_MODELS='[{"id":"placeholder","label":"Placeholder","inputMicroUsdPerMTok":0,"outputMicroUsdPerMTok":0,"default":true}]' \
	-e AI_EVAL_THREADS="${AI_EVAL_THREADS:-20}" -e AI_EVAL_CONCURRENCY="$CONCURRENCY" \
	-e AI_EVAL_DEBUG="${AI_EVAL_DEBUG:-}" \
	-e AI_EVAL_RESULTS_FILE="${AI_EVAL_RESULTS_FILE:-RESULTS-summary.md}" \
	-e AI_EVAL_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	-e AI_EVAL_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
	-e AI_EVAL_COMMAND="sh services/osionos-ai/eval/summary-recall.sh" \
	-e AI_EVAL_MODEL_FILE="$(basename "$MODEL_FILE")" -e AI_EVAL_MODEL_SHA="$MODEL_SHA" \
	-e AI_EVAL_LLM_BACKEND="$LLM_BACKEND" \
	"$NODE_IMAGE" sh -c '
		for i in $(seq 1 180); do node -e "fetch(process.env.LLM_URL + \"/health\").then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" && break; sleep 2; done
		node --experimental-strip-types eval/summary-recall.ts'
