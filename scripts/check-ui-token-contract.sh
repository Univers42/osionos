#!/bin/sh
# ************************************************************************** #
#                                                                            #
#                                                        :::      ::::::::   #
#   check-ui-token-contract.sh                         :+:      :+:    :+:   #
#                                                    +:+ +:+         +:+     #
#   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        #
#                                                +#+#+#+#+#+   +#+           #
#   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             #
#   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       #
#                                                                            #
# ************************************************************************** #
#
# The host half of the @osionos/ui token contract.
#
# The kit declares, in packages/osionos-ui/tokens.css, every --osio-* custom
# property it reads. THIS app chooses not to import that file — global.css owns
# the palette across 2 themes and 7 palettes. That is a deliberate choice, and
# it is exactly why it needs a guard: rename a token in global.css and the kit
# keeps compiling, keeps passing tests, and silently renders with the CSS
# initial value.
#
# The package's own scripts/check-token-contract.mjs proves the contract matches
# the kit's SOURCE. This proves the HOST satisfies it. Both halves are needed.
#
# Dependency-free POSIX sh, same idiom as check-style-tokens.sh.

set -eu

CONTRACT="${1:-packages/osionos-ui/tokens.css}"
GLOBAL_CSS="${2:-src/app/styles/global.css}"

for file in "$CONTRACT" "$GLOBAL_CSS"; do
	[ -f "$file" ] || { printf 'check-ui-token-contract: missing %s\n' "$file" >&2; exit 1; }
done

# Token names the kit requires, one per line.
required=$(sed -n 's/^[[:space:]]*\(--osio-[a-zA-Z0-9-]*\)[[:space:]]*:.*/\1/p' "$CONTRACT" | sort -u)
[ -n "$required" ] || { printf 'check-ui-token-contract: no tokens found in %s\n' "$CONTRACT" >&2; exit 1; }

# Token names the host defines anywhere (any theme or palette block will do —
# a token defined only under [data-theme=dark] still resolves at runtime).
defined_list=$(mktemp)
trap 'rm -f "$defined_list"' EXIT INT TERM
sed -n 's/^[[:space:]]*\(--osio-[a-zA-Z0-9-]*\)[[:space:]]*:.*/\1/p' "$GLOBAL_CSS" | sort -u > "$defined_list"

missing=$(printf '%s\n' "$required" | grep -vxF -f "$defined_list" || true)

if [ -n "$missing" ]; then
	printf '\n✗ @osionos/ui token contract violated — required by the kit, undefined in %s:\n\n' "$GLOBAL_CSS" >&2
	printf '%s\n' "$missing" | sed 's/^/  /' >&2
	printf '\nDefine them in global.css, or stop reading them in the kit.\n' >&2
	exit 1
fi

count=$(printf '%s\n' "$required" | wc -l | tr -d ' ')
printf '✓ ui token contract holds: all %s --osio-* tokens required by @osionos/ui are defined in %s\n' \
	"$count" "$GLOBAL_CSS"
