#!/bin/sh
# The output check on the generated images (AI-A1, devil C73).
#
# The check runs in the AI service, between the answer of the engine and the
# upload of the bridge: in-process, Node, CPU, the model on the disk. This
# script measures the candidates in exactly that shape.
#
# The steps:
#
#   sets    the three sets of images: the fifty pictures of the engine, the
#           two PNGs of the image spike, the three hundred photos of COCO
#   gen     the fifty pictures, made by the engine of the product (one call
#           at a time, on the network of ai-dev)
#   stage   the models of the volume in the layout of transformers.js
#   bench   the measurement, for the two ONNX files of every model
#
# The guard of the spike runs before every step: a measurement only counts
# when nothing else of the spike measures. The bench holds the slot from the
# first run to the last: it waits for the manifest, and the preparation (the
# second model, the layout, the manifest) runs while it waits.
#
# usage: sh nsfw.sh <step>
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
VOL='osionos_ai_a1_data'
STEP="${1:-bench}"
IMAGE="node:22-bookworm-slim@sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09"
MODELS='/mnt/storage/nsfw/models'
RESULTS="$HERE/results/safety"

# The captions of COCO val 2017, the file of the guard spike.
CAPTIONS='/mnt/storage/sets/coco_captions.json'
IMAGES='http://images.cocodataset.org/val2017'

# The models: the id of transformers.js, the file of ONNX, the dtype.
MODELS_LIST='AdamCodd/vit-base-nsfw-detector model.onnx fp32
AdamCodd/vit-base-nsfw-detector model_quantized.onnx q8
onnx-community/nsfw_image_detection-ONNX model.onnx fp32
onnx-community/nsfw_image_detection-ONNX model_quantized.onnx q8'

case "$STEP" in
sets)
	sh "$HERE/guard.sh" "nsfw sets"
	timeout 3600 docker run --rm --name ai-a1-nsfw-sets \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim \
		python3 /spike/nsfw-sets.py \
		--captions "$CAPTIONS" --dest /mnt/storage/nsfw --images "$IMAGES" \
		--a1 /spike/results/imagegen
	;;
gen)
	sh "$HERE/guard.sh" "nsfw gen"
	mkdir -p "$RESULTS/nsfw-gen"
	timeout 3600 docker run --rm --name ai-a1-nsfw-gen --network ai-dev-net \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		"$IMAGE" \
		node /spike/nsfw-gen.mjs \
		--set /mnt/storage/nsfw/sets/gen.tsv --out /mnt/storage/nsfw/gen \
		--manifest /mnt/storage/nsfw/sets/gen-files.tsv \
		--base http://ai-dev-sd:1234 2>&1 | tee "$RESULTS/nsfw-gen/run.log"
	;;
stage)
	sh "$HERE/guard.sh" "nsfw stage"
	# The layout of transformers.js: the id of the model is a directory, and
	# the preprocessor of the ONNX folder is the one of the root.
	timeout 600 docker run --rm --name ai-a1-nsfw-stage -v "$VOL:/mnt/storage" \
		python:3.12-slim sh -c '
set -e
A=/mnt/storage/nsfw/models/AdamCodd/vit-base-nsfw-detector
B=/mnt/storage/nsfw/models/onnx-community/nsfw_image_detection-ONNX
mkdir -p $A/onnx $B/onnx
cp /mnt/storage/nsfw/config.json $A/config.json
cp /mnt/storage/nsfw/onnx/preprocessor_config.json $A/preprocessor_config.json
cp /mnt/storage/nsfw/onnx/config.json $A/onnx/config.json
cp /mnt/storage/nsfw/onnx/preprocessor_config.json $A/onnx/preprocessor_config.json
cp /mnt/storage/nsfw/onnx/model.onnx $A/onnx/model.onnx
cp /mnt/storage/nsfw/onnx/model_quantized.onnx $A/onnx/model_quantized.onnx
cp /mnt/storage/nsfw2/config.json $B/config.json
cp /mnt/storage/nsfw2/preprocessor_config.json $B/preprocessor_config.json
cp /mnt/storage/nsfw2/onnx/model.onnx $B/onnx/model.onnx
cp /mnt/storage/nsfw2/onnx/model_quantized.onnx $B/onnx/model_quantized.onnx
ls -la $A/onnx $B/onnx'
	;;
bench)
	sh "$HERE/guard.sh" "nsfw bench"
	# The name of the flag that tells the bench the manifest is ready. It
	# carries the second run apart from the first.
	READY="/mnt/storage/nsfw/manifest.ready.$$"
	# The bench waits for the manifest, and it holds the slot of the spike
	# from its start to its end: the runs of the four files follow each other
	# without a gap.
	timeout 3600 docker run --rm --name ai-a1-nsfw-bench --network none \
		-e READY="$READY" \
		-v "$VOL:/mnt/storage:ro" -v "$RESULTS:/results" \
		"$IMAGE" sh -c '
