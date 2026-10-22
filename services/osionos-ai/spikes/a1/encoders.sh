#!/bin/sh
# The measurement of the encoders of the spike AI-A1: the classifiers of
# toxicity, the classifiers of sentiment and the reranker, served by TEI on the
# CPU.
#
# One TEI container per model, with no network at all, and the model on the
# volume, read only. The client runs in the network namespace of the server,
# so that it reaches it and nothing else.
#
# Every model waits for the slot of the spike first (guard.sh): the host is
# shared with the other agents, and a measurement must not run beside another
# one.
#
# The scores of a model land in results/encoders/<model>/scores.tsv, the log
# of the run in results/encoders/<model>/run.log. A run that is cut keeps its
# scores: the next run asks again only the rows that have no score yet.
#
# usage: sh encoders.sh [toxicity|sentiment|rerank|all]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
VOL='osionos_ai_a1_data'
# The directory of the volume on the host: the model of a container is bound
# from it, and only the model is inside the container.
MOUNTPOINT=$(docker volume inspect -f '{{.Mountpoint}}' "$VOL")
IMAGE='ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4'
RESULTS="$HERE/results/encoders"
PYENV='/mnt/storage/pyenv'
WHAT="${1:-all}"

# The requirements of the bench, pinned: the same versions as the ones of the
# environment of the volume.
REQUIREMENTS="$HERE/encoders/requirements.txt"

# The slot of the spike: no other container of the spike runs.
wait_slot() {
	for _ in $(seq 1 1440); do
		if sh "$HERE/guard.sh" "$1" 8080 >/dev/null 2>&1; then
			return 0
		fi
		sleep 5
	done
	echo "the slot never came for $1" >&2
	return 1
}

# The environment of the bench: numpy, scipy, scikit-learn, pyarrow and the
# tokenizers, in the volume, so that the client needs no network at all.
env_ready() {
	timeout 120 docker run --rm -v "$VOL:/mnt/storage" python:3.12-slim \
		sh -c "test -d '$PYENV/numpy' -a -d '$PYENV/sklearn' -a -d '$PYENV/pyarrow'" 2>/dev/null
}

install_env() {
	echo "== the environment of the bench"
	timeout 1800 docker run --rm --name ai-a1-enc-pyenv -v "$VOL:/mnt/storage" \
		-v "$REQUIREMENTS:/req.txt:ro" python:3.12-slim \
		sh -c 'pip install --no-cache-dir --target /mnt/storage/pyenv -r /req.txt'
}

# The client of a model: the bench, in the namespace of the server.
client() {
	SLUG="$1"
	GROUP="$2"
	shift 2
	OUT="$RESULTS/$SLUG"
	timeout 3600 docker run --rm --network "container:ai-a1-enc-tei-$SLUG" \
		-v "$VOL:/mnt/storage:ro" -v "$HERE:/spike:ro" -v "$OUT:/out" \
		-e PYTHONPATH="$PYENV" \
		python:3.12-slim python3 /spike/encoders/encoders-bench.py "$@" \
		--model "$SLUG" --model-dir "/mnt/storage/$GROUP" --data /mnt/storage \
		--out /out/scores.tsv --base http://127.0.0.1:8080
}

