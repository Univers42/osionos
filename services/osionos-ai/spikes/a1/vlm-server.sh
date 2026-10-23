#!/bin/sh
# The server of the vision spike (AI-A1): llama-server keeps the VLM loaded,
# and the client asks it about every picture of the set, one after the other.
#
# The server runs the way it will run in the product: the model and its
# projector are on the disk of the volume, the container has no way out of the
# network of the spike (the network is created with --internal, so there is no
# egress), and the client reaches it through that network, by its name.
#
# `docker run` hangs on this host (the stream of the output never closes), so
# every container of the spike is created and started by hand and waited for.
#
# The log of the run holds the load average of the host and the memory of the
# container, before and after the run; the sampler of the memory runs during
# the whole run, so that the peak of the RSS is a number and not a guess.
#
# The containers of a run carry the name of the run, so that the trap of a run
# that is killed never touches the containers of the run that follows it.
#
# usage: sh vlm-server.sh <label> <model-gguf> <mmproj-gguf> <alias> [cpu|vulkan]
#
# Env: SETS (the pictures, default /mnt/storage/vlm/coco768),
#      RUN (the answers, default /mnt/storage/out/vlm/<label>.jsonl),
#      LIMIT (the number of pictures, default 300),
#      MODE (json_schema or grammar, default json_schema),
#      MAXTOKENS (default 320).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
LABEL="$1"
MODEL="$2"
MMPROJ="$3"
ALIAS="$4"
DEVICE="${5:-cpu}"

VOL='osionos_ai_a1_data'
NET='ai-a1-vlm-net'
PORT=8080
SERVER="ai-a1-vlm-server-$LABEL"
CLIENT="ai-a1-vlm-client-$LABEL"
PROBE="ai-a1-vlm-probe-$LABEL"
OUT="$HERE/results/vlm/$LABEL"
SETS="${SETS:-/mnt/storage/vlm/coco768}"
RUN="${RUN:-/mnt/storage/out/vlm/$LABEL.jsonl}"
LIMIT="${LIMIT:-300}"
MODE="${MODE:-json_schema}"
MAXTOKENS="${MAXTOKENS:-640}"
IMAGE_CPU='ghcr.io/ggml-org/llama.cpp@sha256:ba384e66b3f3b6474dc0285ed44466b6f025c7106865d915f1fe5ae2a2da7411'
IMAGE_VULKAN='ghcr.io/ggml-org/llama.cpp@sha256:b7204e52c07de71ce75059b710b8a8573f8026ffeef72936c27132f7bbd33d5a'

if [ "$DEVICE" = 'vulkan' ]; then
	IMAGE="$IMAGE_VULKAN"
	GPU_ARGS='--device /dev/dri --device /dev/dri/renderD128 -e GGML_VK_VISIBLE_DEVICES=0'
else
	IMAGE="$IMAGE_CPU"
	GPU_ARGS=''
fi

mkdir -p "$OUT"
LOG="$OUT/run.log"
STATS="$OUT/stats.tsv"
VRAM="$OUT/vram.tsv"
: > "$STATS"

