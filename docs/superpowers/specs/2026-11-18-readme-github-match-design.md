# README looks like GitHub's — design

Status: 2026-11-18, on `feat/readme-github-match` (base `2ec663c8e`). Binding ruling: groot
ADR 0058 U3 and U4. Companion to `2026-11-17-profile-page-design.md`.

## Unit A — native blocks (landable alone)

- In: a paragraph whose content holds inline images, e.g. a badge row
  `[![x](img)](url) [![y](img)](url)`.
- Out: the images flow in one row (same top offset), as on GitHub. Image *blocks* and media
  blocks are untouched.
- Why it broke: Tailwind preflight sets `img { display: block }`, and the engine emits a bare
  `<img>` (`reactHelpers.tsx:271`, `inlineHtml.ts:158`). The engine is not edited (LP18/LP24).
- Fix: one host CSS rule scoped to the class `osio-inline-content`, put on the two places that
  render inline markdown of a paragraph: `EditableContent` (editor) and the read-only `<p>`.
- Also: in the README only (`.osio-readme`, set by `ReadmeBlocks`), a rectangular image block is
  drawn without its border and radius, as on GitHub. Circle pictures and image blocks on normal
  pages keep their frame. Not done: centring a banner. The block carries no alignment data and
  none is invented.
- A wide README table already scrolls inside its own container: `ReadOnlyBlock` passes no
  `wideBlock` in the profile, so `TableBlockReadOnly` uses its `overflow-x-auto` box, inside a
  `min-w-0` grid column (`ProfileShell.tsx`). Read from code, not measured in a browser.
- Done when: the fixture `tests/fixtures/profile/readme.omd` parses (24 images) and round-trips;
  a Playwright spec shows two inline images at one top offset while an image block is unchanged,
  and another shows the README image block unframed while the same block on a page is framed.

## Unit B — markdown preview (built; landing waits for the devil re-ruling)

- In: a `code` block with `language === "markdown"` AND `codeView === "preview"`.
- Out: its content rendered by the engine HTML subset (`parse(.., { htmlSubset: true })`).
  An absent flag, or `"source"`, shows escaped source exactly as today (U4-2, U4-4).
- One call site (U4-3): `src/entities/block/ui/MarkdownSubsetPreview.tsx` is the only file in
  `src/` that passes `htmlSubset`; the read-only view, the editor preview and therefore the
  README (which renders through the read-only view) all use it. `scripts/check-readme-subset-call-site.sh`
  enforces it and runs in `quality`.
- The editor reuses mermaid's Source/Preview toggle; for markdown the default is source.
- Never `dangerouslySetInnerHTML`; remote images keep `loading=lazy`, `decoding=async`,
  `referrerPolicy=no-referrer`, no `crossOrigin`, no `srcset` (U3-7, asserted on the preview DOM).

## Does NOT do

Paste offer (U4-6), size warning (U4-7), CSP (U3-8), disclosure UI (U3-9), any engine change or
pin move, any new tag or attribute, any variable expansion in attributes.
