#!/bin/sh
# Part A of the GPU spike (AI-P0d): the LLM, one configuration at a time.
#
# Every configuration starts its own container (ai-gpu-llm-*), waits for the
# model, checks the VRAM against the rule of the brief (7.4 GiB total: the
# desktop shares this GPU), runs the benchmark at every arrival rate, and
# stops the container.
#
# The results are appended to results/part-a.jsonl, one line per run.
#
# usage: sh run-part-a.sh [config ...]
#        (no argument: every configuration)
set -eu
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH= cd -- "$SPIKE_DIR/../.." && pwd)
OUT_DIR="${OUT_DIR:-$SPIKE_DIR/results}"
mkdir -p "$OUT_DIR"
JSONL="$OUT_DIR/part-a.jsonl"

# The rule of the brief: the VRAM of the GPU never goes above 7.4 GiB.
VRAM_LIMIT=7946554000
# What the container of the server takes (the model, the buffers of Vulkan and
# the pool of the KV cache): 2.9 to 3.1 GB in the runs of this spike.
CONTAINER_VRAM=3070000000
# The room that must be free on the card before the container starts, with a
# margin for the growth of the KV cache during the run.
VRAM_ROOM=$(( VRAM_LIMIT - CONTAINER_VRAM - 150000000 ))
# The arrival rates of the brief, and the length of every window.
LAMBDAS="${LAMBDAS:-0.25 0.5 1 2}"
# The length of the window of a run. The configuration decides it (the CPU one
# gets the long window of the brief, 120 s; the GPU ones the short one, 60 s),
# but the caller may fix it.
DURATION="${DURATION:-}"
PORT="${PORT:-18080}"
MODEL_PATH=/models/models--unsloth--Qwen3-4B-Instruct-2507-GGUF/snapshots/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf

vram_used() { cat /sys/class/drm/card1/device/mem_info_vram_used; }
loadavg() { cut -d' ' -f1 /proc/loadavg; }

# The wait of the brief: a measurement waits for a quiet CPU.
# The load average is polled every 60 s, for at most 15 minutes, and the
# value that opened the configuration is written next to the numbers.
wait_for_quiet_cpu() {
	deadline=$(( $(date +%s) + ${1:-900} ))
	while :; do
		load=$(loadavg)
		if awk "BEGIN{exit !($load < 6)}"; then
			echo "[part-a] the load average is $load, the measurement starts"
			return 0
		fi
		if [ "$(date +%s)" -ge "$deadline" ]; then
			echo "[part-a] the load average stayed at $load after 15 minutes; the measurement goes on anyway" >&2
			return 0
		fi
		echo "[part-a] the load average is $load, waiting for a quiet CPU"
		sleep 60
	done
}

# run_bench <container> <lambda> <label> [extra env...]
run_bench() {
	lambda="$1"
	label="$2"
	shift 2
	stem="$OUT_DIR/$label"
	# The load average that opened the configuration, next to the numbers.
	loadavg > "$stem.loadavg"
	sh "$SPIKE_DIR/gpu-sampler.sh" "$stem.sample" "$((DURATION + 20))" &
	SAMPLER_PID=$!
	sleep 1
	docker run --rm --network host \
		-v "$SERVICE_DIR:/s" -v "$OUT_DIR:/out" -w /s \
		-e "LLM_URL=http://127.0.0.1:$PORT" \
		-e "LAMBDA=$lambda" -e "DURATION=$DURATION" -e "LABEL=$label" \
		-e "DRAIN_MS=${DRAIN_MS:-45000}" \
		-e "RANDOMIZE_PREFIX=${RANDOMIZE_PREFIX:-0}" \
		-e "OUT=/out/$label.json" \
		"$@" \
		node:22-bookworm-slim node spikes/gpu/llm-bench-gpu.mjs
	kill "$SAMPLER_PID" 2>/dev/null || true
	wait "$SAMPLER_PID" 2>/dev/null || true
	SAMPLER_PID=""
	docker run --rm --network host -v "$SPIKE_DIR:/s" -v "$OUT_DIR:/out" -w /out node:22-bookworm-slim \
		node /s/summarize.mjs "/out/$label.json" "/out/$label.sample" "$label" "/out/$label.loadavg" >> "$JSONL"
	rm -f "$stem.sample" "$stem.loadavg"
}

