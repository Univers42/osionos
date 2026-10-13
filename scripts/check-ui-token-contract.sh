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
# property it reads. THIS app chooses not to import that file — its own
# stylesheets own the palette (global.css, and tokens.generated.css for the
# colours that are generated from seeds). That is a deliberate choice, and it
# is exactly why it needs a guard: rename a token there and the kit keeps
# compiling, keeps passing tests, and silently renders with the CSS initial
# value.
#
# Usage: check-ui-token-contract.sh [contract.css [host.css ...]]
#
# The package's own scripts/check-token-contract.mjs proves the contract matches
# the kit's SOURCE. This proves the HOST satisfies it. Both halves are needed.
#
# Dependency-free POSIX sh, same idiom as check-style-tokens.sh.

set -eu

CONTRACT="${1:-packages/osionos-ui/tokens.css}"
if [ "$#" -ge 2 ]; then
	shift
else
	set -- src/app/styles/global.css src/app/styles/tokens.generated.css
fi

for file in "$CONTRACT" "$@"; do
	[ -f "$file" ] || { printf 'check-ui-token-contract: missing %s\n' "$file" >&2; exit 1; }
done

# Token names the kit requires, one per line.
required=$(sed -n 's/^[[:space:]]*\(--osio-[a-zA-Z0-9-]*\)[[:space:]]*:.*/\1/p' "$CONTRACT" | sort -u)
[ -n "$required" ] || { printf 'check-ui-token-contract: no tokens found in %s\n' "$CONTRACT" >&2; exit 1; }

# Token names the host defines anywhere (any theme or palette block will do —
# a token defined only under [data-theme=dark] still resolves at runtime).
defined_list=$(mktemp)
trap 'rm -f "$defined_list"' EXIT INT TERM
sed -n 's/^[[:space:]]*\(--osio-[a-zA-Z0-9-]*\)[[:space:]]*:.*/\1/p' "$@" | sort -u > "$defined_list"

missing=$(printf '%s\n' "$required" | grep -vxF -f "$defined_list" || true)

if [ -n "$missing" ]; then
	printf '\n✗ @osionos/ui token contract violated — required by the kit, undefined in %s:\n\n' "$*" >&2
	printf '%s\n' "$missing" | sed 's/^/  /' >&2
	printf '\nDefine them in the host stylesheets, or stop reading them in the kit.\n' >&2
	exit 1
fi

count=$(printf '%s\n' "$required" | wc -l | tr -d ' ')
printf '✓ ui token contract holds: all %s --osio-* tokens required by @osionos/ui are defined in %s\n' \
	"$count" "$*"
