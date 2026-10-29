#!/bin/sh
# The server of the guard spike (AI-A1): llama-server keeps the guard model
# loaded, and the client asks it about the prompts of a set.
#
# The server has no network of its own (--network none) and no published port:
# the client containers join its network namespace (--network container:...), so
# the only way in is from inside.
#
# The verdicts of a run stay in the volume, and a run that was cut keeps them:
# the client asks again only the rows that have no verdict yet. So the script
# can be run again after a kill, and the numbers are the numbers of one run.
#
# usage: sh guard-server.sh <label> <gguf-in-the-volume> <alias> <run>...
#
#   <run> is <set>:<lang>:<limit>:<name>[:<input>]   one client, sequential
#     or par:<set>:<lang>:<count>:<name>[:<input>]  four clients, in parallel
#
# The sets are the TSV files of the volume (id of the row, prompt), the
# verdicts land in the volume too, and the script copies the verdicts of the
# model into results/safety/guard-<label>/. At the end the server is stopped
# and a call is made to the port that is not there any more: the time to the
# refusal is what a gate that fails closed has to answer in.
#
# Env: SETS (the directory of the sets, default /mnt/storage/sets),
#      VOLOUT (the directory of the verdicts, default /mnt/storage/out/<label>).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
LABEL="$1"
MODEL="$2"
ALIAS="$3"
shift 3

IMAGE='ghcr.io/ggml-org/llama.cpp@sha256:ba384e66b3f3b6474dc0285ed44466b6f025c7106865d915f1fe5ae2a2da7411'
VOL='osionos_ai_a1_data'
PORT=8080
SERVER='ai-a1-guard-server'
OUT="$HERE/results/safety/guard-$LABEL"
SETS="${SETS:-/mnt/storage/sets}"
VOLOUT="${VOLOUT:-/mnt/storage/out/$LABEL}"

# The guard refuses when another part of the spike measures: the wait is short,
# the other measurement ends.
for _ in $(seq 1 60); do
	if sh "$HERE/guard.sh" "guard $LABEL" "$PORT"; then
		break
	fi
	sleep 10
done

mkdir -p "$OUT"
LOG="$OUT/run.log"
NAMES="$OUT/.names"
: > "$NAMES"

