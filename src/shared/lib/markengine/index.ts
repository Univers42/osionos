/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Canonical rich Markdown AST node types.
 *
 * @example
 * ```ts
 * import type { BlockNode, InlineNode } from "markengine";
 * const inline: InlineNode = { type: "text", value: "Hello" };
 * const block: BlockNode = { type: "paragraph", children: [inline] };
 * ```
 */
export type {
  BlockNode,
  DefinitionItem,
  InlineNode,
  ListItemNode,
  TableAlign,
  TableCellNode,
  TableRowNode,
  TaskItemNode,
} from "./markdown/ast";
/**
 * Runtime guards for validating rich Markdown AST nodes.
 *
 * @example
 * ```ts
 * import { isBlockNode } from "markengine";
 * if (isBlockNode(value)) console.log(value.type);
 * ```
 */
export { isBlockNode, isInlineNode } from "./markdown/ast";
/**
 * Rich Markdown parser entry points.
 *
 * @example
 * ```ts
 * import { parse, parseInline } from "markengine";
 * const blocks = parse("# Title");
 * const inline = parseInline("**bold**");
 * ```
 */
export { parse, parseInline } from "./markdown/parser";
/**
 * Rich AST HTML renderer.
 *
 * @example
 * ```ts
 * import { parse, renderHtml } from "markengine";
 * const html = renderHtml(parse("# Title"));
 * ```
 */
export { renderHtml } from "./markdown/renderers/html";
/**
 * Options accepted by the rich AST HTML renderer.
 *
 * @example
 * ```ts
 * import type { HtmlRenderOptions } from "markengine";
 * const options: HtmlRenderOptions = { mode: "reading" };
 * ```
 */
export type { HtmlRenderOptions } from "./markdown/renderers/html";
/**
 * React renderer and convenience component for rich AST documents.
 *
 * @example
 * ```tsx
 * import { MarkdownView, renderReact } from "markengine";
 * const nodes = renderReact([{ type: "paragraph", children: [] }]);
 * const view = <MarkdownView markdown="# Title" />;
 * ```
 */
export { MarkdownView, renderReact } from "./markdown/renderers/react";
/**
 * Options accepted by the React renderer.
 *
 * @example
 * ```ts
 * import type { ReactRenderOptions } from "markengine";
 * const options: ReactRenderOptions = { externalLinks: false };
 * ```
 */
export type { ReactRenderOptions } from "./markdown/renderers/react";
/**
 * Terminal renderer for rich AST documents.
 *
 * @example
 * ```ts
 * import { parse, renderTerminal } from "markengine";
 * const text = renderTerminal(parse("# Title"));
 * ```
 */
export { renderTerminal } from "./markdown/renderers/terminal";
/**
 * Options accepted by the terminal renderer.
 *
 * @example
 * ```ts
 * import type { TerminalRenderOptions } from "markengine";
 * const options: TerminalRenderOptions = { color: false };
 * ```
 */
export type { TerminalRenderOptions } from "./markdown/renderers/terminal";
/**
 * Render mode classes and resolvers shared by source, preview, and reading views.
 *
 * @example
 * ```ts
 * import { ReadingMode, resolveMarkdownMode } from "markengine";
 * const state = resolveMarkdownMode("reading") ?? new ReadingMode();
 * ```
 */
export {
  LivePreviewMode,
  ReadingMode,
  SourceMode,
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
} from "./markdown/renderers/renderMode";
/**
 * Render mode types shared by rich renderers.
 *
 * @example
 * ```ts
 * import type { MarkdownViewMode } from "markengine";
 * const mode: MarkdownViewMode = "live-preview";
 * ```
 */
export type {
  MarkdownModeResolver,
  MarkdownModeState,
  MarkdownViewMode,
} from "./markdown/renderers/renderMode";
/**
 * Block shortcut detection and Markdown-to-block conversion helpers.
 *
 * @example
 * ```ts
 * import { detectBlockType, parseMarkdownToBlocks } from "markengine";
 * const detection = detectBlockType("# Title");
 * const blocks = parseMarkdownToBlocks("# Title");
 * ```
 */
