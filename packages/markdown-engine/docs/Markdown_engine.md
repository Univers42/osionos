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

## Syntax coverage (rich `markdown/` engine)

The canonical `markdown/` parser covers CommonMark + GFM plus the common
extended-syntax additions. `tests/parity-reference-syntax.test.cjs` is the
executable version of this list.

**Inline** — emphasis in every combination (`*` `**` `***` and 4+ runs, which
nest — there is no 4th style; partial closes pair like CommonMark:
`***a** b*` → *em(strong(a) b)*; surplus opener marks stay outside as literal
text); strikethrough `~~x~~`; highlight `==x==` / `<mark>`; subscript `~x~` /
`<sub>`; superscript `^x^` / `<sup>`; `<kbd>`; spoiler `||x||`; inline code
(multi-backtick, binds tighter than emphasis); math `$x$`; links (inline with
title, angle autolinks, mailto, bare-URL-on-space with hostname label,
reversed `(text)[url]` sugar, reference `[text][label]` / collapsed `[text][]`
/ `![alt][label]`); images (+ `data:image/*`); footnote refs `[^1]`; emoji
`:name:`; `[[page:id]]` internal links; `[color=]`/`[bg=]`/`[code]`/`[b]`…
editor tags; hard breaks (two-space, backslash, `<br>`); backslash escapes for
all ASCII punctuation; paired inline HTML (`<b>` `<i>` `<em>` `<strong>`
`<del>` `<s>` `<u>` `<ins>`) maps to the same nodes as the sugar; HTML
comments vanish.

**Block** — ATX headings (trailing `#`s, `{#custom-id}`), setext headings,
paragraphs, blockquotes (nested, with full blocks inside), GitHub alerts /
callouts `> [!NOTE]`, toggles (`> [toggle]`, `#>`), fenced code (backtick or
tilde, close fence ≥ open length so 4-backtick fences nest 3-backtick
content), indented code, `$$` and ```` ```math ```` math blocks, HTML blocks,
`<!-- -->` comment blocks (silent), tables (alignment, `\|` cell escapes),
ordered (`.` and `)`, arbitrary start) / unordered / task lists with nesting,
thematic breaks, footnote definitions, definition lists (`Term` + `: def`),
YAML/TOML front matter (`---`/`+++` at the top; renders nothing), and
link-reference definitions (collected document-wide, lines dropped — which
also makes the `[//]: # (comment)` idiom invisible).

**App blocks (Notion-system dialect)** — every editor block type now has a
markengine-native serialized form, so raw-mode, export, and clipboard are
lossless end to end: media as HTML blocks (`![alt](asset "caption")` image
paragraphs, `<video src>`/`<audio src>`/`<object data title>`), drawings as
```` ```osidraw h=<px> ```` fences (scene JSON body), buttons and app embeds as
```` ```osibutton / ```osidb / ```osidb-page / ```osigraph / ```osihome /
```osilayout ```` fences carrying their config as JSON (malformed JSON stays a
visible code block — never data loss), and column layouts as Pandoc-style
containers: `:::columns` wrapping `:::column <widthRatio>` blocks, closed by
bare `:::`. Unknown container kinds flatten to their children; foreign HTML
blocks become `html` code blocks instead of vanishing.

**Reliability** — the block parser carries a hard progress guarantee (a parser
returning without consuming input degrades to skipping one line instead of
looping forever), and `tests/fuzz-reliability.test.cjs` pins it: 400 seeded
fuzz documents through parse + every renderer without a throw, canonical
inline serialization converges to a fixed point, and the editor's char-by-char
autoformat loop always terminates.

### Dialect pins (deliberate deviations)

- `__x__` is **underline**, not bold — the editor's only underline sugar;
  `___x___` is still bold+italic. Pinned by `tests/canvas/inline-mark-stacking.test.ts`.
- Bare URLs autolink **on space** with a hostname label (typing a URL never
  collapses under the caret).
- Wikilinks are the `[[page:id]]` form only; generic `[[Name]]` is not parsed.
- Mentions (`@user`), issue refs (`#123`), and Pandoc attributes are left to
  the app layer.

## Design Direction

The next steps for the engine are:

- deeper malformed-input diagnostics
- stronger inline recovery
- more regression coverage for edge cases
- a cleaner adapter layer for future output targets

The current baseline intentionally favors clarity and correctness over feature breadth.
