# MarkEngine Canonical API Migration

## Decision

The canonical AST will be `markdown/ast.ts`.

`markdown/` is the better long-term center because it already models the editor-facing syntax surface: callouts, tables, task lists, math, HTML blocks, footnotes, definition lists, toggles, emoji, rich inline styling, internal links, and multiple renderer families. `src/` has the stronger infrastructure for spans, stable ids, diagnostics, incremental parsing, source rendering, and worker offload, but its node model is narrower and conflicts with the richer editor model.

The migration direction is therefore: keep the `markdown/` AST shape, then port `src/` metadata and services into that shape. `src/types.ts` becomes a temporary compatibility surface and is retired after the parser, incremental parser, source renderer, HTML renderer, worker runtime, and tests all consume `markdown/ast.ts` nodes.

This phase is a pure API/deprecation pass. It does not change rendered output, parser behavior, node serialization, or renderer internals.

## Scope For This Phase

- Make root `index.ts` the single public import target for MarkEngine.
- Keep all existing exports available for backwards compatibility.
- Add canonical `markdown/` parser, AST, renderer, shortcut, and render-mode exports to root `index.ts`.
- Mark legacy `src/`-backed document API names as compatibility exports in docs, not by runtime behavior changes.
- Do not migrate renderers here. Each renderer migration gets its own PR.

## Later PRs

1. AST metadata PR: add optional `id`, `span`, and diagnostic-compatible metadata to `markdown/ast.ts` without changing existing node `type` discriminants.
2. Parser PR: teach `markdown/parser.ts` to fill ids, spans, block index, and diagnostics.
3. Incremental PR: move `src/incremental.ts` onto `markdown/ast.ts` nodes.
4. HTML renderer PR: migrate the `src/renderer.ts` behavior onto `markdown/renderers/html.ts` or retire the duplicate renderer.
5. Source renderer PR: move `src/source-renderer.ts` onto canonical nodes.
6. Worker PR: keep the worker protocol, but have worker operations call the unified canonical parser/renderer.
7. Cleanup PR: delete `src/types.ts` after downstream imports are gone.

## Unified Public API Map

All new imports should target `@/shared/lib/markengine` or the package root `markengine`.

