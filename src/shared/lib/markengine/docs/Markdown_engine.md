# Markdown Engine (TypeScript, AST-First)

This project now uses a modular, AST-first Markdown pipeline designed for speed and incremental updates.

## Goals

- Keep parsing linear and predictable.
- Separate responsibilities into small modules.
- Support partial re-parsing for interactive editing.
- Keep rendering independent from parsing.
- Reuse existing CSS themes for presentation.

## Architecture

The engine is split into four main passes/modules:

1. Block pass

- File: `src/block-parser.ts`
- Parses line stream into block nodes.
- Handles fences, headings, lists, blockquotes, paragraphs, thematic breaks.

2. Inline pass

- File: `src/inline-parser.ts`
- Character scanner for inline syntax.
- Handles emphasis, strong, code spans, links, text.
- Designed to avoid global regex backtracking behavior.

3. AST model

- File: `src/types.ts`
- Diff-friendly node schema with stable ids and source spans.
- Supports nested blocks (e.g. list in quote).

4. Renderer

- File: `src/renderer.ts`
- Converts AST to semantic HTML with node ids on elements.
- Output is style-agnostic and can use your CSS themes.

Incremental updates:

- File: `src/incremental.ts`
- Applies a line-range patch, reparses, and reports changed node ids.

Public API:

- File: `markdown.ts`
- Re-exports parser modules + provides `compileMarkdownToHtml`.

## AST Design

### Why this works for performance

Each node stores:

- `id`: stable hash-based id for diffing
- `kind`: node category
- `span`: line and offset coordinates in source

This allows focused updates:

- If one block changes, only affected node ids change.
- The renderer can update only matching DOM regions.

### Core node families

- Block nodes:
  - `paragraph`
  - `heading`
  - `code_block`
  - `list`
  - `list_item`
  - `blockquote`
  - `thematic_break`
- Inline nodes:
  - `text`
  - `emphasis`
  - `strong`
  - `code_span`
  - `link`

## Fast Parsing Strategy

### Two-pass model

1. Block segmentation pass:

- Detect block boundaries and block types in a single traversal.

2. Inline parsing pass:

- Parse only textual payload of block nodes.

### Complexity profile

- Full parse: approximately O(n) over input size.
- Incremental edit flow:
  - patch lines
  - reparse document
  - compare block index ids to detect changed blocks

This is a pragmatic baseline for interactive editors.

## Module Layout

- `markdown.ts`: public entry and convenience compile function
- `src/types.ts`: AST contracts and parse result types
- `src/utils.ts`: stable ids, escaping, line splitting helpers
- `src/block-parser.ts`: block-level parser
- `src/inline-parser.ts`: inline scanner parser
- `src/renderer.ts`: AST to HTML renderer
- `src/incremental.ts`: patch + incremental parse helpers

## Usage

```ts
import {
  parseMarkdown,
  renderHtml,
  compileMarkdownToHtml,
  incrementalParse,
} from "./markdown";

const source = `# Title\n\nA *fast* **AST** engine.`;

const parsed = parseMarkdown(source, { documentVersion: 1 });
const html = renderHtml(parsed.ast);

const compiled = compileMarkdownToHtml(source);

const next = incrementalParse(source, parsed, {
  fromLine: 2,
  toLine: 2,
  text: "A *very fast* **AST** engine.",
});
console.log(next.changedNodeIds);
```

## Styling

The renderer produces semantic HTML (`h1..h6`, `p`, `blockquote`, `ul/ol/li`, `pre/code`, `hr`, `a`, `em`, `strong`).

You can style output with:

- `theme.css`
- `covers/*.css`

Recommended workflow:

- Keep parser and renderer free of style logic.
- Apply CSS themes at the host app level.

## Next Steps

- Add nested list parsing by indentation depth.
- Add inline escape handling (`\*`, `\[`, etc.).
- Add table and callout block support.
- Add block-local incremental reparsing (only impacted ranges) for larger files.
- Add benchmark and golden-file tests for regression safety.
