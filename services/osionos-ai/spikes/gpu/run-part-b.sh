#!/bin/sh
# Part B of the GPU spike (AI-P0d): the embedder.
#
#   1. the CPU baseline (TEI, the model of the deployment), with the benchmark
#      of P0c (tei-bench.mjs) and the three numbers of the brief;
#   2. llama.cpp on the GPU, as an embedding server, with the same three
#      numbers and the batches 32, 64 and 128;
#   3. the agreement of the two, vector by vector.
#
# Every container is named ai-gpu-*, and every one of them is removed at the
# end. The results go to results/part-b.jsonl.
#
# The steps can be run one at a time, so that a long step does not hold the
# others:
#
# usage: sh run-part-b.sh [tei|gpu|agree|all]
set -eu
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH= cd -- "$SPIKE_DIR/../.." && pwd)
OUT_DIR="${OUT_DIR:-$SPIKE_DIR/results}"
mkdir -p "$OUT_DIR"
JSONL="$OUT_DIR/part-b.jsonl"

TEI_PORT=4911
LLAMA_PORT=18090
TEI_CONTAINER=ai-gpu-tei
EMBED_CONTAINER=ai-gpu-embed
# The GGUF of the embedder: the one the converter of llama.cpp made (see
# convert-e5.sh). It is the model of the deployment: its vectors agree with
# the ones of TEI at a cosine of 0.9998.
GGUF=/models/multilingual-e5-small-official-f16.gguf
TEI_MODEL=intfloat/multilingual-e5-small
# The load average is polled every 60 s, for at most 15 minutes.
CPU_WAIT="${CPU_WAIT:-900}"

vram_used() { cat /sys/class/drm/card1/device/mem_info_vram_used; }
loadavg() { cut -d' ' -f1 /proc/loadavg; }

wait_for_quiet_cpu() {
	deadline=$(( $(date +%s) + ${1:-$CPU_WAIT} ))
	while :; do
		load=$(loadavg)
		if awk "BEGIN{exit !($load < 6)}"; then
			echo "[part-b] the load average is $load, the measurement starts"
			LOAD_START="$load"
			return 0
		fi
		if [ "$(date +%s)" -ge "$deadline" ]; then
			echo "[part-b] the load average stayed at $load after 15 minutes; the measurement goes on anyway" >&2
			LOAD_START="$load"
			return 1
		fi
		echo "[part-b] the load average is $load, waiting for a quiet CPU"
		sleep 60
	done
}

wait_for_url() {
	url="$1"
	waited=0
	until curl -sS -m 5 "$url" >/dev/null 2>&1; do
		waited=$((waited + 1))
		if [ "$waited" -gt 300 ]; then
			echo "[part-b] $url never answered" >&2
			return 1
		fi
		sleep 1
	done
}