export {
  BLOCK_SHORTCUTS,
  detectBlockType,
  parseInlineMarkdown,
  parseMarkdownToBlocks,
} from "./shortcuts";
/**
 * Result shape returned by block shortcut detection.
 *
 * @example
 * ```ts
 * import type { BlockDetection } from "markengine";
 * const detection: BlockDetection | null = null;
 * ```
 */
export type { BlockDetection } from "./shortcuts";
/**
 * React renderer for inline shortcut text.
 *
 * @example
 * ```tsx
 * import { renderInlineToReact } from "markengine";
 * const children = renderInlineToReact("**bold**");
 * ```
 */
export { renderInlineToReact } from "./markdown/shortcutsReact";
/**
 * Legacy src/ parser, renderer, source-view, and incremental APIs.
 *
 * @example
 * ```ts
 * import { compileMarkdownToHtml, incrementalParse, parseMarkdown } from "markengine";
 * const previous = parseMarkdown("# Title");
 * const next = incrementalParse("# Title", previous, { fromLine: 0, toLine: 0, text: "# Next" });
 * const compiled = compileMarkdownToHtml("# Next");
 * ```
 */
export {
  compileMarkdownToHtml,
  compileMarkdownToSourceView,
  incrementalParse,
  parseInlines,
  parseMarkdown,
  renderSource,
  resolveIndexedModeState,
  resolveModeState,
  type IncrementalParseResult,
  type IncrementalPatch,
  type ParseOptions,
  type ParseResult,
  type RenderHtmlOptions,
  type SourceRenderOptions,
} from "./markdown";
/**
 * Inline formatting commands for source strings and rich inline AST nodes.
 *
 * @example
 * ```ts
 * import { applyInlineFormatting } from "markengine";
 * const result = applyInlineFormatting("text", { start: 0, end: 4 }, { kind: "bold" });
 * ```
 */
export {
  applyInlineFormatting,
  applyInlineFormattingToNodes,
  type InlineColorKind,
  type InlineFormatKind,
  type InlineFormattingCommand,
  type InlineTextSelection,
} from "./inlineFormatting";
/**
 * Inline text-editing commands for source strings and rich inline AST nodes.
 *
 * @example
 * ```ts
 * import { applyInlineTextEdit } from "markengine";
 * const result = applyInlineTextEdit("abc", { start: 1, end: 2, text: "B" });
 * ```
 */
export {
  applyInlineTextEdit,
  applyInlineTextEditToNodes,
  type InlineNodeTextEditResult,
  type InlineTextEditCommand,
  type InlineTextEditResult,
} from "./inlineTextEditing";
/**
 * Autoformat inline markdown sugar as the user types (e.g. closing a `**` run).
 *
 * @example
 * ```ts
 * import { autoformatInlineMarkdown } from "markengine";
 * const result = autoformatInlineMarkdown("**bold**", 8);
 * ```
 */
export {
  autoformatInlineMarkdown,
  type InlineAutoformatResult,
} from "./inlineAutoformat";
/**
 * Mutable inline document handle for AST-backed editor integrations.
 *
 * @example
 * ```ts
 * import { InlineDocument } from "markengine";
 * const document = InlineDocument.fromSource("hello");
 * const html = document.toHtml();
 * ```
 */
export {
  InlineDocument,
  type InlineDocumentEditResult,
} from "./inlineDocument";
/**
 * Options accepted by the rich inline HTML renderer.
 *
 * @example
 * ```ts
 * import type { InlineHtmlOptions } from "markengine";
 * const options: InlineHtmlOptions = { editorChrome: false };
 * ```
 */