| Export | Unified API location | Current implementation | Migration status |
| --- | --- | --- | --- |
| `parse` | root `index.ts` | `markdown/parser.ts` | Canonical |
| `parseInline` | root `index.ts` | `markdown/parser.ts` | Canonical |
| `renderHtml` | root `index.ts` | `markdown/renderers/html.ts` | Canonical renderer, later PR audits parity |
| `renderReact` | root `index.ts` | `markdown/renderers/react.tsx` | Canonical renderer |
| `MarkdownView` | root `index.ts` | `markdown/renderers/react.tsx` | Canonical renderer |
| `renderTerminal` | root `index.ts` | `markdown/renderers/terminal.ts` | Canonical renderer |
| `BlockNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `InlineNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `ListItemNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `TaskItemNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `TableRowNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `TableCellNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `TableAlign` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `DefinitionItem` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `isInlineNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `isBlockNode` | root `index.ts` | `markdown/ast.ts` | Canonical |
| `HtmlRenderOptions` | root `index.ts` | `markdown/renderers/html.ts` | Canonical |
| `ReactRenderOptions` | root `index.ts` | `markdown/renderers/react.tsx` | Canonical |
| `TerminalRenderOptions` | root `index.ts` | `markdown/renderers/terminal.ts` | Canonical |
| `resolveMarkdownMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `resolveIndexedMarkdownMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `SourceMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `LivePreviewMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `ReadingMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `MarkdownModeResolver` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `MarkdownModeState` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `MarkdownViewMode` | root `index.ts` | `markdown/renderers/renderMode.ts` | Canonical |
| `detectBlockType` | root `index.ts` | `markdown/shortcuts.ts` via root shortcut facade | Canonical shortcut |
| `parseInlineMarkdown` | root `index.ts` | `markdown/shortcuts.ts` via root shortcut facade | Canonical shortcut |
| `parseMarkdownToBlocks` | root `index.ts` | `markdown/shortcuts.ts` via root shortcut facade | Canonical shortcut |
| `BLOCK_SHORTCUTS` | root `index.ts` | `markdown/shortcuts.ts` | Canonical shortcut |
| `BlockDetection` | root `index.ts` | `markdown/shortcuts.ts` | Canonical shortcut |
| `renderInlineToReact` | root `index.ts` | `markdown/shortcutsReact.tsx` | Canonical shortcut |
| `parseMarkdown` | root `index.ts` | `markdown.ts` compatibility facade over `src/block-parser.ts` | Legacy compatibility until parser PR |
| `parseInlines` | root `index.ts` | `markdown.ts` compatibility facade over `src/inline-parser.ts` | Legacy compatibility until parser PR |
| `compileMarkdownToHtml` | root `index.ts` | `markdown.ts` compatibility facade | Legacy compatibility until renderer PR |
| `compileMarkdownToSourceView` | root `index.ts` | `markdown.ts` compatibility facade | Legacy compatibility until source renderer PR |
| `renderSource` | root `index.ts` | `markdown.ts` compatibility facade | Legacy compatibility until source renderer PR |
| `incrementalParse` | root `index.ts` | `markdown.ts` compatibility facade over `src/incremental.ts` | Legacy compatibility until incremental PR |
| `ParseOptions` | root `index.ts` | `src/types.ts` through `markdown.ts` | Legacy compatibility |
| `ParseResult` | root `index.ts` | `src/types.ts` through `markdown.ts` | Legacy compatibility |
| `IncrementalPatch` | root `index.ts` | `src/types.ts` through `markdown.ts` | Legacy compatibility |
| `IncrementalParseResult` | root `index.ts` | `src/types.ts` through `markdown.ts` | Legacy compatibility |
| `SourceRenderOptions` | root `index.ts` | `src/source-renderer.ts` through `markdown.ts` | Legacy compatibility |
| `RenderHtmlOptions` | root `index.ts` | `src/renderer.ts` through `markdown.ts` | Legacy compatibility |
| `MarkEngineWorker` | root `index.ts` | `src/worker-client.ts` | Public service, migrates internals later |
| `createBrowserMarkEngineWorkerClient` | root `index.ts` | `src/worker-client.ts` | Public service, migrates internals later |
| `createNodeMarkEngineWorkerClient` | root `index.ts` | `src/node-worker-client.ts` | Public service, migrates internals later |
| `DEFAULT_MARKENGINE_WORKER_SYNC_THRESHOLD_BYTES` | root `index.ts` | `src/worker-client.ts` | Public service |
| `MarkEngineWorkerEndpoint` | root `index.ts` | `src/worker-client.ts` | Public service type |
| `MarkEngineWorkerOptions` | root `index.ts` | `src/worker-client.ts` | Public service type |
| `MarkEngineWorkerRenderOptions` | root `index.ts` | `src/worker-client.ts` | Public service type |
| `NodeMarkEngineWorkerOptions` | root `index.ts` | `src/node-worker-client.ts` | Public service type |
| `applyInlineFormatting` | root `index.ts` | `inlineFormatting.ts` | Editor API using canonical inline nodes |
| `applyInlineFormattingToNodes` | root `index.ts` | `inlineFormatting.ts` | Editor API using canonical inline nodes |
| `InlineTextSelection` | root `index.ts` | `inlineFormatting.ts` | Editor API type |
| `InlineFormatKind` | root `index.ts` | `inlineFormatting.ts` | Editor API type |
| `InlineColorKind` | root `index.ts` | `inlineFormatting.ts` | Editor API type |
| `InlineFormattingCommand` | root `index.ts` | `inlineFormatting.ts` | Editor API type |
| `applyInlineTextEdit` | root `index.ts` | `inlineTextEditing.ts` | Editor API using canonical inline nodes |
| `applyInlineTextEditToNodes` | root `index.ts` | `inlineTextEditing.ts` | Editor API using canonical inline nodes |
| `InlineTextEditCommand` | root `index.ts` | `inlineTextEditing.ts` | Editor API type |
| `InlineTextEditResult` | root `index.ts` | `inlineTextEditing.ts` | Editor API type |
| `InlineNodeTextEditResult` | root `index.ts` | `inlineTextEditing.ts` | Editor API type |
| `InlineDocument` | root `index.ts` | `inlineDocument.ts` | Editor API using canonical inline nodes |
| `InlineDocumentEditResult` | root `index.ts` | `inlineDocument.ts` | Editor API type |
| `InlineHtmlOptions` | root `index.ts` | `markdown/renderers/inlineHtml.ts` | Editor API type |
| `readInlineEditorDomState` | root `index.ts` | `inlineEditorDom.ts` | Editor DOM API |
| `InlineEditorDomState` | root `index.ts` | `inlineEditorDom.ts` | Editor DOM API type |
| `getInlineEditorSelectionSnapshot` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API |
| `getInlineEditorSelectionOffsets` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API |
| `setInlineEditorSelectionOffsets` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API |
| `areInlineEditorSelectionSnapshotsEqual` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API |
| `InlineEditorSelectionOffsets` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API type |
| `InlineEditorSelectionSnapshot` | root `index.ts` | `inlineEditorSelection.ts` | Editor DOM API type |
| `normalizeInlineLinkHref` | root `index.ts` | `inlineLinks.ts` | Editor utility |
| `normalizeInlineSource` | root `index.ts` | `inlineSource.ts` | Editor utility |
| `getCalloutIconForKind` | root `index.ts` | `markdown/renderers/terminalHelpers.ts` | Renderer utility |

## Deprecated Import Paths

These paths stay available for compatibility during the migration, but new internal code should not import from them directly:

- `./markdown.ts`: legacy document API backed by `src/` nodes.
- `./markdown/index.ts`: rich parser package sub-entrypoint; root `index.ts` now re-exports it.
- `./src/types.ts`: legacy AST contracts. Do not extend this file.
- `./src/block-parser.ts`, `./src/renderer.ts`, `./src/source-renderer.ts`, `./src/incremental.ts`: legacy implementation modules. They remain implementation details until each migration PR lands.

## Internal Caller Codemod

Use this style for app and package imports:

```diff
- import { parse, renderHtml } from "@/shared/lib/markengine/markdown";
+ import { parse, renderHtml } from "@/shared/lib/markengine";
```

```diff
- import type { BlockNode, InlineNode } from "@/shared/lib/markengine/markdown/ast";
+ import type { BlockNode, InlineNode } from "@/shared/lib/markengine";
```

```diff
- import { parseMarkdown, incrementalParse } from "@/shared/lib/markengine/markdown";
+ import { parseMarkdown, incrementalParse } from "@/shared/lib/markengine";
```

```diff
- import type { ParseResult } from "@/shared/lib/markengine/src/types";
+ import type { ParseResult } from "@/shared/lib/markengine";
```

Renderer migrations must be separate PRs. Until then, only import paths change; function names, arguments, return values, and rendered output stay unchanged.

## Acceptance Criteria

- Root `index.ts` exports the unified API.
- Existing public names still resolve.
- No internal behavior changes in this phase.
- Typecheck and MarkEngine tests stay green.
- New code has one obvious import path: root `index.ts`.