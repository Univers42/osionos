# Markdown Engine

This repository contains a small Markdown engine centered on a canonical `src/` implementation. The goal is maintainability first: a clear parser boundary, a typed AST, predictable incremental updates, and a renderer that stays independent from parsing.

## Current Architecture

The runtime path is split into these layers:

1. Parser core

- [src/block-parser.ts](../src/block-parser.ts): block-level parsing and block assembly.
- [src/inline-parser.ts](../src/inline-parser.ts): inline tokenization and nesting.
- [src/types.ts](../src/types.ts): AST, result, span, and diagnostic contracts.

2. Renderer

- [src/renderer.ts](../src/renderer.ts): converts the AST to semantic HTML.
- Rendering stays pure and consumes the AST only; it does not re-parse input.

3. Incremental updates

- [src/incremental.ts](../src/incremental.ts): applies line-range patches, reparses, and reports changed node ids plus diagnostics.

4. Public API

- [markdown.ts](../markdown.ts): facade for consumers.

## AST Contract

Each document parse returns a `DocumentNode` with:

- `id`: stable document id
- `kind`: `document`
- `version`: caller-supplied document version
- `children`: block nodes
- `span`: source coordinates

Block and inline nodes also carry:

- `id`: stable node id for diffing and incremental updates
- `kind`: node category
- `span`: source coordinates

Parse results also include:

- `blockIndex`: block spans for incremental diffing
- `diagnostics`: warnings/errors for malformed or ambiguous input

## Parsing Strategy

The parser uses a straightforward staged approach:

1. Identify block boundaries.
2. Parse structural block nodes.
3. Parse inline content inside textual blocks.

This keeps the implementation easier to reason about than a large monolithic dispatcher and gives us a clean place to add validation and recovery later.

## Incremental Updates

Incremental parsing is block-range based:

- apply the line patch to the previous text
- find the blocks intersecting the edit range
- expand to stable block boundaries, currently blank lines, headings, and fenced-code boundaries
- reparse only that bounded line window
- splice the parsed blocks into the existing top-level block list
- keep unchanged downstream blocks as-is when line numbers do not shift
- reparse downstream blocks only when an insertion or deletion shifts line-number-based ids and spans

Parsed blocks in the edited window are cached by source hash plus starting line. This lets unchanged boundary blocks be reused when the edit sits next to, but does not alter, those blocks.

The incremental parser deliberately falls back to a full parse when correctness could depend on wider document context:

- the patch text contains a structural delimiter: <code>```</code>, `$$`, or `---`
- the previous parse contains an unterminated fenced code block touched by the patch
- the chosen reparse window would produce a block that crosses the stable lower boundary

`changedNodeIds` reports the ids of inserted or structurally changed blocks in the spliced region. Pure downstream line shifts are not reported as structural changes.

`incrementalParse` is O(edit-window) for parsing work and O(document) for text/result assembly. In the Phase 2 closeout probe, one-line typing stayed roughly linear at about 0.07-0.09 ms per 1K document lines through 200K lines; at 50K lines the dominant cost was patch application plus line splitting, followed by complete `children` and `blockIndex` handoff. This is expected while the public contract accepts and returns whole strings plus a complete AST.

## Usage

```ts
import {
  compileMarkdownToHtml,
  incrementalParse,
  parseMarkdown,
} from "..";

const parsed = parseMarkdown("# Title\n\nA *fast* engine.", {
  documentVersion: 1,
});

const compiled = compileMarkdownToHtml("# Title\n\nA *fast* engine.");

const next = incrementalParse("# Title\n\nA *fast* engine.", parsed, {
  fromLine: 2,
  toLine: 2,
  text: "A *very fast* engine.",
});
```

## Design Direction

The next steps for the engine are:

- deeper malformed-input diagnostics
- stronger inline recovery
- more regression coverage for edge cases
- a cleaner adapter layer for future output targets

The current baseline intentionally favors clarity and correctness over feature breadth.
