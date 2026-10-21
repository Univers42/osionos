#!/bin/sh
# Part C of the GPU spike (AI-P0d): one GPU, the LLM and the embedder.
#
#   1. the query p95 of the GPU embedder while the LLM serves lambda = 1;
#   2. the TTFT and the ITL p95 of the LLM while the embedder runs a backfill;
#   3. the VRAM of the two together.
#
# The two models share one card with the desktop of the user, so the VRAM of
# the brief (7.4 GiB) is checked before anything is measured: when the two do
# not fit, it is written down and the run is skipped.
#
# usage: sh run-part-c.sh
set -eu
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH= cd -- "$SPIKE_DIR/../.." && pwd)
OUT_DIR="${OUT_DIR:-$SPIKE_DIR/results}"
mkdir -p "$OUT_DIR"
JSONL="$OUT_DIR/part-c.jsonl"

VRAM_LIMIT=7946554000
LLM_PORT=18080
EMBED_PORT=18090
LLM_CONTAINER=ai-gpu-c-llm
EMBED_CONTAINER=ai-gpu-c-embed
SHIM_CONTAINER=ai-gpu-c-shim
MODEL_PATH=/models/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/snapshots/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
# The GGUF of the embedder: the f16 one, the smallest of the two.
GGUF=/models/multilingual-e5-small-official-f16.gguf
DURATION="${DURATION:-60}"
LAMBDA="${LAMBDA:-1}"

vram_used() { cat /sys/class/drm/card1/device/mem_info_vram_used; }
loadavg() { cut -d' ' -f1 /proc/loadavg; }

cleanup() {
	docker rm -f "$LLM_CONTAINER" "$EMBED_CONTAINER" "$SHIM_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[part-c] === the LLM and the GPU embedder, on the same card ==="
docker rm -f "$LLM_CONTAINER" "$EMBED_CONTAINER" >/dev/null 2>&1 || true

before=$(vram_used)
echo "[part-c] the VRAM before: $before"

# The LLM: the configuration that won in Part A.
docker run -d --name "$LLM_CONTAINER" \
	--device /dev/dri --group-add 993 \
	-v osionos_ai_models_llm:/models:ro \
	-p "127.0.0.1:$LLM_PORT:8080" \
	ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
	-m "$MODEL_PATH" --alias qwen3-4b --host 0.0.0.0 --port 8080 --jinja --metrics \
	-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0 >/dev/null

# The embedder: the same server, in embedding mode.
docker run -d --name "$EMBED_CONTAINER" \
	--device /dev/dri --group-add 993 \
	-v osionos_ai_models_tei_gguf:/models:ro \
	-p "127.0.0.1:$EMBED_PORT:8080" \
	ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
	-m "$GGUF" --alias e5-small --host 0.0.0.0 --port 8080 \
	--embedding --pooling mean -ub 512 -np 8 -ngl 99 -t 4 -c 2048 >/dev/null

waited=0
until curl -sS -m 5 "http://127.0.0.1:$LLM_PORT/v1/models" 2>/dev/null | grep -q '"id"'; do
	waited=$((waited + 1))
	[ "$waited" -gt 180 ] && break
	sleep 1
done
waited=0
until curl -sS -m 5 "http://127.0.0.1:$EMBED_PORT/health" >/dev/null 2>&1; do
	waited=$((waited + 1))
	[ "$waited" -gt 180 ] && break
	sleep 1
done
sleep 3
after=$(vram_used)
echo "[part-c] the VRAM with the two models: $after (delta $((after - before)))"

if [ "$after" -gt "$VRAM_LIMIT" ]; then
	echo "[part-c] DOES NOT FIT: $after > $VRAM_LIMIT" | tee -a "$JSONL"
	printf '{"label":"part-c","fits":false,"vramAfter":%s,"vramLimit":%s}\n' "$after" "$VRAM_LIMIT" >> "$JSONL"
	exit 0
fi

# ---------------------------------------------------------------- 1. the queries under the LLM
echo "[part-c] === the query p95 of the embedder while the LLM serves lambda=$LAMBDA ==="
sh "$SPIKE_DIR/gpu-sampler.sh" "$OUT_DIR/part-c.sample" "$((DURATION + 120))" &
sampler=$!
sleep 1
docker run --rm --network host \
	-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
	-e "LLM_URL=http://127.0.0.1:$LLM_PORT" -e "LAMBDA=$LAMBDA" -e "DURATION=$DURATION" \
	-e "LABEL=part-c-llm-only" -e "DRAIN_MS=45000" -e "OUT=/out/part-c-llm-only.json" \
	node:22-bookworm-slim node spikes/gpu/llm-bench-gpu.mjs
sleep 2
docker run --rm --network host \
	-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
	-e "EMBED_URL=http://127.0.0.1:$EMBED_PORT" -e "EMBED_STYLE=openai" \
	-e "MODEL=e5-small" -e "QUERIES=200" -e "PASSAGES=200" \
	-e "OUT=/out/part-c-query-under-llm.json" \
	node:22-bookworm-slim node spikes/gpu/embed-bench-gpu.mjs 2>&1 | tail -8

# ---------------------------------------------------------------- 2. the LLM under the backfill
echo "[part-c] === the LLM under the backfill of the embedder ==="
docker run --rm --network host \
	-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
	-e "EMBED_URL=http://127.0.0.1:$EMBED_PORT" -e "EMBED_STYLE=openai" \
	-e "MODEL=e5-small" -e "QUERIES=20" -e "PASSAGES=600" -e "BATCH=32" -e "CONC=4" \
	-e "OUT=/out/part-c-backfill.json" \
	node:22-bookworm-slim node spikes/gpu/embed-bench-gpu.mjs 2>&1 | tail -6 &

backfill=$!
sleep 10
docker run --rm --network host \
	-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
	-e "LLM_URL=http://127.0.0.1:$LLM_PORT" -e "LAMBDA=$LAMBDA" -e "DURATION=$DURATION" \
	-e "LABEL=part-c-llm-under-backfill" -e "DRAIN_MS=45000" -e "OUT=/out/part-c-llm-under-backfill.json" \
	node:22-bookworm-slim node spikes/gpu/llm-bench-gpu.mjs
wait "$backfill" 2>/dev/null || true

kill "$sampler" 2>/dev/null || true
wait "$sampler" 2>/dev/null || true
for name in part-c-llm-only part-c-llm-under-backfill; do
	docker run --rm --network host -v "$SPIKE_DIR:/s" -v "$OUT_DIR:/out" -w /out node:22-bookworm-slim \
		node /s/summarize.mjs "/out/$name.json" "/out/part-c.sample" "$name" >> "$JSONL"
done
echo "[part-c] the results are in $JSONL"