cleanup() {
	docker rm -f "$TEI_CONTAINER" "$EMBED_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The guard: no client of the benchmark may run, and the ports of the part
# must be free. The first run of this spike was contaminated by two client
# containers of the benchmark that were still running.
sh "$SPIKE_DIR/guard.sh" "part-b" "$TEI_PORT" "$LLAMA_PORT" || exit 1

# summarize <label> <bench.json> [loadavg]: the line of the table of the
# report. The load average is the one that opened the measurement.
summarize() {
	docker run --rm --network host -e "LOADAVG=${3:-}" \
		-v "$SPIKE_DIR:/s" -v "$OUT_DIR:/out" -w /out node:22-bookworm-slim \
		node /s/summarize-embed.mjs "/out/$2" "$1" >> "$JSONL"
}

# ---------------------------------------------------------------- 1. the CPU baseline (TEI)
step_tei() {
	echo "[part-b] === the CPU baseline: TEI ==="
	docker rm -f "$TEI_CONTAINER" >/dev/null 2>&1 || true
	docker run -d --name "$TEI_CONTAINER" --cpus 8 --memory 6g \
		-p "127.0.0.1:$TEI_PORT:80" \
		-v osionos_ai_models_tei:/data \
		ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4 \
		--model-id "$TEI_MODEL" --json-output >/dev/null
	wait_for_url "http://127.0.0.1:$TEI_PORT/health"
	echo "[part-b] TEI is ready"

	wait_for_quiet_cpu
	echo "[part-b] the benchmark of P0c (tei-bench.mjs), the load average is $LOAD_START"
	docker run --rm --network host \
		-v "$SERVICE_DIR:/s" -w /s \
		-e "TEI_URL=http://127.0.0.1:$TEI_PORT" -e "PASSAGES=2000" \
		node:22-bookworm-slim node spikes/local-models/tei-bench.mjs 2>&1 | tee "$OUT_DIR/tei-bench-p0c.txt" | tail -20
	printf '{"label":"tei-p0c-bench","kind":"p0c-bench","passages":2000,"loadavgStart":%s}\n' "$LOAD_START" >> "$JSONL"

	wait_for_quiet_cpu
	echo "[part-b] the three numbers of the brief, on TEI, the load average is $LOAD_START"
	docker run --rm --network host \
		-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
		-e "EMBED_URL=http://127.0.0.1:$TEI_PORT" -e "EMBED_STYLE=tei" \
		-e "MODEL=$TEI_MODEL" -e "OUT=/out/tei-embed-bench.json" \
		node:22-bookworm-slim node spikes/gpu/embed-bench-gpu.mjs 2>&1 | tee "$OUT_DIR/tei-embed-bench.txt" | tail -12
	summarize "tei-cpu" "tei-embed-bench.json" "$LOAD_START"
}

# ---------------------------------------------------------------- 2. the GPU embedder
step_gpu() {
	echo "[part-b] === the GPU embedder: llama.cpp on Vulkan ==="
	docker rm -f "$EMBED_CONTAINER" >/dev/null 2>&1 || true
	before=$(vram_used)
	docker run -d --name "$EMBED_CONTAINER" \
		--device /dev/dri --group-add 993 \
		-v osionos_ai_models_tei_gguf:/models:ro \
		-p "127.0.0.1:$LLAMA_PORT:8080" \
		ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
		-m "$GGUF" --alias e5-small --host 0.0.0.0 --port 8080 \
		--embedding --pooling mean -ub 512 -np 8 -ngl 99 -t 4 -c 8192 >/dev/null
	wait_for_url "http://127.0.0.1:$LLAMA_PORT/health"
	after=$(vram_used)
	echo "[part-b] the VRAM of the embedder: before=$before after=$after"

	for batch in 32 64 128; do
		wait_for_quiet_cpu
		echo "[part-b] the three numbers, on the GPU, batch=$batch"
		docker run --rm --network host \
			-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
			-e "EMBED_URL=http://127.0.0.1:$LLAMA_PORT" -e "EMBED_STYLE=openai" \
			-e "MODEL=e5-small" -e "BATCH=$batch" -e "OUT=/out/llama-embed-bench-b$batch.json" \
			node:22-bookworm-slim node spikes/gpu/embed-bench-gpu.mjs 2>&1 | tee "$OUT_DIR/llama-embed-bench-b$batch.txt" | tail -10
		summarize "llama-gpu-b$batch" "llama-embed-bench-b$batch.json" "$LOAD_START"
	done
}

# ---------------------------------------------------------------- 3. the agreement
step_agree() {
	echo "[part-b] === the agreement of the two embedders ==="
	wait_for_quiet_cpu
	docker run --rm --network host \
		-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
		-e "TEI_URL=http://127.0.0.1:$TEI_PORT" -e "LLAMA_URL=http://127.0.0.1:$LLAMA_PORT" \
		-e "OUT=/out/embed-agree-official.json" \
		node:22-bookworm-slim node spikes/gpu/embed-agree.mjs 2>&1 | tee "$OUT_DIR/embed-agree-official.txt" | tail -12
	summarize "agree-official" "embed-agree-official.json" "$LOAD_START"

	# The two GGUFs of the community, for the comparison: they are not the
	# model of the deployment (their tokenizer is the sentencepiece BPE one).
	for community in multilingual-e5-small-fp32 multilingual-e5-small-F16; do
		echo "[part-b] the agreement of the community GGUF $community"
		docker rm -f "$EMBED_CONTAINER" >/dev/null 2>&1 || true
		docker run -d --name "$EMBED_CONTAINER" \
			--device /dev/dri --group-add 993 \
			-v osionos_ai_models_tei_gguf:/models:ro \
			-p "127.0.0.1:$LLAMA_PORT:8080" \
			ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580 \
			-m "/models/$community.gguf" --alias e5-small --host 0.0.0.0 --port 8080 \
			--embedding --pooling mean -ub 512 -np 8 -ngl 99 -t 4 -c 8192 >/dev/null
		wait_for_url "http://127.0.0.1:$LLAMA_PORT/health"
		docker run --rm --network host \
			-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
			-e "TEI_URL=http://127.0.0.1:$TEI_PORT" -e "LLAMA_URL=http://127.0.0.1:$LLAMA_PORT" \
			-e "OUT=/out/embed-agree-$community.json" \
			node:22-bookworm-slim node spikes/gpu/embed-agree.mjs 2>&1 | tee "$OUT_DIR/embed-agree-$community.txt" | grep -E 'chunks|questions'
		summarize "agree-$community" "embed-agree-$community.json" "$LOAD_START"
	done
}

STEP="${1:-all}"
case "$STEP" in
tei) step_tei ;;
gpu) step_gpu ;;
agree) step_agree ;;
all)
	step_tei
	step_gpu
	step_agree
	;;
*)
	echo "usage: run-part-b.sh [tei|gpu|agree|all]" >&2
	exit 2
	;;
esac

echo "[part-b] the results are in $JSONL"
