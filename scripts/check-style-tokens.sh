#!/usr/bin/env bash
# check-style-tokens.sh — guard that the app-authored style surfaces stay
# token-driven (no raw hex/rgb color literals). Colour VALUES live only in the
# token-definition file (src/app/styles/global.css); everything else must
# reference var(--osio-*). Dependency-free (no stylelint) to respect the repo's
# locked-down supply chain. Run: bash scripts/check-style-tokens.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Files that must be 100% token-driven (component/feature CSS we restyled).
FILES=(
  src/pages/notion-page/ui/notionPage.css
  src/widgets/page-renderer/ui/homeVariants.css
  src/pages/trash-view/ui/trashView.css
  src/widgets/page-toc/PageOutlineRail.module.css
  src/features/page-management/ui/PageOptionsMenu.module.css
  src/features/page-management/ui/PageOptionsMenu.module.scss
  src/features/page-management/ui/MovePageModal.module.css
  src/features/page-management/ui/MovePageModal.module.scss
)

# Raw colour literals: #rgb/#rrggbb or rgb()/rgba(). color-mix(... var(--osio)) is
# fine (it references tokens). We flag a bare #hex or an rgb()/rgba() with numeric
# channels (not referencing a token).
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
  echo "✓ style-token check passed: all guarded CSS surfaces are token-driven."
fi
exit "$fail"