cleanup() {
	docker rm -f "$CLIENT" >/dev/null 2>&1 || true
	docker rm -f "$SERVER" >/dev/null 2>&1 || true
	docker rm -f "$PROBE" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# The slot of the spike: no other container of the spike runs, and the port of
# the server is free. The other agents of the host measure too, so the wait can
# be long.
waited=0
while ! sh "$HERE/guard.sh" "vlm $LABEL" "$PORT" >/dev/null 2>&1; do
	waited=$((waited + 1))
	if [ "$waited" -gt 3600 ]; then
		echo "the slot never came for vlm $LABEL" >&2
		exit 1
	fi
	if [ $((waited % 6)) -eq 0 ]; then
		echo "[vlm $LABEL] the slot is taken, waiting ($((waited * 10)) s)"
		uptime
	fi
	sleep 10
done

{
	echo
	echo "# the vision spike, the model $LABEL on the $DEVICE, $(date -Is)"
	uptime
	echo
	echo "model $MODEL"
	echo "mmproj $MMPROJ"
	echo "engine llama-server --jinja -c 4096 -np 1 -t 6 --mmproj <mmproj> -m <model>"
	echo "image $IMAGE"
	echo "network $NET (internal, no egress)"
	echo "memory 7g, cpus 6"
	echo "set $SETS, limit $LIMIT, mode $MODE, max_tokens $MAXTOKENS"
	echo
} >> "$LOG"

# The network of the spike: internal, so that nothing in it goes out.
docker network inspect "$NET" >/dev/null 2>&1 || docker network create --internal "$NET" >/dev/null

# The address of the server on the network of the spike: the client asks it by
# its address and not by its name, because the resolver of the host answers the
# names it does not know with the DNS of Tor, and that one is slow. The address
# is fixed when the container is made, so that a server that is killed and
# started again keeps it.
SUBNET=$(timeout 60 docker network inspect "$NET" --format '{{(index .IPAM.Config 0).Subnet}}')
GATEWAY=$(timeout 60 docker network inspect "$NET" --format '{{(index .IPAM.Config 0).Gateway}}')
SERVER_IP=$(python3 -c "
import ipaddress
print(ipaddress.ip_address(int(ipaddress.ip_address('$GATEWAY')) + 1))
")

# The server.
STARTED=$(date +%s)
# A container of a run that was cut (a reboot of the host) is still there: it
# goes before the new one.
docker rm -f "$SERVER" >/dev/null 2>&1 || true
# shellcheck disable=SC2086
docker create --name "$SERVER" --network "$NET" --network-alias vlm --ip "$SERVER_IP" \
	--memory 7g --memory-swap 7g --cpus 6 \
	$GPU_ARGS \
	-v "$VOL:/mnt/storage:ro" \
	"$IMAGE" \
	--jinja -c 4096 -np 1 -t 6 \
	--mmproj "$MMPROJ" -m "$MODEL" \
	--host 0.0.0.0 --port "$PORT" --alias "$ALIAS" >/dev/null
docker start "$SERVER" >/dev/null

# Ready = the health route answers. The probe is a container, so the time is
# +-1.5 s.
READY=''
for _ in $(seq 1 600); do
	docker rm -f "$PROBE" >/dev/null 2>&1 || true
	docker create --name "$PROBE" --network "$NET" python:3.12-slim \
		python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://$SERVER_IP:$PORT/health', timeout=5).status == 200 else 1)" >/dev/null 2>&1
	timeout 120 docker start "$PROBE" >/dev/null 2>&1
	timeout 120 docker wait "$PROBE" >/dev/null 2>&1
	RC=$(timeout 60 docker inspect --format '{{.State.ExitCode}}' "$PROBE" 2>/dev/null || echo 1)
	docker rm -f "$PROBE" >/dev/null 2>&1 || true
	if [ "$RC" = "0" ]; then
		READY=$(date +%s)
		break
	fi
	sleep 2
done
if [ -z "$READY" ]; then
	timeout 60 docker logs "$SERVER" 2>&1 | tail -40 >> "$LOG"
	echo "the server of $LABEL never answered" >&2
	exit 1
fi

{
	echo "server_ready_s $((READY - STARTED))"
	echo "server_address $SERVER_IP:$PORT"
	echo
	timeout 60 docker logs "$SERVER" 2>&1 | head -20
	echo
	uptime
	echo
	docker stats --no-stream "$SERVER" 2>&1
	echo
} >> "$LOG"

# The sampler of the memory of the container, for the whole run.
echo "running" > "$OUT/.sampling"
(
	while [ -f "$OUT/.sampling" ]; do
		timeout 30 docker stats --no-stream --format '{{.MemUsage}} {{.CPUPerc}}' "$SERVER" >> "$STATS" 2>/dev/null || true
		sleep 5
	done
) &
SAMPLER=$!

# The watchdog: the host is short of memory and the kernel can kill the server
# of the spike. The client asks again the pictures whose call failed, so the
# server is started again for as long as the client runs.
(
	while [ -f "$OUT/.sampling" ]; do
		RUNNING=$(timeout 60 docker inspect --format '{{.State.Running}}' "$SERVER" 2>/dev/null || echo false)
		if [ "$RUNNING" != "true" ]; then
			echo "server_restart $(date -Is)" >> "$LOG"
			timeout 120 docker start "$SERVER" >/dev/null 2>&1 || true
			sleep 20
		fi
		sleep 10
	done
) &
WATCHDOG=$!

# The sampler of the VRAM, for the GPU runs.
if [ "$DEVICE" = 'vulkan' ]; then
	: > "$VRAM"
	(
		while [ -f "$OUT/.sampling" ]; do
			printf '%s %s\n' "$(date +%s.%N)" \
				"$(cat /sys/class/drm/card1/device/mem_info_vram_used)" >> "$VRAM"
			sleep 0.2
		done
	) &
	VSAMPLER=$!
fi

# The client: the pictures of the set, one after the other.
CLIENT_START=$(date +%s)
docker create --name "$CLIENT" --network "$NET" \
	-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
	python:3.12-slim python3 /spike/vlm-client.py \
	--base "http://$SERVER_IP:$PORT" --model "$ALIAS" \
	--set "$SETS/manifest.json" --images "$SETS" \
	--out "$RUN" \
	--prompt /spike/vlm-prompt.txt \
	--schema /spike/vlm-schema.json \
	--mode "$MODE" --limit "$LIMIT" --max-tokens "$MAXTOKENS" >/dev/null
docker start "$CLIENT" >/dev/null
timeout 7200 docker wait "$CLIENT" >/dev/null
CLIENT_END=$(date +%s)

echo "stop" > "$OUT/.sampling"
sleep 1
rm -f "$OUT/.sampling"
wait "$SAMPLER" 2>/dev/null || true
wait "$WATCHDOG" 2>/dev/null || true
if [ "$DEVICE" = 'vulkan' ]; then
	wait "$VSAMPLER" 2>/dev/null || true
fi

{
	echo
	echo "== the client"
	timeout 60 docker logs "$CLIENT" 2>&1 | tail -20
	echo
	echo "client_wall_s $((CLIENT_END - CLIENT_START))"
	uptime
	echo
	docker stats --no-stream "$SERVER" 2>&1
	echo
} >> "$LOG"

docker rm -f "$CLIENT" >/dev/null 2>&1 || true

echo "the run of $LABEL is in $RUN"
