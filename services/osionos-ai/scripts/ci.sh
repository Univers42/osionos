#!/bin/sh
# The AI service's gate, one command for a developer and for GitHub Actions:
# install the service's dependencies in node:22 (pnpm, the version pinned in
# package.json), type-check, then run the suite (scripts/test.sh) on the groot
# models migrations it needs (scripts/migrations.txt).
#
# MODELS_DIR points at a groot checkout's models/. Unset, the public groot
# repository's main branch is sparse-cloned into a temporary directory: the
# migrations live there, not in this repository.
#
# Caveat: the suite then runs on groot MAIN, not on the groot commit the live
# stack runs. A migration merged in groot and not yet applied live passes here
# first; the release runbook (plan A3) is what proves the live order.
set -eu

SERVICE_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SERVICE_DIR/../.." && pwd)
NODE_IMAGE=node:22-bookworm-slim
PNPM_VERSION=$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$SERVICE_DIR/package.json")
[ -n "$PNPM_VERSION" ] || { echo "[ci] package.json has no pnpm packageManager pin" >&2; exit 2; }

run_node() {
	docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		-v "$REPO_ROOT:/app" -w /app/services/osionos-ai "$NODE_IMAGE" "$@"
}

# --ignore-workspace: the app's root pnpm-workspace.yaml would otherwise make
# pnpm install the APP at the repository root (637 packages, 2026-10-26). The
# service installs on its own lockfile, as the image does (ai.Dockerfile).
echo "[ci] pnpm $PNPM_VERSION install --frozen-lockfile"
run_node corepack "pnpm@$PNPM_VERSION" install --frozen-lockfile --ignore-workspace

echo "[ci] tsc --noEmit"
run_node ./node_modules/.bin/tsc --noEmit -p .

if [ -z "${MODELS_DIR:-}" ]; then
	GROOT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/groot-models.XXXXXX")
	git clone -q --depth 1 --filter=blob:none --sparse "${GROOT_REPO:-https://github.com/Univers42/groot.git}" "$GROOT_DIR"
	git -C "$GROOT_DIR" sparse-checkout set --no-cone models
	MODELS_DIR=$GROOT_DIR/models
	echo "[ci] groot models from $(git -C "$GROOT_DIR" rev-parse --short HEAD)"
fi

# The migrations become the positional arguments of test.sh, one per line of
# the list; a name that is not a file stops the gate before anything starts.
HARNESS_LABEL=ci
HARNESS_DIR="$SERVICE_DIR/eval"
# shellcheck source=../eval/harness.sh
. "$HARNESS_DIR/harness.sh"
MIGRATIONS=$(harness_migration_list "$MODELS_DIR")
set --
while IFS= read -r migration; do
	set -- "$@" "$migration"
done <<EOF
$MIGRATIONS
EOF

echo "[ci] suite on $# migrations"
sh "$SERVICE_DIR/scripts/test.sh" "$@"
