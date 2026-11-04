#!/usr/bin/env bash
# ************************************************************************** #
#                                                                            #
#                                                        :::      ::::::::   #
#   vendor-hydrawn-board.sh                            :+:      :+:    :+:   #
#                                                    +:+ +:+         +:+     #
#   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        #
#                                                +#+#+#+#+#+   +#+           #
#   Created: 2026/11/04 00:00:00 by dlesieur          #+#    #+#             #
#   Updated: 2026/11/04 00:00:00 by dlesieur         ###   ########.fr       #
#                                                                            #
# ************************************************************************** #
#
# Copies hydrawn's built board library (@hydrawn/board, packages/board/dist) into
# vendor/hydrawn-board/ and records the hydrawn commit it came from in VERSION.
#
# Vendored as built files because building it needs the Rust/WASM toolchain, which
# osionos does not carry. index.d.ts there is osionos' own and is kept.
#
# Usage: vendor-hydrawn-board.sh <hydrawn checkout, built with
#        `pnpm --filter @hydrawn/board build`>

set -euo pipefail

hydrawn="${1:?usage: vendor-hydrawn-board.sh <hydrawn checkout>}"
dist="${hydrawn}/packages/board/dist"
here="$(cd "$(dirname "$0")/.." && pwd)"
target="${here}/vendor/hydrawn-board"

[ -f "${dist}/index.js" ] || { echo "no ${dist}/index.js: build the library first" >&2; exit 1; }
[ -f "${dist}/draw_engine_bg.wasm" ] || { echo "no engine .wasm in ${dist}" >&2; exit 1; }
if [ -n "$(git -C "${hydrawn}" status --porcelain -- packages apps/web/src engine)" ]; then
	echo "${hydrawn} has uncommitted changes under the library's sources" >&2
	exit 1
fi

sha="$(git -C "${hydrawn}" rev-parse HEAD)"
engine="$(git -C "${hydrawn}" rev-parse HEAD:engine)"

find "${target}" -mindepth 1 ! -name index.d.ts ! -name README.md -delete 2>/dev/null || true
mkdir -p "${target}"
cp -R "${dist}/." "${target}/"
# The library's stylesheet ships inside index.js as `boardCss`; the file is not used here.
rm -f "${target}/index.css"
printf 'hydrawn %s\nengine %s\n' "${sha}" "${engine}" >"${target}/VERSION"
echo "vendored @hydrawn/board from hydrawn ${sha} (engine ${engine})"
