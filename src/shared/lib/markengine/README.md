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
} from ".";

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

### Worker responsiveness

Large documents can move parse and render work off the main thread through a single `MarkEngineWorker`. The worker is intentionally not a pool: parsing one Markdown document is sequential, and editor integrations usually have one active document parse at a time.

```ts
import { createBrowserMarkEngineWorkerClient } from ".";

const engine = createBrowserMarkEngineWorkerClient(
  new URL("./src/browser-worker.js", import.meta.url),
  { syncThresholdBytes: 8 * 1024 },
);

const parsed = await engine.parse(markdownSource);
const html = await engine.renderHtml(parsed.ast, {}, {
  sourceByteLength: markdownSource.length,
});
```

Node integrations can use `createNodeMarkEngineWorkerClient()` from the same public API. Sources above the threshold are encoded into transferable `ArrayBuffer`s before posting to the worker. Documents below the threshold run synchronously because the worker round trip costs more than the parse.

This improves responsiveness, not throughput. A 1MB parse still costs CPU time, and end-to-end worker latency can include transfer plus structured-clone overhead; the win is that the main thread can keep handling input and paint. Run `npm run bench:worker-blocking` to compare main-thread timer delay for a 1MB parse on the main thread versus in `MarkEngineWorker`.

## Architecture notes

- [src/block-parser.ts](src/block-parser.ts) handles block structure.
- [src/inline-parser.ts](src/inline-parser.ts) handles inline syntax.
- [src/renderer.ts](src/renderer.ts) converts the AST to HTML.
- [src/incremental.ts](src/incremental.ts) applies patches and reports changed nodes.

For a deeper architecture overview, see [docs/Markdown_engine.md](docs/Markdown_engine.md).

## How to add a new block type

1. Add the typed AST shape in [src/types.ts](src/types.ts). Extend `BlockKind`, add a node interface with a precise `span`, and include that interface in the `BlockNode` union.
2. Teach [src/block-parser.ts](src/block-parser.ts) to recognize the block before the paragraph fallback. Keep detection local and deterministic: parse only from `cursor`, return the parsed node, `nextLine`, and diagnostics, then let `parseMarkdown` add it to the block index.
3. Preserve incremental parsing by making the new node span cover every source line it owns. [src/incremental.ts](src/incremental.ts) relies on those spans to choose the smallest safe reparse window.
4. Render the new node in [src/renderer.ts](src/renderer.ts) and, when source-view output needs special markup, in [src/source-renderer.ts](src/source-renderer.ts).
5. Add tests that cover detection, rendering, malformed input, and incremental edits around the new block. The CI gate requires at least 95% branch coverage for [src/block-parser.ts](src/block-parser.ts) and [src/inline-parser.ts](src/inline-parser.ts), so include both positive and fallback cases.
6. Run `npm run check`, `npm run coverage:parsers`, and `npm run bench:ci` before opening a PR. The quality gate fails on explicit `any`, unused internal exports, circular imports, missing public API examples, and parser coverage drops.
