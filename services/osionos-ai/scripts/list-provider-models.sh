#!/usr/bin/env bash
# FA28: list GET <baseUrl>/models for every pool provider and print ids only,
# `provider<TAB>id`. The key is read from the env (or --env-file, parsed, never
# sourced) and reaches curl through a mode-600 header file; it is never echoed.
#
# usage: bash scripts/list-provider-models.sh [--env-file FILE]
#        reads OSIONOS_AI_PLATFORM_PROVIDERS (JSON, see src/platformProviders.ts)
#
# Caveat: a listed id is not proof that it answers. /models lists what the
# provider offers, not what your key may call or what is rate-limited right now;
# rank-pool.sh measures the answers. A provider with an unset key is skipped.
set -euo pipefail

HERE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib/pool-env.sh
. "$HERE/lib/pool-env.sh"

if [ "${1:-}" = "--env-file" ]; then
	load_env_file "${2:?--env-file needs a path}"
fi
: "${OSIONOS_AI_PLATFORM_PROVIDERS:?OSIONOS_AI_PLATFORM_PROVIDERS is unset}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
failed=0

# `-` stands for "no key": a tab-separated empty field would collapse.
providers=$(printf '%s' "$OSIONOS_AI_PLATFORM_PROVIDERS" |
	jq -r '.[] | [.id, .baseUrl, (.apiKeyEnv // "-")] | @tsv')

while IFS="$(printf '\t')" read -r id base keyname; do
	[ -n "$id" ] || continue
	set -- -fsS -m 20
	if [ "$keyname" != "-" ]; then
		if ! write_auth_header "$keyname" "$WORK/auth"; then
			echo "skip $id: $keyname is unset or empty" >&2
			continue
		fi
		set -- "$@" -H "@$WORK/auth"
	fi
	if ! body=$(timeout 30 curl "$@" "${base%/}/models"); then
		echo "fail $id: GET /models did not answer" >&2
		failed=1
		continue
	fi
	printf '%s' "$body" | jq -r --arg p "$id" '.data[]?.id | [$p, .] | @tsv'
done <<LIST
$providers
LIST
exit "$failed"
