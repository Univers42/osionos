#!/bin/sh
# The models of the output check on the generated images (devil C73).
#
# The check of the service is two pinned classifiers, on the disk of a volume:
# the q8 weights of the two, their config and their preprocessor. This script
# downloads them from the hub, into the layout of transformers.js — the id of
# the model is a directory — and checks every byte against the lock of the
# spike (`spikes/a1/models.lock`, the columns size and sha256).
#
# A file that does not match the lock is a failure: the partial file is
# removed and the script stops with a non-zero status. A file that is already
# there and that matches the lock is not downloaded again.
#
# The preprocessor is read by transformers.js at the root of the model
# directory; the repository of AdamCodd keeps it under `onnx/`, so the same
# bytes — the same sha256 — are placed at the root too.
#
# usage: sh scripts/fetch-image-check.sh <dir>
set -eu

DIR="${1:-}"
if [ -z "$DIR" ]; then
	echo "usage: fetch-image-check.sh <dir>" >&2
	exit 2
fi

LOCK_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/../spikes/a1" && pwd)
LOCK="$LOCK_DIR/models.lock"
if [ ! -f "$LOCK" ]; then
	echo "[fetch] the lock is not there: $LOCK" >&2
	exit 1
fi

HUB='https://huggingface.co'

# The rows of the lock this check needs: the q8 weights of the two models, the
# config of each, the config of the ONNX folder when the repository has one,
# and the preprocessor. The awk is one line: mawk (the awk of Debian) reads a
# newline inside a parenthesis as the end of the program.
ROWS=$(awk -F'\t' -v keep='onnx/model_quantized.onnx config.json onnx/config.json preprocessor_config.json onnx/preprocessor_config.json' '($1 == "nsfw" || $1 == "nsfw2") && $2 == "model" && index(" " keep " ", " " $6 " ") { print $4 "\t" $5 "\t" $6 "\t" $7 "\t" $8 }' "$LOCK")
if [ -z "$ROWS" ]; then
	echo "[fetch] the lock has no row for the output check" >&2
	exit 1
fi

# The sha256 of a file, with the two tools of the two systems.
sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d' ' -f1
	else
		shasum -a 256 "$1" | cut -d' ' -f1
	fi
}

# The size of a file, in bytes.
size_of() {
	wc -c < "$1" | tr -d ' '
}

# The rows of the loop: the repository, the revision, the file, the size and
# the sha256 of the lock.
while IFS="$(printf '\t')" read -r repo revision file bytes sha; do
	[ -n "$repo" ] || continue
	target="$DIR/$repo/$file"
	mkdir -p "$(dirname -- "$target")"
	if [ -f "$target" ]; then
		if [ "$(size_of "$target")" = "$bytes" ] && [ "$(sha256_of "$target")" = "$sha" ]; then
			echo "[fetch] $repo/$file is there and matches the lock"
			continue
		fi
		rm -f "$target"
	fi
	echo "[fetch] $repo/$file"
	if ! curl --fail --location --proto "=https" --proto-redir "=https" --max-time 600 --silent --show-error --output "$target.part" \
		"$HUB/$repo/resolve/$revision/$file"; then
		rm -f "$target.part"
		echo "[fetch] the download of $repo/$file failed" >&2
		exit 1
	fi
	if [ "$(size_of "$target.part")" != "$bytes" ] || [ "$(sha256_of "$target.part")" != "$sha" ]; then
		echo "[fetch] $repo/$file does not match the lock (size $(size_of "$target.part"), sha256 $(sha256_of "$target.part"))" >&2
		rm -f "$target.part"
		exit 1
	fi
	mv "$target.part" "$target"
done <<EOF
$ROWS
EOF

# The preprocessor of transformers.js is read at the root of the model
# directory: the repository that keeps it under `onnx/` gets the same bytes
# there.
for repo in $(printf '%s\n' "$ROWS" | cut -f1 | sort -u); do
	if [ -f "$DIR/$repo/onnx/preprocessor_config.json" ] && [ ! -f "$DIR/$repo/preprocessor_config.json" ]; then
		cp "$DIR/$repo/onnx/preprocessor_config.json" "$DIR/$repo/preprocessor_config.json"
		echo "[fetch] $repo/preprocessor_config.json (the copy of the one of onnx/)"
	fi
done

echo "[fetch] the models of the output check are in $DIR"
