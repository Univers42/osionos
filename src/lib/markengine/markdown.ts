import { parseMarkdown as parseDocument } from "./src/block-parser";
import { parseInlines as parseInlineNodes } from "./src/inline-parser";
import {
  renderHtml as renderDocumentHtml,
  type RenderHtmlOptions,
} from "./src/renderer";
import {
  renderMarkdownSource,
  type SourceRenderOptions,
} from "./src/source-renderer";
import { incrementalParse as incrementalParseFromSource } from "./src/incremental";
import {
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
  // ReadingMode,
  // LivePreviewMode,
  // SourceMode,
  type MarkdownModeResolver,
  type MarkdownModeState,
  type MarkdownViewMode,
} from "./src/render-mode";
import type {
  DocumentNode,
  IncrementalParseResult,
  IncrementalPatch,
  InlineNode,
  ParseOptions,
  ParseResult,
} from "./src/types";

export type {
  BlockNode,
  DocumentNode,
  IncrementalParseResult,
  IncrementalPatch,
  InlineNode,
  ParseOptions,
  ParseResult,
} from "./src/types";
export type { SourceRenderOptions } from "./src/source-renderer";
export type { RenderHtmlOptions } from "./src/renderer";
export type {
  MarkdownModeResolver,
  MarkdownModeState,
  MarkdownViewMode,
} from "./src/render-mode";
export { ReadingMode, LivePreviewMode, SourceMode } from "./src/render-mode";

export function parseMarkdown(
  source: string,
  options: ParseOptions = {},
): ParseResult {
  return parseDocument(source, options);
}

export function parseInlines(source: string, line = 0): InlineNode[] {
  return parseInlineNodes(source, line);
}

export function renderHtml(
  ast: DocumentNode,
  options: RenderHtmlOptions = {},
): string {
  return renderDocumentHtml(ast, options);
}

export function compileMarkdownToHtml(
  source: string,
  options: ParseOptions = {},
  renderOptions: RenderHtmlOptions = {},
): {
  html: string;
  ast: DocumentNode;
} {
  const result = parseMarkdown(source, options);
  return {
    html: renderHtml(result.ast, renderOptions),
    ast: result.ast,
  };
}

export function renderSource(
  source: string,
  options: SourceRenderOptions = {},
): string {
  return renderMarkdownSource(source, options);
}

export function compileMarkdownToSourceView(
  source: string,
  options: ParseOptions = {},
  sourceOptions: SourceRenderOptions = {},
): {
  html: string;
  ast: DocumentNode;
} {
  const result = parseMarkdown(source, options);
  return {
    html: renderSource(source, sourceOptions),
    ast: result.ast,
  };
}

export function resolveModeState(mode?: MarkdownViewMode): MarkdownModeState {
  return resolveMarkdownMode(mode);
}

export function resolveIndexedModeState<TNode>(
  fallbackMode: MarkdownViewMode | undefined,
  index: number,
  node: TNode,
  indexedModes?: readonly MarkdownViewMode[],
  resolver?: MarkdownModeResolver<TNode>,
): MarkdownModeState {
  return resolveIndexedMarkdownMode(
    fallbackMode,
    index,
    node,
    indexedModes,
    resolver,
  );
}

export function incrementalParse(
  previousText: string,
  previousResult: ParseResult,
  patch: IncrementalPatch,
): IncrementalParseResult {
  return incrementalParseFromSource(previousText, previousResult, patch);
}
