#!/bin/sh
# One subset-renderer call site (ADR 0058 U4-3): the read-only view, the editor preview and the
# README must all render markdown through MarkdownSubsetPreview, so `htmlSubset:` is switched on
# in exactly that file under src/, and that file never injects markup.
#
# Caveat: a name grep. It misses an `htmlSubset` option built under another name
# (a spread, a renamed variable); review still has to catch that. It never reads comments
# for the key because the pattern needs the `htmlSubset:` colon.

set -eu

SITE="src/entities/block/ui/MarkdownSubsetPreview.tsx"
[ -f "$SITE" ] || { printf 'check-readme-subset-call-site: %s is missing\n' "$SITE" >&2; exit 1; }

# find + xargs, not grep --include: the quality container's grep is busybox and lacks it.
hits=$(find src \( -name '*.ts' -o -name '*.tsx' \) -print | xargs grep -lE "htmlSubset\??[[:space:]]*:" 2>/dev/null | sort || true)
if [ "$hits" != "$SITE" ]; then
	printf 'check-readme-subset-call-site: htmlSubset must be enabled only in %s, found:\n%s\n' "$SITE" "$hits" >&2
	exit 1
fi

if grep -n "dangerouslySetInnerHTML" "$SITE" >&2; then
	printf 'check-readme-subset-call-site: %s must not inject markup\n' "$SITE" >&2
	exit 1
fi

printf '✓ readme subset call site: one file (%s)\n' "$SITE"
