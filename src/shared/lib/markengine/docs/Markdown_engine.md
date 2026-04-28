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

Incremental parsing is currently line-range based:

- apply the patch to the previous text
- reparse the document
- compare block index entries
- return changed node ids plus diagnostics

That is a pragmatic baseline for editor integration. It is not yet a fine-grained AST diff engine, but it is deterministic and easy to verify.

## Usage

```ts
import {
  compileMarkdownToHtml,
  incrementalParse,
  parseMarkdown,
} from "./markdown";

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
