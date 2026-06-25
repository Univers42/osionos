#!/usr/bin/env bash
# check-style-tokens.sh — guard that app-authored style surfaces stay
# token-driven (no raw hex/rgb colour literals). Colour VALUES live only in the
# token-definition files under src/app/styles/** (notably global.css); every
# other CSS/SCSS surface must reference var(--osio-*). Dependency-free (no
# stylelint) to respect the repo's locked-down supply chain. Wired into
# `npm run test:quality`. Run standalone: bash scripts/check-style-tokens.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Scan ALL app-authored CSS/SCSS, EXCLUDING:
#   - src/app/styles/**   token-definition files (global.css holds the canonical
#                         hex/rgba values, incl. the graph-engine/canvas blocks)
#   - vendored trees      notion-database-sys & lib/markengine (own quality gates)
mapfile -d '' FILES < <(
  find src \
    \( -path 'src/app/styles' \
       -o -path 'src/shared/notion-database-sys' \
       -o -path 'src/shared/lib/markengine' \) -prune \
    -o -type f \( -name '*.css' -o -name '*.scss' \) -print0
)

# Raw colour literals: #rgb/#rrggbb or rgb()/rgba(). color-mix(... var(--osio))
# is fine (it references tokens). We flag a bare #hex or an rgb()/rgba() with
# numeric channels (i.e. not referencing a token).
fail=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  hits=$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\([0-9]' "$f" || true)
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
