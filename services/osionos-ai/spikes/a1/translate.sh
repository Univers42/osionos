#!/bin/sh
# The translation of the guard spike (AI-A1): the prompts of I2P and the
# captions of COCO are translated into French and into Spanish, so that the
# guard is measured in the two languages of the slice.
#
# The translation is done by the chat model of ai-dev, which is read only: the
# container only calls it, on the network of ai-dev, and it is removed at the
# end. The translations stay in the volume: the text of a prompt is never in
# the repository.
#
# usage: sh translate.sh <French|Spanish> <in.tsv> <out.tsv>
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
LANGUAGE="$1"
INPUT="$2"
OUTPUT="$3"

VOL='osionos_ai_a1_data'
IMAGE='track-binocle/osionos-ai:ai-dev'
CONTAINER='ai-a1-translate'
LOG="$HERE/results/safety/translate.log"

sh "$HERE/guard.sh" "translate $LANGUAGE"

mkdir -p "$(dirname "$LOG")"

cleanup() {
	docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# The sha256 of the file of the translations: it goes into the results, and
# the file itself stays in the volume.
digest_of() {
	docker run --rm -v "$VOL:/mnt/storage" python:3.12-slim python3 -c "
import hashlib
digest = hashlib.sha256()
with open('$1', 'rb') as handle:
    for block in iter(lambda: handle.read(1 << 20), b''):
        digest.update(block)
rows = sum(1 for _ in open('$1', encoding='utf-8'))
print(f'translation $LANGUAGE $1 rows {rows} sha256 {digest.hexdigest()}')
"
}

# A translation that is already there is not done again.
if docker run --rm -v "$VOL:/mnt/storage" python:3.12-slim python3 -c "
import os, sys
sys.exit(0 if os.path.exists('$OUTPUT') else 1)" >/dev/null 2>&1; then
	echo "the translation into $LANGUAGE is already there: $OUTPUT" >> "$LOG"
	digest_of "$OUTPUT" | tee -a "$LOG"
	exit 0
fi

{
	echo
	echo "# the translation into $LANGUAGE, $(date -Is)"
	uptime
	echo
} >> "$LOG"

# The user of the image is not root: the file of the translations is written
# by the root of the container.
docker run --rm --user root --name "$CONTAINER" --network ai-dev-net \
	-v "$VOL:/mnt/storage" -v "$HERE:/spike:ro" \
	"$IMAGE" node /spike/translate.mjs \
	http://ai-dev-llm:8080 qwen3-4b "$LANGUAGE" "$INPUT" "$OUTPUT" 2>&1 | tee -a "$LOG"

digest_of "$OUTPUT" | tee -a "$LOG"

uptime >> "$LOG"
