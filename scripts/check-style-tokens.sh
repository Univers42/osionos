#!/usr/bin/env bash
# check-style-tokens.sh — guard that app-authored style surfaces stay
# token-driven (no raw colour literals). Colour VALUES live only in the
# token-definition files under src/app/styles/** (notably global.css); every
# other CSS/SCSS surface must reference var(--osio-*). Dependency-free (no
# stylelint) to respect the repo's locked-down supply chain. Wired into
# `npm run test:quality`. Run standalone: bash scripts/check-style-tokens.sh
# An optional directory argument replaces src/ (the guard's own test uses it).
#
# Ponytail: a line-based regex, not a CSS parser. It misses named colours
# (red, white) and a function whose first channel sits on the next line, and
# it flags an id selector made only of hex digits (#fade). Rename such a
# selector; a real colour value belongs in src/app/styles/**, which is not
# scanned.
set -euo pipefail
ROOT="${1:-src}"
if [ -z "${1:-}" ]; then
  cd "$(dirname "$0")/.."
fi

# Scan ALL app-authored CSS/SCSS, EXCLUDING:
#   - src/app/styles/**   token-definition files (global.css holds the canonical
#                         hex/rgba values, incl. the legacy-graph-engine/canvas blocks)
#   - vendored trees      notion-database-sys & lib/markengine (own quality gates)
mapfile -d '' FILES < <(
  find "$ROOT" \
    \( -path 'src/app/styles' \
       -o -path 'src/shared/notion-database-sys' \) -prune \
    -o -type f \( -name '*.css' -o -name '*.scss' \) -print0
)

# Raw colour literals: a bare #hex, or a colour function whose first channel is
# a number — rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() — or color()
# in a named space. color-mix(... var(--osio)) and oklch(from var(--osio) ...)
# are fine: they are built from tokens.
LITERAL='#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([[:space:]]*[0-9.]|\bcolor\([[:space:]]*(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz)'
fail=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  hits=$(grep -nE "$LITERAL" "$f" || true)
  if [ -n "$hits" ]; then
    echo "✗ raw colour literal(s) in $f (use var(--osio-*)):"
    echo "$hits" | sed 's/^/    /'
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "✓ style-token check passed: all app CSS/SCSS surfaces are token-driven."
fi
exit "$fail"