export type { InlineHtmlOptions } from "./markdown/renderers/inlineHtml";
/**
 * Browser worker client and worker configuration for MarkEngine offload.
 *
 * @example
 * ```ts
 * import { createBrowserMarkEngineWorkerClient } from "markengine";
 * const worker = createBrowserMarkEngineWorkerClient(new URL("./worker.js", import.meta.url));
 * ```
 */
export {
  DEFAULT_MARKENGINE_WORKER_SYNC_THRESHOLD_BYTES,
  MarkEngineWorker,
  createBrowserMarkEngineWorkerClient,
  type MarkEngineWorkerEndpoint,
  type MarkEngineWorkerOptions,
  type MarkEngineWorkerRenderOptions,
} from "./src/worker-client";
/**
 * Node worker client for server-side MarkEngine offload.
 *
 * @example
 * ```ts
 * import { createNodeMarkEngineWorkerClient } from "markengine";
 * const worker = createNodeMarkEngineWorkerClient();
 * ```
 */
export {
  createNodeMarkEngineWorkerClient,
  type NodeMarkEngineWorkerOptions,
} from "./src/node-worker-client";
/**
 * DOM reader for contentEditable inline editor state.
 *
 * @example
 * ```ts
 * import { readInlineEditorDomState } from "markengine";
 * const state = readInlineEditorDomState(editorElement);
 * ```
 */
export {
  readInlineEditorDomState,
  type InlineEditorDomState,
} from "./inlineEditorDom";
/**
 * Selection snapshot helpers for contentEditable inline editors.
 *
 * @example
 * ```ts
 * import { getInlineEditorSelectionOffsets, setInlineEditorSelectionOffsets } from "markengine";
 * const offsets = getInlineEditorSelectionOffsets(editorElement);
 * if (offsets) setInlineEditorSelectionOffsets(editorElement, offsets);
 * ```
 */
export {
  areInlineEditorSelectionSnapshotsEqual,
  getInlineEditorSelectionOffsets,
  getInlineEditorSelectionSnapshot,
  setInlineEditorSelectionOffsets,
  type InlineEditorSelectionOffsets,
  type InlineEditorSelectionSnapshot,
} from "./inlineEditorSelection";
/**
 * Normalize a user-entered inline link target before rendering or storing it.
 *
 * @example
 * ```ts
 * import { normalizeInlineLinkHref } from "markengine";
 * const href = normalizeInlineLinkHref("example.com");
 * ```
 */
export { normalizeInlineLinkHref } from "./inlineLinks";
/**
 * Normalize inline source text for editor parsing.
 *
 * @example
 * ```ts
 * import { normalizeInlineSource } from "markengine";
 * const source = normalizeInlineSource("hello\r\nworld");
 * ```
 */
export { normalizeInlineSource } from "./inlineSource";
/**
 * Resolve the terminal callout icon for a callout kind.
 *
 * @example
 * ```ts
 * import { getCalloutIconForKind } from "markengine";
 * const icon = getCalloutIconForKind("warning");
 * ```
 */
export { getCalloutIcon as getCalloutIconForKind } from "./markdown/renderers/terminalHelpers";
/**
 * URL sugar: detect a single bare URL and turn it into `[hostname](url)` source.
 *
 * @example
 * ```ts
 * import { bareUrlToLinkSource, isSingleBareUrl } from "markengine";
 * const source = isSingleBareUrl(pasted) ? bareUrlToLinkSource(pasted) : pasted;
 * ```
 */
export { bareUrlToLinkSource, hostnameFromUrl, isSingleBareUrl } from "./markdown/urlSugar";
/**
 * Editor live-render gate predicate: true when a source contains a bare-URL shape, so a
 * scheme-less `www.…` autolinks while typing (the char-class gate omits `.`/`/`).
 *
 * @example
 * ```ts
 * import { containsBareUrlShape } from "markengine";
 * const shouldRerender = containsBareUrlShape("visit www.example.com now");
 * ```
 */
export { containsBareUrlShape } from "./markdown/parserInlineMatchers";
