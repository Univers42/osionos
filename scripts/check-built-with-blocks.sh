#!/usr/bin/env bash
# ************************************************************************** #
#                                                                            #
#                                                        :::      ::::::::   #
#   check-built-with-blocks.sh                         :+:      :+:    :+:   #
#                                                    +:+ +:+         +:+     #
#   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        #
#                                                +#+#+#+#+#+   +#+           #
#   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             #
#   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       #
#                                                                            #
# ************************************************************************** #
#
# Ratchet over the raw UI elements and token-class uses in the settings tree.
# Counts <button, <input, <select, <textarea, <table and `[var(--osio-` over
# *.tsx under the given dir (default src/features/settings) and compares them
# to the ratchet file (default scripts/built-with-blocks.ratchet.json). The
# build fails when a count rises (new raw element) or falls (stale ratchet).
#
# Usage: check-built-with-blocks.sh [dir] [ratchet] [--print]
#   --print  writes the current counts as JSON to stdout and exits 0.
#
# Caveat: this is a plain text match, so a `<button` inside a comment or a
# string still counts (over-reports), and raw elements hidden behind a
# component that lives outside the counted dir are not seen (by design:
# @osionos/ui owns those). The ratchet therefore ratchets text, not semantics.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Separate flags from positional args so --print can land anywhere.
positional=()
print=0
for arg in "$@"; do
	case "$arg" in
		--print) print=1 ;;
		*) positional+=("$arg") ;;
	esac
done

dir="${positional[0]:-src/features/settings}"
ratchet="${positional[1]:-scripts/built-with-blocks.ratchet.json}"

# Defaults are repo-root relative; make them resolve when invoked bare.
if [ "${#positional[@]}" -eq 0 ]; then
	cd "$ROOT_DIR"
fi

if [ ! -d "$dir" ]; then
	printf 'check-built-with-blocks: no such directory %s\n' "$dir" >&2
	exit 1
fi

count_pattern() {
	local pattern="$1" target="$2"
	# BusyBox grep (the container) has no --include, so select *.tsx via find.
	( find "$target" -type f -name '*.tsx' -exec grep -hoE "$pattern" {} + 2>/dev/null || true ) | wc -l | tr -d '[:space:]'
}

rawButton="$(count_pattern '<button' "$dir")"
rawInput="$(count_pattern '<input' "$dir")"
rawSelect="$(count_pattern '<select' "$dir")"
rawTextarea="$(count_pattern '<textarea' "$dir")"
rawTable="$(count_pattern '<table' "$dir")"
tokenClass="$(count_pattern '\[var\(--osio-' "$dir")"

if [ "$print" -eq 1 ]; then
	printf '{\n  "rawButton": %s,\n  "rawInput": %s,\n  "rawSelect": %s,\n  "rawTextarea": %s,\n  "rawTable": %s,\n  "tokenClass": %s\n}\n' \
		"$rawButton" "$rawInput" "$rawSelect" "$rawTextarea" "$rawTable" "$tokenClass"
	exit 0
fi

if [ ! -f "$ratchet" ]; then
	printf 'check-built-with-blocks: missing ratchet %s\n' "$ratchet" >&2
	exit 1
fi

# Read the allowed counts from the ratchet JSON.
mapfile -t allowed < <(node -e '
	const fs = require("fs");
	const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
	for (const k of ["rawButton","rawInput","rawSelect","rawTextarea","rawTable","tokenClass"]) {
		process.stdout.write(String(r[k] ?? 0) + "\n");
	}
' "$ratchet")

keys=(rawButton rawInput rawSelect rawTextarea rawTable tokenClass)
counts=("$rawButton" "$rawInput" "$rawSelect" "$rawTextarea" "$rawTable" "$tokenClass")

fail=0
for i in "${!keys[@]}"; do
	key="${keys[$i]}"
	count="${counts[$i]}"
	allowed_count="${allowed[$i]}"
	if [ "$count" -gt "$allowed_count" ]; then
		printf '%s: %s > %s\n' "$key" "$count" "$allowed_count"
		fail=1
	elif [ "$count" -lt "$allowed_count" ]; then
		printf '%s: %s < %s — lower the ratchet\n' "$key" "$count" "$allowed_count"
		fail=1
	fi
done

if [ "$fail" -ne 0 ]; then
	exit 1
fi

printf '✓ built-with-blocks\n'
exit 0