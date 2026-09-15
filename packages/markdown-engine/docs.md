# MarkEngine API Reference

Public surface of the `markengine` package, re-exported from `index.ts`. Each
section below mirrors one export group and its usage example as documented
in the source.

## AST node types

Canonical rich Markdown AST node types: `BlockNode`, `DefinitionItem`,
`InlineNode`, `ListItemNode`, `TableAlign`, `TableCellNode`, `TableRowNode`,
`TaskItemNode`.

```ts
import type { BlockNode, InlineNode } from "markengine";
const inline: InlineNode = { type: "text", value: "Hello" };
const block: BlockNode = { type: "paragraph", children: [inline] };
```

## AST runtime guards

Runtime guards for validating rich Markdown AST nodes: `isBlockNode`,
`isInlineNode`.

```ts
import { isBlockNode } from "markengine";
if (isBlockNode(value)) console.log(value.type);
```

## Rich parser entry points

`parse` and `parseInline` are the rich Markdown parser entry points.

```ts
import { parse, parseInline } from "markengine";
const blocks = parse("# Title");
const inline = parseInline("**bold**");
```

## HTML renderer

`renderHtml` renders a parsed AST to HTML; `HtmlRenderOptions` configures it.

```ts
import { parse, renderHtml } from "markengine";
const html = renderHtml(parse("# Title"));
```

## React renderer

`renderReact` and the `MarkdownView` convenience component render AST
documents as React nodes; `ReactRenderOptions` configures the renderer.

```tsx
import { MarkdownView, renderReact } from "markengine";
const nodes = renderReact([{ type: "paragraph", children: [] }]);
const view = <MarkdownView markdown="# Title" />;
```

## Terminal renderer

`renderTerminal` renders AST documents to ANSI terminal text;
`TerminalRenderOptions` configures colorization.

```ts
import { parse, renderTerminal } from "markengine";
const text = renderTerminal(parse("# Title"));
```

## Render modes

Render mode classes and resolvers shared by source, preview, and reading
views: `LivePreviewMode`, `ReadingMode`, `SourceMode`, `resolveIndexedMarkdownMode`,
`resolveMarkdownMode`.

```ts
import { ReadingMode, resolveMarkdownMode } from "markengine";
const state = resolveMarkdownMode("reading") ?? new ReadingMode();
```

## Block shortcuts

Block shortcut detection and Markdown-to-block conversion helpers:
`BLOCK_SHORTCUTS`, `detectBlockType`, `parseInlineMarkdown`, `parseMarkdownToBlocks`.

```ts
import { detectBlockType, parseMarkdownToBlocks } from "markengine";
const detection = detectBlockType("# Title");
const blocks = parseMarkdownToBlocks("# Title");
```

`renderInlineToReact` is the React renderer for inline shortcut text.

```tsx
import { renderInlineToReact } from "markengine";
const children = renderInlineToReact("**bold**");
```

## Legacy `src/` API

The legacy parser, renderer, source-view, and incremental APIs:
`compileMarkdownToHtml`, `compileMarkdownToSourceView`, `incrementalParse`,
`parseInlines`, `parseMarkdown`, `renderSource`, `resolveIndexedModeState`,
`resolveModeState`.

```ts
import { compileMarkdownToHtml, incrementalParse, parseMarkdown } from "markengine";
const previous = parseMarkdown("# Title");
const next = incrementalParse("# Title", previous, { fromLine: 0, toLine: 0, text: "# Next" });
const compiled = compileMarkdownToHtml("# Next");
```

## Inline formatting and editing

`applyInlineFormatting` applies inline formatting commands to source strings
and rich inline AST nodes.

```ts
import { applyInlineFormatting } from "markengine";
const result = applyInlineFormatting("text", { start: 0, end: 4 }, { kind: "bold" });
```

`applyInlineTextEdit` applies inline text-editing commands the same way.

```ts
import { applyInlineTextEdit } from "markengine";
const result = applyInlineTextEdit("abc", { start: 1, end: 2, text: "B" });
```

`autoformatInlineMarkdown` drives live sugar-syntax autoformatting
(`**bold**`, `` `code` ``, …) as the user types.

## Inline document handle

`InlineDocument` is a mutable inline document handle for AST-backed editor
integrations.

```ts
import { InlineDocument } from "markengine";
const document = InlineDocument.fromSource("hello");
const html = document.toHtml();
```

`InlineHtmlOptions` configures the rich inline HTML renderer.

## Worker offload

Browser and Node worker clients offload parsing/rendering to a worker thread.

```ts
import { createBrowserMarkEngineWorkerClient } from "markengine";
const worker = createBrowserMarkEngineWorkerClient(new URL("./worker.js", import.meta.url));
```

```ts
import { createNodeMarkEngineWorkerClient } from "markengine";
const worker = createNodeMarkEngineWorkerClient();
```

## ContentEditable DOM helpers

`readInlineEditorDomState` reads DOM state for a contentEditable inline editor.

```ts
import { readInlineEditorDomState } from "markengine";
const state = readInlineEditorDomState(editorElement);
```

Selection snapshot helpers (`getInlineEditorSelectionOffsets`,
`setInlineEditorSelectionOffsets`, `getInlineEditorSelectionSnapshot`,
`areInlineEditorSelectionSnapshotsEqual`) save and restore caret position
across contentEditable re-renders.

```ts
import { getInlineEditorSelectionOffsets, setInlineEditorSelectionOffsets } from "markengine";
const offsets = getInlineEditorSelectionOffsets(editorElement);
if (offsets) setInlineEditorSelectionOffsets(editorElement, offsets);
```

## Links and URL sugar

`normalizeInlineLinkHref` normalizes a user-entered inline link target before
rendering or storing it.

```ts
import { normalizeInlineLinkHref } from "markengine";
const href = normalizeInlineLinkHref("example.com");
```

`isSingleBareUrl` and `bareUrlToLinkSource` turn a single bare URL into
`[hostname](url)` source; `containsBareUrlShape` gates live autolinking while
typing.

```ts
import { bareUrlToLinkSource, isSingleBareUrl } from "markengine";
const source = isSingleBareUrl(pasted) ? bareUrlToLinkSource(pasted) : pasted;
```

## Miscellaneous

`normalizeInlineSource` normalizes inline source text (line endings, etc.)
before editor parsing. `getCalloutIconForKind` resolves the terminal callout
icon for a callout kind.

```ts
import { getCalloutIconForKind } from "markengine";
const icon = getCalloutIconForKind("warning");
```
