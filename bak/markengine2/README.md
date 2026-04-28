# Markdown Engine

A compact Markdown engine built around a canonical `src/` implementation.

## What it provides

- Markdown parsing into a typed AST
- Semantic HTML rendering
- Incremental reparsing from line-range patches
- Diagnostics for malformed or out-of-bounds input

## Public API

The current entry point for the rich inline/editor helpers is [index.ts](index.ts).

Typical usage:

```ts
import {
  compileMarkdownToHtml,
  incrementalParse,
  parseMarkdown,
  renderHtml,
} from "./markdown";

const parsed = parseMarkdown("# Title\n\nA *fast* engine.", {
  documentVersion: 1,
});

const html = renderHtml(parsed.ast);
const compiled = compileMarkdownToHtml("# Title\n\nA *fast* engine.");

const next = incrementalParse("# Title\n\nA *fast* engine.", parsed, {
  fromLine: 2,
  toLine: 2,
  text: "A *very fast* engine.",
});
```

### Inline editor helpers

For `contentEditable` integrations, `markengine` also exposes:

- `parseInlineMarkdown(source)` to render canonical inline HTML
- `applyInlineFormatting(source, selection, command)` to mutate inline content on the AST
- `readInlineEditorDomState(root)` to convert editor DOM back into canonical source
- `getInlineEditorSelectionSnapshot(root)` / `getInlineEditorSelectionOffsets(root)` to read selection state
- `setInlineEditorSelectionOffsets(root, offsets)` to restore the browser selection
- `normalizeInlineLinkHref(href)` to normalize user-entered inline link targets

### Inline formatting architecture

The inline editor pipeline is intentionally split into small modules:

- [inlineFormatting.ts](inlineFormatting.ts) applies selection-based format commands on the inline AST.
- [inlineAst.ts](inlineAst.ts) owns AST splitting, normalization, serialization, and structural equality helpers.
- [inlineEditorDom.ts](inlineEditorDom.ts) converts `contentEditable` DOM back into canonical inline source.
- [inlineEditorDomFormatting.ts](inlineEditorDomFormatting.ts) isolates DOM formatting detection and canonical-element checks.
- [inlineTextStyles.ts](inlineTextStyles.ts) centralizes inline color normalization and UI-facing color presets.
- [markdown/renderers/inlineStyleHelpers.ts](markdown/renderers/inlineStyleHelpers.ts) shares inline style semantics across HTML, inline HTML, and React renderers.

This split keeps the editor responsibilities separate:

- DOM reading is independent from AST mutation.
- AST mutation is independent from rendering.
- Shared inline styling semantics live in one place instead of being repeated across renderers.

### Performance notes

- `inlineFormatting.ts` compares AST selections structurally instead of serializing them with `JSON.stringify`, avoiding extra allocations on repeated formatting operations.
- Shared inline style helpers reduce duplicated per-render style construction logic across renderer implementations.

## Architecture notes

- [src/block-parser.ts](src/block-parser.ts) handles block structure.
- [src/inline-parser.ts](src/inline-parser.ts) handles inline syntax.
- [src/renderer.ts](src/renderer.ts) converts the AST to HTML.
- [src/incremental.ts](src/incremental.ts) applies patches and reports changed nodes.

For a deeper architecture overview, see [docs/Markdown_engine.md](docs/Markdown_engine.md).
