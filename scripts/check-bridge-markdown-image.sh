#!/bin/sh
# osionos#240 M240-14, the image half: the markdown bundle and the route module load in the
# bridge's base image, node:22-bookworm-slim, from exactly the files the Dockerfile's globs
# copy (scripts/bridge-*.mjs scripts/ide-*.mjs, moderation-lists/), offline and read-only,
# as the node user.
# A bundle that needs a package, a newer Node or a file outside the globs fails here, not
# on the VM. The import closure of the whole bridge is groot's bridge-image-closure.bats.
# Usage: check-bridge-markdown-image.sh [image]   (default: the mirror of the base image)
# Caveat: the mirror tag can lag the ECR tag the Dockerfile pulls; both name Node 22 on
# Debian bookworm, but a patch release between them is not compared.
set -eu

IMAGE="${1:-mirror.gcr.io/library/node:22-bookworm-slim}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT INT TERM

mkdir "$STAGE/scripts"
cp "$ROOT"/scripts/bridge-*.mjs "$ROOT"/scripts/ide-*.mjs "$STAGE/scripts/"
# docker/services/bridge/Dockerfile.dockerignore keeps tests out of the context.
rm -f "$STAGE"/scripts/*.test.mjs
# The word lists bridge-moderation.mjs reads at import, which the Dockerfile copies too.
if [ -d "$ROOT/scripts/moderation-lists" ]; then cp -R "$ROOT/scripts/moderation-lists" "$STAGE/scripts/"; fi
chmod -R a+rX "$STAGE"

SMOKE="import('./scripts/bridge-markdown-engine.mjs')
	.then((engine) => {
		const types = engine.markdownImportBlocks('# Smoke\\n\\n- item').map((block) => block.type).join(',');
		if (types !== 'heading_1,bulleted_list') throw new Error('unexpected blocks: ' + types);
		return import('./scripts/bridge-pages-from-markdown.mjs');
	})
	.then(() => console.log('bridge markdown bundle loads in ' + process.version));"

timeout 120 docker run --rm --network none --read-only --user node \
	-v "$STAGE:/app:ro" -w /app "$IMAGE" node -e "$SMOKE"
