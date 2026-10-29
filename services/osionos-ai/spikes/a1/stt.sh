#!/usr/bin/env bash
# Runs stt-bench.py against speaches exactly as production pins it (AI-A1, M5).
# Needs the running ai-stt-srv on the internal network ai-stt-net, the clips
# volume osionos_ai_a1_data, and results/stt/clips.tsv.
# Caveat: docker stats MemUsage is cgroup memory minus page cache, sampled every
# 2 s, so a peak shorter than 2 s can be missed (under-reports).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/results/stt"
mkdir -p "$OUT/raw"
: > "$OUT/load.log"

wait_for_load() {
	for _ in 1 2 3 4 5 6; do
		l=$(cut -d' ' -f1 /proc/loadavg)
		awk -v l="$l" 'BEGIN{exit !(l<=6)}' && return 0
		echo "load $l > 6, waiting 5 min" | tee -a "$OUT/load.log"
		sleep 300
	done
	echo "load still high after 30 min, running anyway" | tee -a "$OUT/load.log"
}

for model in Systran/faster-whisper-small deepdml/faster-whisper-large-v3-turbo-ct2; do
	slug=${model//\//--}
	wait_for_load
	{ echo "== $model before: $(uptime)"; free -g; } >> "$OUT/load.log"
	( while :; do docker stats --no-stream --format '{{.MemUsage}}' ai-stt-srv >> "$OUT/rss-$slug.log" 2>/dev/null; sleep 2; done ) &
	sampler=$!
	timeout 3000 docker run --rm --network ai-stt-net --cpus 1 --memory 512m \
		-v osionos_ai_a1_data:/data:ro -v "$HERE":/spike:ro -v "$OUT":/out \
		python:3.12-slim python3 -I /spike/stt-bench.py run --model "$model" \
		--base http://ai-stt-srv:8000 --clips /data/clips --tsv /out/clips.tsv --out /out/raw \
		| tee "$OUT/run-$slug.log" | tail -3
	kill "$sampler"; wait "$sampler" 2>/dev/null || true
	{ echo "== $model after: $(uptime)"; free -g; } >> "$OUT/load.log"
done
docker run --rm -v "$HERE":/spike:ro -v "$OUT":/out python:3.12-slim \
	python3 -I /spike/stt-bench.py summarize --raw /out/raw --out /out/summary-stt.json > /dev/null