# wait_for_vram_room: the desktop of the user shares the card, and its use
# moves. The container of the server needs about 3.1 GB, so the run waits for
# the room, for at most 15 minutes. When the room does not come, the check
# after the load decides: the configuration is recorded as "does not fit".
wait_for_vram_room() {
	deadline=$(( $(date +%s) + ${1:-600} ))
	while :; do
		used=$(vram_used)
		if [ "$used" -le "$VRAM_ROOM" ]; then
			echo "[part-a] the VRAM of the card is $used, the room is there"
			return 0
		fi
		if [ "$(date +%s)" -ge "$deadline" ]; then
			echo "[part-a] the VRAM of the card stayed at $used for 10 minutes" >&2
			return 1
		fi
		echo "[part-a] the VRAM of the card is $used, waiting for room (room wanted: $VRAM_ROOM)"
		sleep 30
	done
}

# start_server <container> <image> <flags...>: the container, and the wait for
# the model. The VRAM it takes is printed.
start_server() {
	container="$1"
	image="$2"
	shift 2
	docker rm -f "$container" >/dev/null 2>&1 || true
	wait_for_vram_room || true
	before=$(vram_used)
	echo "[part-a] $container: the VRAM before the container is $before"
	docker run -d --name "$container" \
		$device \
		-v osionos_ai_models_llm:/models:ro \
		-p "127.0.0.1:$port:8080" \
		"$image" \
		-m "$MODEL_PATH" --alias qwen3-4b --host 0.0.0.0 --port 8080 --jinja --metrics \
		"$@" >/dev/null
	waited=0
	until curl -sS -m 5 "http://127.0.0.1:$port/v1/models" 2>/dev/null | grep -q '"id"'; do
		waited=$((waited + 1))
		if [ "$waited" -gt 180 ]; then
			echo "[part-a] $container: the server never became ready" >&2
			docker logs "$container" 2>&1 | tail -20 >&2
			docker rm -f "$container" >/dev/null 2>&1 || true
			return 1
		fi
		sleep 1
	done
	after=$(vram_used)
	echo "[part-a] $container: the VRAM after the load is $after (delta $((after - before)))"
	if [ "$after" -gt "$VRAM_LIMIT" ]; then
		echo "[part-a] $container: DOES NOT FIT: $after > $VRAM_LIMIT"
		printf '{"label":"%s","fits":false,"vramAfter":%s,"vramLimit":%s}\n' \
			"$container" "$after" "$VRAM_LIMIT" >> "$JSONL"
		docker rm -f "$container" >/dev/null 2>&1 || true
		return 2
	fi
	return 0
}

# run_config <name> <image> <extra server flags...>
run_config() {
	name="$1"
	image="$2"
	shift 2
	container="ai-gpu-llm-$name"
	port="$PORT"

	# Nothing of this run may survive it: the sampler and the container of the
	# server go away even when the run is interrupted.
	SAMPLER_PID=""
	cleanup() {
		if [ -n "$SAMPLER_PID" ]; then
			kill "$SAMPLER_PID" 2>/dev/null || true
			wait "$SAMPLER_PID" 2>/dev/null || true
		fi
		docker rm -f "$container" >/dev/null 2>&1 || true
	}
	trap cleanup EXIT INT TERM

	# The GPU device is only given to the Vulkan build.
	if [ "$image" = "$CPU" ]; then
		CPU_WAIT=900
		device=""
	else
		CPU_WAIT=900
		device="--device /dev/dri --group-add 993"
	fi

	# Every arrival rate gets a fresh server: a server that could not keep up
	# with the previous rate would carry its backlog into the next one.
	for lambda in $LAMBDAS; do
		# The guard: no client of the benchmark may run, and the port of the
		# server must be free, before a configuration is measured. The first
		# run of this spike was contaminated by two client containers of the
		# benchmark that were still running.
		sh "$SPIKE_DIR/guard.sh" "part-a ($name, lambda=$lambda)" "$port" || exit 1
		# Run in a subshell with errexit active; only status 2 is a capacity skip.
		server_status=0
		( set -e; start_server "$container" "$image" "$@" ) &
		server_pid=$!
		wait "$server_pid" || server_status=$?
		case "$server_status" in
			0) ;;
			2) return 0 ;;
			*) exit "$server_status" ;;
		esac
		wait_for_quiet_cpu "${CPU_WAIT}"
		run_bench "$lambda" "${name}-lambda-$lambda"
		docker logs "$container" > "$OUT_DIR/${name}-lambda-$lambda.server.txt" 2>&1 || true
		docker rm -f "$container" >/dev/null 2>&1 || true
	done
	return 0
}

