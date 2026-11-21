#!/usr/bin/env bash
# FA13/FA18: measure every catalog model and write the rank artifact.
#
# The catalog is OSIONOS_AI_PLATFORM_PROVIDERS (every provider model, by its
# upstreamId) plus the legacy OSIONOS_AI_PLATFORM_MODELS at OSIONOS_AI_UPSTREAM_BASE_URL.
# Per model it runs llm-bench-gpu.mjs --n N in docker (node:22; no Node on the host)
# and records: n, success rate, time to the first content part p50/p95 (content,
# reasoning or tool call), ITL p95, tok/s and the runs that streamed reasoning.
# A model whose first-part p95 exceeds 90 s is marked NOT-FIRST (FA18).
#
# usage: bash scripts/bench/rank-pool.sh --out FILE [--env-file FILE] [--n N]
#   N defaults to 20, the FA13 floor. Keys are read from the env or --env-file
#   (parsed, never sourced) and reach the bench through a mode-600 header file.
#
# Caveat: this measures one sequential client at one moment. A small n makes p95
# the slowest run; a shared GPU or a busy free tier moves the numbers between
# runs, so re-run before trusting a close ranking. A model listed by /models
# but refusing this key shows as a 0% success row, not as an absent one.
# The suggested order is by success rate, then first-part p50: it is a starting
# rank to review, not a verdict.
set -euo pipefail

HERE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SERVICE_DIR=$(CDPATH='' cd -- "$HERE/../.." && pwd)
# shellcheck source=../lib/pool-env.sh
. "$HERE/../lib/pool-env.sh"

N=20
OUT=""
CMD="bash scripts/bench/rank-pool.sh $*"
while [ $# -gt 0 ]; do
	case "$1" in
	--out) OUT=${2:?--out needs a path}; shift 2 ;;
	--n) N=${2:?--n needs a number}; shift 2 ;;
	--env-file) load_env_file "${2:?--env-file needs a path}"; shift 2 ;;
	*) echo "usage: rank-pool.sh --out FILE [--env-file FILE] [--n N]" >&2; exit 2 ;;
	esac
done
[ -n "$OUT" ] || { echo "--out is required" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# catalog <file>: provider TAB baseUrl TAB keyName TAB modelId; `-` is "no key".
catalog() {
	if [ -n "${OSIONOS_AI_PLATFORM_PROVIDERS:-}" ]; then
		printf '%s' "$OSIONOS_AI_PLATFORM_PROVIDERS" | jq -r '.[] | . as $p | .models[] |
			[$p.id, $p.baseUrl, ($p.apiKeyEnv // "-"), .upstreamId] | @tsv'
	fi
	if [ -n "${OSIONOS_AI_PLATFORM_MODELS:-}" ] && [ -n "${OSIONOS_AI_UPSTREAM_BASE_URL:-}" ]; then
		printf '%s' "$OSIONOS_AI_PLATFORM_MODELS" | jq -r --arg b "$OSIONOS_AI_UPSTREAM_BASE_URL" \
			--arg k "${OSIONOS_AI_UPSTREAM_API_KEY:+OSIONOS_AI_UPSTREAM_API_KEY}" \
			'.[] | ["legacy", $b, (if $k == "" then "-" else $k end), .id] | @tsv'
	fi
}

# bench_one <provider> <base> <keyname> <model>: the bench JSON on stdout.
bench_one() {
	net=""
	case "$2" in http://127.0.0.1* | http://localhost*) net="--network host" ;; esac
	mount=""
	auth=""
	if [ "$3" != "-" ]; then
		mount="-v $WORK/auth:/auth:ro"
		auth="--auth-file /auth"
	fi
	# shellcheck disable=SC2086
	timeout "${RANK_TIMEOUT:-3600}" docker run --rm $net $mount --user "$(id -u):$(id -g)" \
		-v "$SERVICE_DIR:/s:ro" -w /s -e WARMUP=0 -e "LABEL=$1/$4" \
		node:22-bookworm-slim node scripts/bench/llm-bench-gpu.mjs \
		--base-url "$2" --model "$4" --n "$N" --plain $auth
}

: >"$WORK/rows"
catalog >"$WORK/catalog"
[ -s "$WORK/catalog" ] || { echo "no catalog: set OSIONOS_AI_PLATFORM_PROVIDERS" >&2; exit 1; }
while IFS="$(printf '\t')" read -r provider base keyname model; do
	if [ "$keyname" != "-" ] && ! write_auth_header "$keyname" "$WORK/auth"; then
		echo "skip $provider: $keyname is unset or empty" >&2
		continue
	fi
	echo "bench $provider/$model n=$N" >&2
	if json=$(bench_one "$provider" "$base" "$keyname" "$model"); then
		printf '%s' "$json" | jq -c --arg p "$provider" --arg m "$model" \
			'{provider:$p, model:$m, n, successRate, firstPartP50, firstPartP95, itlP95, tokPerS:.aggregateTokPerS, reasoningRuns}' >>"$WORK/rows"
	else
		echo "bench failed: $provider/$model" >&2
		jq -cn --arg p "$provider" --arg m "$model" --argjson n "$N" \
			'{provider:$p, model:$m, n:$n, successRate:0, firstPartP50:null, firstPartP95:null, itlP95:null, tokPerS:null, reasoningRuns:0}' >>"$WORK/rows"
	fi
done <"$WORK/catalog"
[ -s "$WORK/rows" ] || { echo "nothing benched: every provider was skipped" >&2; exit 1; }

{
	printf '# Pool rank artifact\n\nDate: %s\n\nCommand: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\`$CMD\`"
	printf '| rank | provider/model | n | success | first-part p50 ms | first-part p95 ms | ITL p95 ms | tok/s | reasoning runs | note |\n'
	printf '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
	jq -rs 'sort_by([-.successRate, (.firstPartP50 // 1e18)]) | to_entries[] | .key as $i | .value |
		def r: if . == null then "n/a" else (. * 100 | round / 100 | tostring) end;
		"| \($i + 1) | \(.provider)/\(.model) | \(.n) | \(.successRate * 100 | round)% | \(.firstPartP50 | r) | \(.firstPartP95 | r) | \(.itlP95 | r) | \(.tokPerS | r) | \(.reasoningRuns) | \(if .successRate == 0 then "NO-ANSWER" elif .firstPartP95 == null or .firstPartP95 > 90000 then "NOT-FIRST (p95 > 90 s or n/a)" else "" end) |"' "$WORK/rows"
} >"$OUT"
echo "wrote $OUT" >&2
