#!/bin/sh
# The measurement of the guard spike (AI-A1): the whole of it, in the order the
# results need it.
#
# The artifacts are fetched apart (fetch.py, fetch-coco-captions.py), the
# model is in the volume, and this script does the rest: the sets, the
# translations, the runs of the two models and the summary.
#
# Every step waits for the slot of the spike first (guard.sh): the host is
# shared with the other agents, and a measurement of the guard must not run
# beside another one.
#
# The verdicts of a model land in the volume, in the directory of the model: a
# run that was cut keeps them, and the next run asks again only the rows that
# have no verdict yet. So a step that is already done is quick.
#
# usage: sh measure.sh [0.6b|4b|all]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
VOL='osionos_ai_a1_data'
SETS='/mnt/storage/sets'
OUT6="/mnt/storage/out/a1enc-0.6b"
OUT4="/mnt/storage/out/a1enc-4b"
MODEL6='/mnt/storage/guard/Qwen3Guard-Gen-0.6B.Q8_0.gguf'
MODEL4='/mnt/storage/guard/Qwen3Guard-Gen-4B.Q4_K_M.gguf'
WHAT="${1:-all}"

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

# The verdicts of a model, in the order of the runs, without the prompt text.
collect() {
	# collect <label> <directory of the volume> <file>...
	LABEL="$1"
	DIR="$2"
	shift 2
	mkdir -p "$HERE/results/safety/guard-$LABEL"
	docker run --rm -v "$VOL:/mnt/storage" \
		-v "$HERE/results/safety/guard-$LABEL:/out" python:3.12-slim python3 -c "
import os, sys
out = '/out/verdicts.tsv'
seen = set()
rows = []
for name in sys.argv[1:]:
    path = os.path.join('$DIR', name + '.tsv')
    if not os.path.exists(path):
        continue
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            parts = line.rstrip('\n').split('\t')
            key = (parts[0], parts[1])
            if len(parts) >= 6 and key not in seen:
                seen.add(key)
                rows.append(line if line.endswith('\n') else line + '\n')
with open(out, 'w', encoding='utf-8') as handle:
    handle.writelines(rows)
print(f'verdicts {len(rows)} rows in {out}')
" "$@"
}

# --- the sets ---------------------------------------------------------------
if [ ! -f "$SETS/i2p.tsv" ]; then
	wait_slot 'the sets' || exit 1
	docker run --rm -v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" python:3.12-slim \
		python3 /spike/build-sets.py \
		--i2p /mnt/storage/data/i2p_benchmark.csv \
		--captions /mnt/storage/sets/coco_captions.json \
		--prompts /spike/results/prompts.txt --dest /mnt/storage/sets
fi

# --- the translations -------------------------------------------------------
# The chat model of ai-dev, read only: the container only calls it.
for PAIR in 'French i2p-200 fr' 'Spanish i2p-200 es' 'French coco-200 fr' 'Spanish coco-200 es'; do
	# shellcheck disable=SC2086
	set -- $PAIR
	wait_slot "translate $1" || exit 1
	sh "$HERE/translate.sh" "$1" "/mnt/storage/sets/$2.tsv" "/mnt/storage/sets/$2.$3.tsv" || true
done

# --- the 0.6B ---------------------------------------------------------------
if [ "$WHAT" = '0.6b' ] || [ "$WHAT" = 'all' ]; then
	wait_slot 'guard 0.6b' || exit 1
	SETS="$SETS" VOLOUT="$OUT6" sh "$HERE/guard-server.sh" 0.6b "$MODEL6" guard-0.6b \
		'i2p:en:0:i2p' \
		'coco:en:0:coco' \
		'prompts:en:0:prompts' \
		'i2p-200:en:0:i2p-200-en' \
		'coco-200:en:0:coco-200-en' \
		'i2p-200:fr:0:i2p-200-fr:/mnt/storage/sets/i2p-200.fr.tsv' \
		'i2p-200:es:0:i2p-200-es:/mnt/storage/sets/i2p-200.es.tsv' \
		'coco-200:fr:0:coco-200-fr:/mnt/storage/sets/coco-200.fr.tsv' \
		'coco-200:es:0:coco-200-es:/mnt/storage/sets/coco-200.es.tsv' \
		'par:i2p-par:en:400:i2p-par:/mnt/storage/sets/i2p.tsv'
	collect 0.6b "$OUT6" i2p coco prompts i2p-200-en coco-200-en \
		i2p-200-fr i2p-200-es coco-200-fr coco-200-es i2p-par
fi

# --- the 4B ----------------------------------------------------------------
if [ "$WHAT" = '4b' ] || [ "$WHAT" = 'all' ]; then
	wait_slot 'guard 4b' || exit 1
	SETS="$SETS" VOLOUT="$OUT4" sh "$HERE/guard-server.sh" 4b "$MODEL4" guard-4b \
		'i2p-hard:en:0:i2p-hard' \
		'coco:en:0:coco' \
		'prompts:en:0:prompts' \
		'i2p-200:en:0:i2p-200-en' \
		'coco-200:en:0:coco-200-en' \
		'i2p-200:fr:0:i2p-200-fr:/mnt/storage/sets/i2p-200.fr.tsv' \
		'i2p-200:es:0:i2p-200-es:/mnt/storage/sets/i2p-200.es.tsv' \
		'coco-200:fr:0:coco-200-fr:/mnt/storage/sets/coco-200.fr.tsv' \
		'coco-200:es:0:coco-200-es:/mnt/storage/sets/coco-200.es.tsv' \
		'par:i2p-hard-par:en:400:i2p-hard-par:/mnt/storage/sets/i2p-hard.tsv'
	collect 4b "$OUT4" i2p-hard coco prompts i2p-200-en coco-200-en \
		i2p-200-fr i2p-200-es coco-200-fr coco-200-es i2p-hard-par
fi

# --- the summary ------------------------------------------------------------
docker run --rm -v "$VOL:/mnt/storage:ro" -v "$HERE:/spike:ro" python:3.12-slim \
	python3 /spike/summarize.py \
	--verdicts /mnt/storage/out/a1enc-0.6b/i2p.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/coco.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/prompts.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/i2p-200-en.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/coco-200-en.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/i2p-200-fr.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/i2p-200-es.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/coco-200-fr.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/coco-200-es.tsv \
	--verdicts /mnt/storage/out/a1enc-0.6b/i2p-par.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/i2p-hard.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/coco.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/prompts.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/i2p-200-en.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/coco-200-en.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/i2p-200-fr.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/i2p-200-es.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/coco-200-fr.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/coco-200-es.tsv \
	--verdicts /mnt/storage/out/a1enc-4b/i2p-hard-par.tsv \
	--truth /mnt/storage/sets/i2p-truth.tsv \
	--usage /mnt/storage/out/a1enc-0.6b/usage.tsv \
	--usage /mnt/storage/out/a1enc-4b/usage.tsv