# ---------------------------------------------------------------- the configurations
# The lines are: name | image | server flags | RANDOMIZE_PREFIX | lambdas
# The pool of the KV cache is sized by the VRAM rule: the desktop holds about
# 4.5 GiB of the 8 GiB of the card, so the container may hold about 2.8 GiB.
# The model alone is 2.33 GiB, and a request of the service needs 2612 tokens
# of KV (2312 of prompt and 300 of answer).
#   f16 KV: 144 KiB per token   q8_0: 72 KiB   q4_0: 36 KiB
#   4 slots of 2612 tokens: f16 1.44 GiB (does not fit), q8_0 0.72 GiB (does
#   not fit either), q4_0 0.36 GiB (fits).
VULKAN=ghcr.io/ggml-org/llama.cpp:server-vulkan-b11580
CPU=ghcr.io/ggml-org/llama.cpp:server-b11580

all_configs() {
	cat <<CONFIGS
1-cpu-np4|$CPU|-t 8 -np 4 -c 11264|0|
2-vk-np1-f16|$VULKAN|-t 4 -ngl 99 -np 1 -c 2816 -fa on|0|
3-vk-np4-cont-q4|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0|0|
4-vk-np4-static-q4|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0 --no-cont-batching|0|
5-vk-np8-cont-q4|$VULKAN|-t 4 -ngl 99 -np 8 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0|0|
6-vk-np4-cont-q8|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 10448 -fa on -ctk q8_0 -ctv q8_0|0|
6b-vk-np4-cont-q8-c8192|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 8192 -fa on -ctk q8_0 -ctv q8_0|0|0.25 0.5
7a-vk-np4-cache-defeated|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0|1|
7b-vk-np4-cache-reuse256|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0 --cache-reuse 256|0|
7c-vk-np4-slot-similarity|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0 --slot-prompt-similarity 0.5|0|
8-vk-np4-spec-ngram|$VULKAN|-t 4 -ngl 99 -np 4 --kv-unified -c 11264 -fa on -ctk q4_0 -ctv q4_0 --spec-type ngram-simple|0|
CONFIGS
}

WANTED="$*"
if [ -z "$WANTED" ]; then
	WANTED=$(all_configs | cut -d'|' -f1 | tr '\n' ' ')
fi

all_configs | while IFS= read -r entry; do
	name=$(echo "$entry" | cut -d'|' -f1)
	image=$(echo "$entry" | cut -d'|' -f2)
	flags=$(echo "$entry" | cut -d'|' -f3)
	randomize=$(echo "$entry" | cut -d'|' -f4)
	lambdas=$(echo "$entry" | cut -d'|' -f5)
	[ -n "$lambdas" ] || lambdas="$LAMBDAS"
	case " $WANTED " in
	*" $name "*) ;;
	*) continue ;;
	esac
	echo "[part-a] === $name ==="
	RANDOMIZE_PREFIX="$randomize" LAMBDAS="$lambdas" export RANDOMIZE_PREFIX LAMBDAS
	# The CPU configuration is the slow one: it gets the long window of the
	# brief (120 s), the GPU ones the short one (60 s). The caller may fix
	# the length itself.
	if [ -n "${DURATION:-}" ]; then
		:
	elif [ "$image" = "$CPU" ]; then
		DURATION=120
	else
		DURATION=60
	fi
	export DURATION
	# shellcheck disable=SC2086
	run_config "$name" "$image" $flags
done
echo "[part-a] the results are in $JSONL"
