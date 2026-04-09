import type { BlockNode, InlineNode } from "./markdown/ast";
import { parse, parseInline } from "./markdown/parser";
import {
  renderHtml as renderHtmlFromBlocks,
  type HtmlRenderOptions,
} from "./markdown/renderers/html";

export type { BlockNode, InlineNode, HtmlRenderOptions };

export interface ParseOptions {
  documentVersion?: number;
}

export interface ParseResult {
  ast: BlockNode[];
}

export interface IncrementalPatch {
  fromLine: number;
  toLine: number;
  text: string;
}

export interface IncrementalParseResult {
  text: string;
  ast: BlockNode[];
  changedNodeIds: string[];
}

export function parseMarkdown(
  source: string,
  _options: ParseOptions = {},
): ParseResult {
  return { ast: parse(source) };
}

export function parseInlines(source: string): InlineNode[] {
  return parseInline(source);
}

export function renderHtml(
  ast: BlockNode[],
  options?: HtmlRenderOptions,
): string {
  return renderHtmlFromBlocks(ast, options);
}

export function compileMarkdownToHtml(
  source: string,
  options: ParseOptions = {},
): { html: string; ast: BlockNode[] } {
  const result = parseMarkdown(source, options);
  return {
    html: renderHtml(result.ast),
    ast: result.ast,
  };
}

function applyPatchToText(text: string, patch: IncrementalPatch): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const replacement = patch.text.replace(/\r\n?/g, "\n").split("\n");
  return [
    ...lines.slice(0, patch.fromLine),
    ...replacement,
    ...lines.slice(patch.toLine + 1),
  ].join("\n");
}

function blockSignature(node: BlockNode): string {
  return JSON.stringify(node);
}

export function incrementalParse(
  previousText: string,
  previousResult: ParseResult,
  patch: IncrementalPatch,
): IncrementalParseResult {
  const nextText = applyPatchToText(previousText, patch);
  const nextAst = parse(nextText);

  const prevSigs = new Set(previousResult.ast.map(blockSignature));
  const changedNodeIds = nextAst
    .map((node, index) => ({ index, signature: blockSignature(node) }))
    .filter(({ signature }) => !prevSigs.has(signature))
    .map(({ index }) => `block-${index}`);

  return {
    text: nextText,
    ast: nextAst,
    changedNodeIds,
  };
}
