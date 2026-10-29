#!/bin/sh
# The driver of the vision spike (AI-A1): the set of pictures, the runs of the
# models, and the summary of every run.
#
# The steps are run one after the other, and never two at once: the host is
# shared with the other agents of the machine, and a measurement of the spike
# must not run beside another one. Every step waits for the slot of the spike
# first (guard.sh).
#
# `docker run` hangs on this host (the stream of its output never closes), so
# every container of the spike is created and started by hand, and waited for.
#
# usage: sh vlm.sh sets
#        sh vlm.sh run <label> <model-gguf> <mmproj-gguf> <alias> [cpu|vulkan]
#        sh vlm.sh summary <label>
#        sh vlm.sh vram
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
VOL='osionos_ai_a1_data'
IMAGES='http://images.cocodataset.org/val2017'
ANNOTATIONS='http://images.cocodataset.org/annotations/annotations_trainval2017.zip'
COCO="${COCO:-/mnt/storage/vlm/coco300}"
SMALL="${SMALL:-/mnt/storage/vlm/coco768}"
LOGS="$HERE/results/vlm/logs"
ME="$(id -u):$(id -g)"

# A container of the spike: created, started, waited for. Its output is in the
# log of the step, and the log belongs to the user of the host. A container
# that writes in the repository is started with `--user`, so that the file it
# writes belongs to the user too.
container() {
	# container <name> <logfile> <image> <args>...
	NAME="$1"
	shift
	LOGFILE="$1"
	shift
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	docker create --name "$NAME" "$@" >/dev/null
	docker start "$NAME" >/dev/null
	timeout 3600 docker wait "$NAME" >/dev/null
	RC=$(timeout 60 docker inspect --format '{{.State.ExitCode}}' "$NAME" 2>/dev/null || echo 1)
	timeout 60 docker logs "$NAME" > "$LOGFILE" 2>&1 || true
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	cat "$LOGFILE"
	if [ "$RC" != "0" ]; then
		echo "the container $NAME exited with $RC" >&2
		exit 1
	fi
}

case "${1:-}" in
sets)
	mkdir -p "$HERE/results/vlm" "$LOGS"

	echo "== the annotations and the pictures of COCO"
	container ai-a1-vlm-coco "$LOGS/fetch-coco.log" \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim python3 /spike/fetch-coco.py \
		--zip "$ANNOTATIONS" --entry annotations/instances_val2017.json \
		--images "$IMAGES" --dest "$COCO" \
		--count 300 --seed 42 --with-categories

	echo
	echo "== the captions of COCO (the twenty pictures that hold text)"
	container ai-a1-vlm-caps "$LOGS/fetch-captions.log" \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim python3 /spike/fetch-coco-captions.py \
		--zip "$ANNOTATIONS" --entry annotations/captions_val2017.json \
		--dest "$COCO/captions_val2017.json"

	echo
	echo "== the pictures, shrunk to 768 px"
	container ai-a1-vlm-sets "$LOGS/sets.log" \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim sh -c \
		"pip install --no-cache-dir pillow >/dev/null 2>&1 && python3 /spike/vlm-sets.py --manifest $COCO/coco300.json --captions $COCO/captions_val2017.json --in $COCO --out $SMALL --limit 300"
	;;

run)
	LABEL="$2"
	MODEL="$3"
	MMPROJ="$4"
	ALIAS="$5"
	DEVICE="${6:-cpu}"
	sh "$HERE/vlm-server.sh" "$LABEL" "$MODEL" "$MMPROJ" "$ALIAS" "$DEVICE"

	# The answers of the run, in the repository: the ids, the predictions and
	# the timings, and not one byte of picture.
	mkdir -p "$HERE/results/vlm"
	container ai-a1-vlm-collect "$LOGS/collect-$LABEL.log" \
		--user "$ME" \
		-v "$VOL:/mnt/storage:ro" -v "$HERE/results/vlm:/out" \
		alpine:3.20 sh -c "cp /mnt/storage/out/vlm/$LABEL.jsonl /out/run-$LABEL.jsonl && wc -l /out/run-$LABEL.jsonl"
	;;

summary)
	LABEL="$2"
	mkdir -p "$HERE/results/vlm" "$LOGS"
	container ai-a1-vlm-sum "$LOGS/summary-$LABEL.log" \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim python3 /spike/vlm-summarize.py \
		--run "/mnt/storage/out/vlm/$LABEL.jsonl" \
		--set "$SMALL/manifest.json" \
		--synonyms /spike/tag-synonyms.json \
		--label "$LABEL" \
		--stats "/spike/results/vlm/$LABEL/stats.tsv" \
		--vram "/spike/results/vlm/$LABEL/vram.tsv" \
		--out "/mnt/storage/out/vlm/$LABEL-summary.json"

	container ai-a1-vlm-sumcp "$LOGS/summarycp-$LABEL.log" \
		--user "$ME" \
		-v "$VOL:/mnt/storage:ro" -v "$HERE/results/vlm:/out" \
		alpine:3.20 sh -c "cp /mnt/storage/out/vlm/$LABEL-summary.json /out/summary-$LABEL.json"
	;;

vram)
	USED=$(cat /sys/class/drm/card1/device/mem_info_vram_used)
	TOTAL=$(cat /sys/class/drm/card1/device/mem_info_vram_total)
	echo "vram_used $USED"
	echo "vram_total $TOTAL"
	echo "vram_free $((TOTAL - USED))"
	;;

*)
	echo "usage: sh vlm.sh sets | run <label> <model> <mmproj> <alias> [cpu|vulkan] | summary <label> | vram" >&2
	exit 1
	;;
esac
