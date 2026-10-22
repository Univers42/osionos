#!/bin/sh
# The image-generation part of the spike (AI-A1): stable-diffusion.cpp on the
# Vulkan GPU, the free local default of M1 (devil C71, C73, C75).
#
# One run = one container `ai-a1-sd` that loads the model, makes N images from
# results/prompts.txt one after the other, and exits. The sampler covers the
# whole run, from before the container starts to after it exits, so the peak
# VRAM of the report includes the load.
#
# The text encoder is the Qwen3-4B-Instruct-2507 Q4_K_M already cached for the
# chat model (volume osionos_ai_models_llm): no second 4 GB download.
#
# usage: sh imagegen.sh <label> <count> [extra sd-cli args ...]
#   e.g. sh imagegen.sh gpu-512 5
#        sh imagegen.sh te-cpu-512 5 --backend te=cpu
#
# Writes results/imagegen/<label>/{run.log,gpu.tsv,NN.png} and prints one
# summary line per image (the sd-cli timings) and the peak VRAM.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
LABEL="$1"
COUNT="$2"
shift 2

IMAGE='ghcr.io/leejet/stable-diffusion.cpp:master-vulkan@sha256:6d75b94d1d4222f9dd8a3b1494a5c8a6a31dc06976d9201dd83b7f9c32ffe343'
LLM='/llm/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/blobs/3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597'
OUT="$HERE/results/imagegen/$LABEL"
VRAM=/sys/class/drm/card1/device/mem_info_vram_used

sh "$HERE/guard.sh" "imagegen $LABEL"
mkdir -p "$OUT"
: > "$OUT/run.log"

sh "$HERE/gpu-sampler.sh" "$OUT/gpu.tsv" 3600 &
SAMPLER=$!
trap 'kill "$SAMPLER" 2>/dev/null || true; docker rm -f ai-a1-sd >/dev/null 2>&1 || true' EXIT INT TERM
sleep 1
echo "idle_vram_bytes $(cat "$VRAM")" >> "$OUT/run.log"

i=0
head -n "$COUNT" "$HERE/results/prompts.txt" | while IFS= read -r prompt; do
	i=$((i + 1))
	n=$(printf '%02d' "$i")
	start=$(date +%s.%N)
	timeout 900 docker run --rm --name ai-a1-sd \
		--device /dev/dri --group-add 993 --group-add 44 \
		-v osionos_sd_models:/models:ro -v osionos_ai_models_llm:/llm:ro -v "$OUT":/out \
		--entrypoint /sd-cli "$IMAGE" \
		--diffusion-model /models/z_image_turbo-Q4_0.gguf --llm "$LLM" --vae /models/ae-f16.gguf \
		--cfg-scale 1.0 --steps 8 -W 512 -H 512 --seed 42 \
		-p "$prompt" -o "/out/$n.png" "$@" >> "$OUT/run.log" 2>&1
	end=$(date +%s.%N)
	echo "image $n wall_s $(echo "$end - $start" | bc)" | tee -a "$OUT/run.log"
done

kill "$SAMPLER" 2>/dev/null || true
grep -E 'completed|taking|image [0-9]+ wall_s' "$OUT/run.log" | sed 's/^\[[^]]*\] *//' | tail -n 40
awk 'BEGIN { m = 0 } $2 > m { m = $2 } END { printf "peak_vram_bytes %d (%.2f GiB)\n", m, m / 1073741824 }' "$OUT/gpu.tsv" |
	tee -a "$OUT/run.log"
