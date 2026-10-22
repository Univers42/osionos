#!/bin/sh
# The warm half of the image spike: sd-server keeps the model loaded, and the
# AI SDK's openai-compatible imageModel() calls it (devil C71 wire proof). Also
# measures what a GPU swap costs (C75): the time from container start to the
# server answering, and the time an unload/reload takes.
#
# usage: sh imagegen-server.sh <label> <count> [extra sd-server args ...]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
LABEL="$1"
COUNT="$2"
shift 2

IMAGE='ghcr.io/leejet/stable-diffusion.cpp:master-vulkan@sha256:6d75b94d1d4222f9dd8a3b1494a5c8a6a31dc06976d9201dd83b7f9c32ffe343'
LLM='/llm/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/blobs/3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597'
OUT="$HERE/results/imagegen/$LABEL"
NET=ai-a1-sd-net

sh "$HERE/guard.sh" "imagegen-server $LABEL"
mkdir -p "$OUT"
: > "$OUT/run.log"

sh "$HERE/gpu-sampler.sh" "$OUT/gpu.tsv" 3600 &
SAMPLER=$!
cleanup() {
	kill "$SAMPLER" 2>/dev/null || true
	docker rm -f ai-a1-sd-server >/dev/null 2>&1 || true
	docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
sleep 1
echo "idle_vram_bytes $(cat /sys/class/drm/card1/device/mem_info_vram_used)" >> "$OUT/run.log"

# The default address pool is exhausted here (memory ai-dev-stack): a fixed /29.
docker network create --subnet 172.16.252.0/29 "$NET" >/dev/null
start=$(date +%s.%N)
docker run -d --name ai-a1-sd-server --network "$NET" \
	--device /dev/dri --group-add 993 --group-add 44 \
	-v osionos_sd_models:/models:ro -v osionos_ai_models_llm:/llm:ro \
	--entrypoint /sd-server "$IMAGE" \
	--listen-ip 0.0.0.0 --listen-port 1234 \
	--diffusion-model /models/z_image_turbo-Q4_0.gguf --llm "$LLM" --vae /models/ae-f16.gguf \
	--cfg-scale 1.0 --steps 8 -W 512 -H 512 "$@" >/dev/null

# Ready = the OpenAI models route answers. Caveat: sd-server may load lazily on
# the first request; then this time is the process start only and the first
# call carries the load — the per-call wall times below show which. Each probe
# is a container start (~0.5 s), so the ready time is ±1.5 s.
ready=''
for _ in $(seq 1 600); do
	if docker run --rm --network "$NET" --entrypoint node track-binocle/osionos-ai:ai-dev -e \
		"fetch('http://ai-a1-sd-server:1234/v1/models').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" \
		>/dev/null 2>&1; then
		ready=$(date +%s.%N)
		break
	fi
	sleep 1
done
[ -n "$ready" ] || { docker logs ai-a1-sd-server 2>&1 | tail -20; echo 'sd-server never answered'; exit 1; }
echo "server_ready_s $(echo "$ready - $start" | bc)" | tee -a "$OUT/run.log"

docker run --rm --network "$NET" -v "$HERE/imagegen-wire.mjs:/app/services/osionos-ai/imagegen-wire.mjs:ro" \
	--entrypoint node track-binocle/osionos-ai:ai-dev imagegen-wire.mjs http://ai-a1-sd-server:1234/v1 "$COUNT" |
	tee -a "$OUT/run.log"

docker logs ai-a1-sd-server > "$OUT/server.log" 2>&1
kill "$SAMPLER" 2>/dev/null || true
awk 'BEGIN { m = 0 } $2 > m { m = $2 } END { printf "peak_vram_bytes %d (%.2f GiB)\n", m, m / 1073741824 }' "$OUT/gpu.tsv" |
	tee -a "$OUT/run.log"
