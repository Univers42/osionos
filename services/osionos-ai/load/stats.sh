#!/bin/sh
# Samples docker stats for all ai-load-* containers every STATS_INTERVAL seconds.
# usage: sh load/stats.sh [output.jsonl]
set -eu

OUT="${1:-/home/dlesieur/wt-ai-night/tmp/load-stats.jsonl}"
INTERVAL="${STATS_INTERVAL:-2}"

: > "$OUT"

while :; do
	ts=$(date +%s%3N)
	docker ps -q --filter name=ai-load- | while read -r cid; do
		docker stats --no-stream --format "{\"ts\":${ts},\"name\":\"{{.Name}}\",\"cpu\":\"{{.CPUPerc}}\",\"mem\":\"{{.MemUsage}}\"}" \
			"$cid" >> "$OUT" 2>/dev/null || true
	done
	sleep "$INTERVAL"
done