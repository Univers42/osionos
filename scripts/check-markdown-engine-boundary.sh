#!/bin/sh
# ************************************************************************** #
#                                                                            #
#                                                        :::      ::::::::   #
#   check-markdown-engine-boundary.sh                  :+:      :+:    :+:   #
#                                                    +:+ +:+         +:+     #
#   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        #
#                                                +#+#+#+#+#+   +#+           #
#   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             #
#   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       #
#                                                                            #
# ************************************************************************** #
#
# The markdown engine must not import the host app. `tsconfig.boundary.json`
# already kills "@/..." by clearing `paths`, but a real node_modules package
# (e.g. @univers42/ui-collection) still resolves, so tsc cannot see it. This
# gate is the lexical half. Dependency-free POSIX sh, same idiom as
# check-style-tokens.sh.

set -eu

ENGINE_ROOT="${1:-src/shared/lib/markengine}"

if [ ! -d "$ENGINE_ROOT" ]; then
	printf 'check-markdown-engine-boundary: no engine at %s\n' "$ENGINE_ROOT" >&2
	exit 1
fi

# Engine sources only — its own tests/bench/scripts/playground may use anything.
sources=$(find "$ENGINE_ROOT" \
	\( -path "$ENGINE_ROOT/tests" \
	-o -path "$ENGINE_ROOT/bench" \
	-o -path "$ENGINE_ROOT/scripts" \
	-o -path "$ENGINE_ROOT/playground" \
	-o -path "$ENGINE_ROOT/dist" \
	-o -path "$ENGINE_ROOT/coverage" \
	-o -path "$ENGINE_ROOT/node_modules" \) -prune -o \
	\( -name '*.ts' -o -name '*.tsx' \) -print)

[ -n "$sources" ] || { printf 'check-markdown-engine-boundary: no sources found\n' >&2; exit 1; }

status=0

report() {
	printf '\n✗ markdown-engine boundary violation — %s\n' "$1" >&2
	printf '%s\n' "$2" >&2
	status=1
}

# 1. Host-app alias imports.
hits=$(printf '%s\n' "$sources" | xargs grep -nE "from ['\"]@/" 2>/dev/null || true)
[ -n "$hits" ] && report "imports the host app via the '@/' alias" "$hits"

# 2. Host UI-kit (a real package, so tsc resolves it happily).
hits=$(printf '%s\n' "$sources" | xargs grep -nE "from ['\"]@univers42/" 2>/dev/null || true)
[ -n "$hits" ] && report "imports the host UI kit (@univers42/*)" "$hits"

# 3. Relative escapes above the engine root.
hits=$(printf '%s\n' "$sources" | xargs grep -nE "from ['\"]\.\./\.\./\.\./" 2>/dev/null || true)
[ -n "$hits" ] && report "escapes the engine root with ../../../" "$hits"

# 4. React outside the react entry point — the root barrel must stay loadable by
#    node --experimental-strip-types (see tests/canvas).
hits=$(printf '%s\n' "$sources" \
	| grep -vE "(^|/)(react\.tsx|shortcutsReact\.tsx|renderers/react\.tsx|renderers/reactHelpers\.tsx)$" \
	| xargs grep -nE "from ['\"]react(-dom)?['\"]" 2>/dev/null || true)
[ -n "$hits" ] && report "imports react outside the ./react entry point" "$hits"

if [ "$status" -eq 0 ]; then
	printf '✓ markdown-engine boundary clean: no host imports in %s\n' "$ENGINE_ROOT"
fi

exit "$status"