# run_model <slug> <group> <job>...
run_model() {
	SLUG="$1"
	GROUP="$2"
	shift 2
	CONTAINER="ai-a1-enc-tei-$SLUG"
	OUT="$RESULTS/$SLUG"
	mkdir -p "$OUT"
	LOG="$OUT/run.log"
	{
		echo
		echo "== $SLUG ($GROUP), $(date -u +%FT%TZ)"
		echo "model /mnt/storage/$GROUP"
		echo "image $IMAGE"
		echo "engine TEI --model-id /data/$GROUP --port 8080"
	} >> "$LOG"

	if ! timeout 120 docker run --rm -v "$VOL:/mnt/storage" python:3.12-slim \
		sh -c "test -f '/mnt/storage/$GROUP/config.json'" 2>/dev/null; then
		echo "the model of $SLUG is not in the volume: it is not measured" >> "$LOG"
		return 0
	fi

	docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
	STARTED=$(date +%s)
	# Capped: the first run of bge-m3 (default batch tokens) took 12.4 GiB and
	# pushed the shared host into swap. Caveat: a model whose warm-up needs more
	# than the cap is killed and reported "never came", not measured.
	timeout 3600 docker run -d --name "$CONTAINER" --network none \
		--memory 7g --memory-swap 7g --cpus 6 \
		-v "$MOUNTPOINT/$GROUP:/data/$GROUP:ro" \
		"$IMAGE" --model-id "/data/$GROUP" --port 8080 >> "$LOG" 2>&1

	# The server answers when the model is loaded.
	READY=0
	for _ in $(seq 1 120); do
		if timeout 60 docker run --rm --network "container:$CONTAINER" python:3.12-slim \
			python3 -c "
import urllib.request
urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5)
" 2>/dev/null; then
			READY=1
			break
		fi
		if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
			break
		fi
		sleep 5
	done

	if [ "$READY" = '1' ]; then
		echo "the server of $SLUG is ready in $(( $(date +%s) - STARTED )) s" >> "$LOG"
		for JOB in "$@"; do
			echo "== the job $JOB of $SLUG" >> "$LOG"
			client "$SLUG" "$GROUP" "$JOB" >> "$LOG" 2>&1 ||
				echo "the bench of $SLUG ($JOB) failed" >> "$LOG"
		done
		echo "the memory of the server" >> "$LOG"
		timeout 120 docker stats --no-stream "$CONTAINER" >> "$LOG" 2>&1 || true
		echo "the log of the server" >> "$LOG"
		timeout 120 docker logs "$CONTAINER" >> "$LOG" 2>&1 || true
	else
		echo "the server of $SLUG never came: the model is not servable on TEI" >> "$LOG"
		timeout 120 docker logs "$CONTAINER" >> "$LOG" 2>&1 || true
	fi

	uptime >> "$LOG"
	docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
	echo "the server of $SLUG is gone" >> "$LOG"
}

# --- the environment --------------------------------------------------------
if ! env_ready; then
	install_env
fi

# --- the classifiers of toxicity -------------------------------------------
if [ "$WHAT" = 'toxicity' ] || [ "$WHAT" = 'all' ]; then
	wait_slot 'the toxicity of xlmr-large' || exit 1
	run_model tox-xlmr-large tox-xlmr-large tox latency
	wait_slot 'the toxicity of bert-multilingual' || exit 1
	run_model tox-bert-multilingual tox-bert-multilingual tox latency
	wait_slot 'the toxicity of xlm-roberta' || exit 1
	run_model tox-xlm-roberta tox-xlm-roberta tox latency
fi

# --- the classifiers of sentiment ------------------------------------------
if [ "$WHAT" = 'sentiment' ] || [ "$WHAT" = 'all' ]; then
	wait_slot 'the sentiment of distilbert' || exit 1
	run_model sent-distilbert sent-distilbert sent latency
	wait_slot 'the sentiment of nlptown' || exit 1
	run_model sent-nlptown sent-nlptown sent latency
	wait_slot 'the sentiment of modernbert' || exit 1
	run_model sent-modernbert sent-modernbert sent latency
fi

# --- the reranker -----------------------------------------------------------
if [ "$WHAT" = 'rerank' ] || [ "$WHAT" = 'all' ]; then
	wait_slot 'the reranker of bge-m3' || exit 1
	run_model rerank-bge-m3 rerank-bge-m3 rerank
	wait_slot 'the reranker of gte-base' || exit 1
	run_model rerank-gte-base rerank-gte-base rerank
	wait_slot 'the reranker of mmarco' || exit 1
	run_model rerank-mmarco rerank-mmarco rerank
fi