cleanup() {
	docker rm -f "$SERVER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

{
	echo
	echo "# the guard of the image prompt, the model $LABEL, $(date -Is)"
	uptime
	echo
	echo "model $MODEL"
	echo "engine llama-server --jinja -c 4096 -np 4 -t 6"
	echo "image $IMAGE"
	echo "sets $SETS"
	echo
} >> "$LOG"

# The server, in its own network namespace.
STARTED=$(date +%s.%N)
docker run -d --name "$SERVER" --network none \
	-v "$VOL:/mnt/storage:ro" \
	"$IMAGE" \
	--jinja -c 4096 -np 4 -t 6 \
	-m "$MODEL" --host 0.0.0.0 --port "$PORT" --alias "$ALIAS" >/dev/null

# Ready = the health route answers. The probe is a container start, so the
# time is +-1.5 s.
READY=''
for _ in $(seq 1 600); do
	if docker run --rm --network "container:$SERVER" python:3.12-slim python3 -c \
		"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:$PORT/health', timeout=5).status == 200 else 1)" \
		>/dev/null 2>&1; then
		READY=$(date +%s.%N)
		break
	fi
	sleep 1
done
if [ -z "$READY" ]; then
	docker logs "$SERVER" 2>&1 | tail -30 >> "$LOG"
	echo 'the guard server never answered' >&2
	exit 1
fi

{
	echo "server_ready_s $(python3 -c "print(f'{$READY - $STARTED:.1f}')")"
	echo
	docker logs "$SERVER" 2>&1 | head -12
	echo
} >> "$LOG"

client() {
	# client <set> <lang> <limit> <name> <shard> <shards> <input>
	docker run --rm --network "container:$SERVER" \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim python3 /spike/guard-client.py \
		--base "http://127.0.0.1:$PORT" --model "$ALIAS" \
		--set "$1" --lang "$2" --in "$7" \
		--out "$VOLOUT/$4.tsv" --usage-out "$VOLOUT/usage.tsv" --raw-out "$VOLOUT/raw.tsv" \
		--limit "$3" --shard "$5" --shards "$6" \
		--max-tokens 32
}

# The fields of a run, one per line: the set, the language, the number of
# calls, the name of the file of the verdicts and the file of the prompts.
fields() {
	echo "$1" | tr ':' '\n'
}

for RUN in "$@"; do
	case "$RUN" in
	par:*)
		FIELDS=$(fields "${RUN#par:}")
		SET=$(echo "$FIELDS" | sed -n 1p)
		LANG_ID=$(echo "$FIELDS" | sed -n 2p)
		COUNT=$(echo "$FIELDS" | sed -n 3p)
		NAME=$(echo "$FIELDS" | sed -n 4p)
		INPUT=$(echo "$FIELDS" | sed -n 5p)
		[ -n "$INPUT" ] || INPUT="$SETS/$SET.tsv"
		echo "$NAME" >> "$NAMES"
		echo "== parallel: $SET $LANG_ID $COUNT calls, four clients, input $INPUT" >> "$LOG"
		PAR_START=$(date +%s.%N)
		PIDS=''
		for SHARD in 0 1 2 3; do
			client "$SET" "$LANG_ID" "$((COUNT / 4))" "$NAME" "$SHARD" 4 "$INPUT" &
			PIDS="$PIDS $!"
		done
		for PID in $PIDS; do
			wait "$PID" || true
		done
		PAR_END=$(date +%s.%N)
		echo "parallel_wall_s $(python3 -c "print(f'{$PAR_END - $PAR_START:.1f}')")" >> "$LOG"
		echo "parallel_calls_per_s $(python3 -c "print(f'{$COUNT / ($PAR_END - $PAR_START):.2f}')")" >> "$LOG"
		;;
	*)
		FIELDS=$(fields "$RUN")
		SET=$(echo "$FIELDS" | sed -n 1p)
		LANG_ID=$(echo "$FIELDS" | sed -n 2p)
		LIMIT=$(echo "$FIELDS" | sed -n 3p)
		NAME=$(echo "$FIELDS" | sed -n 4p)
		INPUT=$(echo "$FIELDS" | sed -n 5p)
		[ -n "$INPUT" ] || INPUT="$SETS/$SET.tsv"
		echo "$NAME" >> "$NAMES"
		echo "== sequential: $SET $LANG_ID $LIMIT calls, input $INPUT" >> "$LOG"
		client "$SET" "$LANG_ID" "$LIMIT" "$NAME" 0 1 "$INPUT"
		;;
	esac
	uptime >> "$LOG"
done

# The verdicts of the model, in the order of the runs, without the prompt text.
: > "$OUT/verdicts.tsv"
while read -r NAME; do
	docker run --rm -v "$VOL:/mnt/storage" -v "$OUT:/out" python:3.12-slim \
		sh -c "cat $VOLOUT/$NAME.tsv >> /out/verdicts.tsv" 2>/dev/null || true
done < "$NAMES"
rm -f "$NAMES"

# The gate fails closed: the server is gone, a call is refused. The time is
# what a request waits before the answer is "no".
docker rm -f "$SERVER" >/dev/null 2>&1 || true
sleep 1
{
	echo
	echo "== the server is down: one call to the port that is not there"
	docker run --rm --network none -v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim python3 /spike/guard-client.py \
		--base "http://127.0.0.1:$PORT" --model "$ALIAS" --set probe --lang en \
		--in "$SETS/probe.tsv" --out /dev/null --one-error
	echo
	uptime
	echo
	grep -c '' "$OUT/verdicts.tsv" | sed 's/^/verdict_rows /'
} >> "$LOG" 2>&1

echo "the verdicts of $LABEL are in $OUT/verdicts.tsv"
