#!/bin/sh
# fetch.sh — download the pinned Wikipedia source into the Docker volume.
#
# The source is the one of wiki.lock: the parquet of the Hugging Face mirror
# first, the dump of dumps.wikimedia.org when the mirror answers 429. The
# checksum of the file is verified before it is accepted — a mismatch exits 1
# and the file is thrown away — and the bytes never touch the repository: they
# live in the volume osionos_ai_wiki_data.
#
# usage: sh fetch.sh [--source parquet|dump] [--force]
set -eu

WIKI_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LOCK="$WIKI_DIR/wiki.lock"

if [ ! -f "$LOCK" ]; then
	echo "fetch.sh: $LOCK is missing" >&2
	exit 2
fi

# The lock is KEY=value lines; the shell reads them with sed.
lock_value() {
	sed -n "s/^$1=//p" "$LOCK" | head -n 1
}

PYTHON_IMAGE=$(lock_value PYTHON_IMAGE)
DATA_VOLUME=$(lock_value DATA_VOLUME)
DATA_DIR=$(lock_value DATA_DIR)
HF_URL=$(lock_value HF_URL)
HF_SHA256=$(lock_value HF_SHA256)
HF_BYTES=$(lock_value HF_BYTES)
HF_FILE=$(lock_value HF_FILE)
DUMP_URL=$(lock_value DUMP_URL)
DUMP_SHA1=$(lock_value DUMP_SHA1)
DUMP_BYTES=$(lock_value DUMP_BYTES)
DUMP_FILE=$(lock_value DUMP_FILE)

SOURCE="parquet"
FORCE=""
while [ $# -gt 0 ]; do
	case "$1" in
	--source)
		SOURCE=$2
		shift 2
		;;
	--force)
		FORCE="--force"
		shift
		;;
	*)
		echo "usage: sh fetch.sh [--source parquet|dump] [--force]" >&2
		exit 2
		;;
	esac
done
if [ "$SOURCE" != "parquet" ] && [ "$SOURCE" != "dump" ]; then
	echo "fetch.sh: the source is parquet or dump, not $SOURCE" >&2
	exit 2
fi

docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 || docker volume create "$DATA_VOLUME" >/dev/null

# The download runs in the pinned container: the checksum is computed on the
# machine that holds the bytes, and the container is the one of wiki.lock.
# usage: fetch_one <url> <name> <algo> <checksum> <bytes>
fetch_one() {
	url=$1
	name=$2
	algo=$3
	checksum=$4
	bytes=$5
	echo "[fetch] $name <- $url"
	docker run --rm -i -v "$DATA_VOLUME:/data" \
		-e WIKI_URL="$url" \
		-e WIKI_NAME="$name" \
		-e WIKI_ALGO="$algo" \
		-e WIKI_SHA="$checksum" \
		-e WIKI_BYTES="$bytes" \
		-e WIKI_DIR_IN_VOLUME="$DATA_DIR" \
		-e WIKI_FORCE="$FORCE" \
		"$PYTHON_IMAGE" python - <<'PYTHON'
import hashlib
import os
import sys
import urllib.request

url = os.environ["WIKI_URL"]
# The name of the lock holds the folder of the mirror ("20231101.simple/…"),
# and the file lives flat in the volume.
name = os.path.basename(os.environ["WIKI_NAME"])
algo = os.environ["WIKI_ALGO"]
expected = os.environ["WIKI_SHA"]
size = int(os.environ["WIKI_BYTES"])
force = os.environ.get("WIKI_FORCE") == "--force"
folder = os.path.join("/data", os.environ["WIKI_DIR_IN_VOLUME"])
target = os.path.join(folder, name)
part = target + ".part"


def digest_of(path):
    digest = hashlib.new(algo)
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


os.makedirs(folder, exist_ok=True)
if os.path.exists(target) and not force:
    found = digest_of(target)
    if found == expected:
        print(f"[fetch] {name} is already there and its checksum is right")
        sys.exit(0)
    print(f"[fetch] {name} is there but its checksum is wrong: it is fetched again")
    os.remove(target)

request = urllib.request.Request(url, headers={"User-Agent": "osionos-ai-wiki-import/1.0"})
total = 0
try:
    with urllib.request.urlopen(request, timeout=180) as answer, open(part, "wb") as out:
        while True:
            block = answer.read(1 << 20)
            if not block:
                break
            out.write(block)
            total += len(block)
            if total % (32 << 20) < (1 << 20):
                print(f"[fetch] {total} bytes", flush=True)
except Exception as error:  # noqa: BLE001 - the message is what matters
    print(f"[fetch] the download failed: {error}", file=sys.stderr)
    if os.path.exists(part):
        os.remove(part)
    sys.exit(1)

found = digest_of(part)
if found != expected:
    os.remove(part)
    print(f"[fetch] checksum mismatch: {algo} {found} != {expected}", file=sys.stderr)
    sys.exit(1)
if total != size:
    os.remove(part)
    print(f"[fetch] size mismatch: {total} != {size}", file=sys.stderr)
    sys.exit(1)

os.replace(part, target)
print(f"[fetch] {name}: {total} bytes, {algo} {found}")
PYTHON
}

if [ "$SOURCE" = "dump" ]; then
	fetch_one "$DUMP_URL" "$DUMP_FILE" sha1 "$DUMP_SHA1" "$DUMP_BYTES"
	exit $?
fi

# The mirror answers 429 to this machine now and then: it is asked twice, and
# the dump is the fallback.
attempt=1
while [ "$attempt" -le 2 ]; do
	echo "[fetch] attempt $attempt of 2"
	if fetch_one "$HF_URL" "$HF_FILE" sha256 "$HF_SHA256" "$HF_BYTES"; then
		exit 0
	fi
	attempt=$(( attempt + 1 ))
done

echo "[fetch] the mirror failed twice: falling back to the dump" >&2
fetch_one "$DUMP_URL" "$DUMP_FILE" sha1 "$DUMP_SHA1" "$DUMP_BYTES"
