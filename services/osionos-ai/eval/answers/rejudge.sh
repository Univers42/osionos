#!/bin/sh
# The rejudge runner: only the local llama.cpp model, then node:22 that
# re-judges the stored label answers and calibrates the result.
#
# Usage: sh eval/answers/rejudge.sh <model-volume> <gguf-name-glob> <judge> <out.jsonl>
#   judge: whole (judge.ts) or claims (claimJudge.ts)
#   CLAIM_QUOTE_RATIO (default 1) how much of a claim's quote must appear in its
#     source, in (0, 1]; only the claims judge uses it.
#   CLAIM_ABSTAIN_RULE (default 0) 1 treats a short not-in-sources answer as an
#     abstention, whatever claims it lists; only the claims judge uses it.
#   CLAIM_SOURCE_FALLBACK (default 0) 1 asks whether the whole source supports a
#     claim whose quote check fails; only the claims judge uses it.
#   CLAIM_ANY_SOURCE (default 0) 1 makes a claim faithful if any of its listed
#     sources passes; only the claims judge uses it.
#   CLAIM_LENIENT_WORDING (default 0) 1 uses wording-tolerant prompts; only the
#     claims judge uses it.
#   LLM_MEMORY (default 6g) caps the model container; a 14B Q4_K_M needs about 11g.
#   LLM_BACKEND (default cpu) the llama.cpp backend: cpu or vulkan (the host GPU).
#   LABELS_FILE (default labels.jsonl) the rows to re-judge: labels.jsonl or heldout.jsonl.
#
# It never writes a label file: the new rows go to <out.jsonl>.
set -eu

if [ "$#" -ne 4 ]; then
	echo "usage: rejudge.sh <model-volume> <gguf-name-glob> <judge> <out.jsonl>" >&2
	exit 2
fi

MODEL_VOLUME=$1
MODEL_GLOB=$2
JUDGE=$3
OUT=$4

if [ "$JUDGE" != "whole" ] && [ "$JUDGE" != "claims" ]; then
	echo "rejudge.sh: judge must be whole or claims, not $JUDGE" >&2
	exit 2
fi

SERVICE_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SERVICE_DIR/../.." && pwd)
export HARNESS_LABEL=rejudge
HARNESS_DIR="$SERVICE_DIR/eval"
. "$HARNESS_DIR/harness.sh"

NETWORK="ai-rejudge-net-$$"
LLM_CONTAINER="ai-rejudge-llm-$$"
NODE_IMAGE="node:22-bookworm-slim"
LLM_MODEL_ALIAS="qwen3-4b"
LLM_MEMORY=${LLM_MEMORY:-6g}

OUT_DIR=$(dirname -- "$OUT")
mkdir -p "$OUT_DIR"
OUT_DIR=$(CDPATH='' cd -- "$OUT_DIR" && pwd)
OUT="$OUT_DIR/$(basename -- "$OUT")"
rm -f "$OUT"

cleanup() {
	docker rm -f -v "$LLM_CONTAINER" >/dev/null 2>&1 || true
	docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[rejudge] network $NETWORK"
harness_network_create "$NETWORK"

echo "[rejudge] looking for the model of the LLM"
LLM_MODEL=$(docker run --rm -v "$MODEL_VOLUME:/models:ro" alpine find /models -name "$MODEL_GLOB" | head -n 1)
if [ -z "$LLM_MODEL" ]; then
	echo "[rejudge] no model matching $MODEL_GLOB in $MODEL_VOLUME" >&2
	exit 2
fi
echo "[rejudge] the model: $LLM_MODEL"

docker rm -f -v "$LLM_CONTAINER" >/dev/null 2>&1 || true
harness_start_llm "$LLM_CONTAINER" "$NETWORK" "$MODEL_VOLUME" "$LLM_MODEL" "$LLM_MEMORY" 8192

echo "[rejudge] waiting for the LLM"
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
echo "[rejudge] the LLM is ready"

echo "[rejudge] re-judging and calibrating"
docker run --rm --network "$NETWORK" \
	--user "$(id -u):$(id -g)" \
	-v "$REPO_ROOT:/app" \
	-v "$OUT_DIR:$OUT_DIR" \
	-w /app/services/osionos-ai \
	-e JUDGE="$JUDGE" \
	-e LABELS_FILE="${LABELS_FILE:-labels.jsonl}" \
	-e CLAIM_QUOTE_RATIO="${CLAIM_QUOTE_RATIO:-1}" \
	-e CLAIM_ABSTAIN_RULE="${CLAIM_ABSTAIN_RULE:-0}" \
	-e CLAIM_SOURCE_FALLBACK="${CLAIM_SOURCE_FALLBACK:-0}" \
	-e CLAIM_ANY_SOURCE="${CLAIM_ANY_SOURCE:-0}" \
	-e CLAIM_LENIENT_WORDING="${CLAIM_LENIENT_WORDING:-0}" \
	-e OSIONOS_AI_LLM_URL="http://$LLM_CONTAINER:8080" \
	-e OSIONOS_AI_LLM_MODEL="$LLM_MODEL_ALIAS" \
	-e OUT_PATH="$OUT" \
	"$NODE_IMAGE" sh -c 'node --experimental-strip-types eval/answers/rejudge.ts "$OUT_PATH" && node --experimental-strip-types eval/answers/calibrate.ts "$OUT_PATH"'
