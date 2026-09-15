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
 * Canonical (bracket-form) serializer for inline AST nodes — the editor's
 * stored source format; `serialize(parse(x))` is a fixed point.
 *
 * @example
 * ```ts
 * import { parseInline, serializeInlineNodes } from "markengine";
 * const canonical = serializeInlineNodes(parseInline("**bold**"));
 * ```
 */
export {
  getInlineNodesTextLength,
  serializeInlineNodes,
  splitNodesAtOffset,
} from "./inlineAst";
/**
 * Inline markdown → HTML string, in one call.
 *
 * @example
 * ```ts
 * import { parseInlineMarkdown } from "markengine";
 * const html = parseInlineMarkdown("**bold** and *italic*");
 * ```
 */
export { parseInlineMarkdown } from "./markdown/inlineMarkdown";
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
