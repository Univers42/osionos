# Stored page format

What a page holds in `osionos_pages.content`, for anyone writing through
`PATCH /api/pages/:id` or `POST /api/pages`. The source of truth is
`src/entities/block/model/types.ts`; this page is the short version.

## What the server enforces

`scripts/bridge-content-validation.mjs` answers `422` naming the first bad field:

- `content` of a page is an array of blocks
- each block is an object with a non-empty string `type`
- `block.content` is a string, or absent
- `block.children` is an array, or absent, at most 64 levels deep
- a `diagram` block's `diagramSpec.kind` is a known kind

It does **not** enforce the rest of this page. An unknown `type` with a sound
shape is stored on purpose, so a save from a newer client is never refused.
Validate your own output.

## A block

```json
{ "id": "b1", "type": "paragraph", "content": "Hello [b]world[/b]" }
```

| Field | Meaning |
| --- | --- |
| `id` | Stable string, unique in the page |
| `type` | One of the types below |
| `content` | Text in the inline dialect below |
| `children` | Nested blocks: toggles, lists, callouts, columns |
| `checked`, `dueAt` | `to_do` state; `dueAt` is `YYYY-MM-DD` |
| `language`, `fileName` | `code` blocks |
| `color` | `callout` type; it holds the callout's kind, not a CSS colour |
| `textColor`, `backgroundColor` | Block colours |
| `headingLevel` | Heading style inside a composed block, 1 to 6 |
| `widthRatio` | Relative width of a `column` |
| `tableData` | `table_block`: rows of cell strings |
| `diagramSpec` | `diagram`: the stored spec, never the rendered output |

## Block types

- Text: `paragraph`, `heading_1` to `heading_6`, `quote`, `callout`, `code`,
  `equation`, `divider`
- Lists: `bulleted_list`, `numbered_list`, `to_do`, `toggle`
- Media: `image`, `video`, `audio`, `file`, `embed`, `bookmark`
- Layout: `column_list`, `column`, `layout`
- Data: `table_block`, `database_inline`, `database_full_page`
- Other: `button`, `diagram`, `draw`, `whiteboard`, `graph_view`, `home_views`,
  `placeholder`

Columns nest: a `column_list` holds `column` children, each holding blocks.

```json
{ "id": "c", "type": "column_list", "content": "", "children": [
  { "id": "c1", "type": "column", "content": "", "widthRatio": 1, "children": [
    { "id": "t", "type": "paragraph", "content": "Left" }
  ] }
] }
```

## Inline dialect

`content` holds bracket tags, not HTML:

| Source | Renders as |
| --- | --- |
| `[b]x[/b]` | bold |
| `[i]x[/i]` | italic |
| `[s]x[/s]` | strikethrough |
| `[u]x[/u]` | underline |
| `[mark]x[/mark]` | highlight |
| `[code]x[/code]` | inline code |
| `[color=<value>]x[/color]` | text colour |
| `[bg=<value>]x[/bg]` | background colour |
| `[[page:<id>]]` | link to a page |

## Diagrams

`diagramSpec.kind` is `mermaid`, `schema`, `graph`, `hierarchy` or `pipeline`;
`src/features/diagram/model/diagramSpec.ts` holds each kind's fields.

```json
{ "id": "d", "type": "diagram", "content": "",
  "diagramSpec": { "kind": "mermaid", "source": "graph TD; A-->B" } }
```

## Folders

A folder is a page with `surface: "folder"`, not a block. `surface: "code"`
pages store one whole file as a single `code` block.

## Writing

`PATCH /api/pages/:id` with `baseVersion` answers `409 version_conflict` when the
page moved on since you read it: read again, then retry.

There is no server-side Markdown conversion yet.
