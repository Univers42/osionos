#!/bin/sh
# The runner-side half of osionos#240 M240-11/12, run by CI before the test suites.
# Fails when packages/markdown-engine is absent (the drift and parity tests would then
# compare nothing) or when scripts/bridge-markdown-engine.mjs records an engine commit
# other than the one the submodule has checked out. The suites run in a container that
# cannot always read the submodule's gitdir, so the commit is compared here, with git.
# Usage: check-bridge-markdown-engine-pin.sh [repo-root]
set -eu

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ENGINE="$ROOT/packages/markdown-engine"
BUNDLE="$ROOT/scripts/bridge-markdown-engine.mjs"

if [ ! -f "$ENGINE/markdown/shortcuts.ts" ]; then
	printf 'FAIL osionos#240: %s is missing; check out submodules recursively.\n' "packages/markdown-engine/markdown/shortcuts.ts" >&2
	exit 1
fi
recorded=$(sed -n 's|^// engine-commit: \([0-9a-f]\{40\}\)$|\1|p' "$BUNDLE")
checked_out=$(git -C "$ENGINE" rev-parse HEAD)
if [ "$recorded" != "$checked_out" ]; then
	printf 'FAIL osionos#240: the bundle records engine %s, the submodule is at %s; run node scripts/build-bridge-markdown-engine.mjs\n' "${recorded:-<none>}" "$checked_out" >&2
	exit 1
fi
printf 'bridge markdown bundle pinned to engine %s\n' "$checked_out"