while [ ! -f "$READY" ]; do sleep 2; done
set -e
for PAIR in "AdamCodd/vit-base-nsfw-detector model.onnx fp32" \
            "AdamCodd/vit-base-nsfw-detector model_quantized.onnx q8" \
            "onnx-community/nsfw_image_detection-ONNX model.onnx fp32" \
            "onnx-community/nsfw_image_detection-ONNX model_quantized.onnx q8"; do
	set -- $PAIR
	ID=$1
	FILE=$2
	DTYPE=$3
	case "$ID" in
	onnx-community/*) OUT=/results/nsfw-falconsai-$FILE ;;
	*) OUT=/results/nsfw-$FILE ;;
	esac
	mkdir -p $OUT
	{
		echo "# the output check on the generated images, the model $ID, the file $FILE"
		echo "host_uptime $(cat /proc/uptime)"
		echo "host_loadavg $(cat /proc/loadavg)"
		echo
		echo "model $ID"
		echo "dtype $DTYPE"
		echo "sets /mnt/storage/nsfw"
		echo
	} > $OUT/run.log
	node /mnt/storage/nsfw/bench/nsfw-bench.mjs \
		--models /mnt/storage/nsfw/models --model $ID --dtype $DTYPE \
		--manifest /mnt/storage/nsfw/manifest.tsv --out $OUT/scores.tsv \
		--label $FILE >> $OUT/run.log 2>&1
done' &
	BENCH=$!
	# The preparation, while the bench waits: the second model (the network),
	# the layout of the models, the manifest of the images.
	timeout 1800 docker run --rm --name ai-a1-nsfw-prep \
		-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
		python:3.12-slim sh -c '
set -e
python3 /spike/fetch.py --lock /spike/models.lock --dest /mnt/storage --only nsfw2
cp /spike/nsfw/nsfw-bench.mjs /mnt/storage/nsfw/bench/nsfw-bench.mjs
A=/mnt/storage/nsfw/models/AdamCodd/vit-base-nsfw-detector
B=/mnt/storage/nsfw/models/onnx-community/nsfw_image_detection-ONNX
mkdir -p $A/onnx $B/onnx
cp /mnt/storage/nsfw/config.json $A/config.json
cp /mnt/storage/nsfw/onnx/preprocessor_config.json $A/preprocessor_config.json
cp /mnt/storage/nsfw/onnx/config.json $A/onnx/config.json
cp /mnt/storage/nsfw/onnx/preprocessor_config.json $A/onnx/preprocessor_config.json
cp /mnt/storage/nsfw/onnx/model.onnx $A/onnx/model.onnx
cp /mnt/storage/nsfw/onnx/model_quantized.onnx $A/onnx/model_quantized.onnx
cp /mnt/storage/nsfw2/config.json $B/config.json
cp /mnt/storage/nsfw2/preprocessor_config.json $B/preprocessor_config.json
cp /mnt/storage/nsfw2/onnx/model.onnx $B/onnx/model.onnx
cp /mnt/storage/nsfw2/onnx/model_quantized.onnx $B/onnx/model_quantized.onnx
python3 /spike/nsfw-sets.py --captions /mnt/storage/sets/coco_captions.json \
	--dest /mnt/storage/nsfw --images http://images.cocodataset.org/val2017 \
	--a1 /spike/results/imagegen
touch '"$READY"
	wait "$BENCH"
	;;
summaries)
	sh "$HERE/guard.sh" "nsfw summaries"
	# The summary of the scores: the distribution, the false positives and the
	# five highest of every set. The log is written by the container itself:
	# the files of the run belong to it.
	for OUT in "$RESULTS/nsfw-model.onnx" "$RESULTS/nsfw-model_quantized.onnx" \
		"$RESULTS/nsfw-falconsai-model.onnx" "$RESULTS/nsfw-falconsai-model_quantized.onnx"; do
		[ -f "$OUT/scores.tsv" ] || continue
		timeout 600 docker run --rm --name ai-a1-nsfw-summary \
			-e LABEL="$(basename "$OUT")" \
			-v "$OUT:/out" -v "$HERE:/spike:ro" \
			python:3.12-slim \
			sh -c "python3 /spike/nsfw-summarize.py --scores /out/scores.tsv \
				--label \$LABEL >> /out/run.log 2>&1; echo >> /out/run.log"
	done
	# The check fails closed: the model file is not there. The time to the
	# error is the time the service waits before it can refuse.
	OUT="$RESULTS/nsfw-model.onnx"
	timeout 600 docker run --rm --name ai-a1-nsfw-failclosed --network none \
		-v "$VOL:/mnt/storage:ro" -v "$OUT:/out" \
		"$IMAGE" sh -c '
{
echo "# the model file is missing: the check fails closed"
node /mnt/storage/nsfw/bench/nsfw-bench.mjs --models /mnt/storage/nsfw/nothing \
	--model AdamCodd/vit-base-nsfw-detector --dtype fp32 \
	--manifest /mnt/storage/nsfw/manifest.tsv --out /dev/null --fail-closed 2>&1
echo
echo "host_uptime $(cat /proc/uptime)"
echo "host_loadavg $(cat /proc/loadavg)"
} >> /out/run.log'
	;;
*)
	echo "usage: sh nsfw.sh sets|gen|stage|bench|summaries" >&2
	exit 2
	;;
esac
