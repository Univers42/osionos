/**
 * Inline rendering functions for terminal output.
 */

import type { InlineNode } from '../ast';
import {
  BOLD,
  C,
  DIM,
  ITALIC,
  STRIKETHROUGH,
  UNDERLINE,
  type RenderCtx,
  c,
  ind,
  reset,
} from './terminalAnsi';

export function renderInlines(nodes: InlineNode[], ctx: RenderCtx): string {
  return nodes.map(n => renderInline(n, ctx)).join('');
}

export function renderInline(node: InlineNode, ctx: RenderCtx): string {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'bold':
      return `${c(ctx, BOLD)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'italic':
      return `${c(ctx, ITALIC)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'bold_italic':
      return `${c(ctx, BOLD + ITALIC)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'strikethrough':
      return `${c(ctx, STRIKETHROUGH)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'underline':
      return `${c(ctx, UNDERLINE)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'text_color':
    case 'background_color':
      return renderInlines(node.children, ctx);
    case 'code_rich':
      return `${c(ctx, C.code + C.codeBg)} ${renderInlines(node.children, ctx)} ${reset(ctx)}`;
    case 'code':
      return `${c(ctx, C.code + C.codeBg)} ${node.value} ${reset(ctx)}`;
    case 'link':
      return `${c(ctx, C.link + UNDERLINE)}${renderInlines(node.children, ctx)}${reset(ctx)}${c(ctx, DIM)} (${node.href})${reset(ctx)}`;
    case 'internal_link':
      return `${c(ctx, C.link + UNDERLINE)}[[ ${node.pageId} ]]${reset(ctx)}`;
    case 'image':
      return `${c(ctx, DIM)}[image: ${node.alt}]${reset(ctx)}`;
    case 'line_break':
      return '\n' + ind(ctx);
    case 'highlight':
      return `${c(ctx, C.highlight)}${renderInlines(node.children, ctx)}${reset(ctx)}`;
    case 'math_inline':
      return `${c(ctx, C.math)}${node.value}${reset(ctx)}`;
    case 'footnote_ref':
      return `${c(ctx, C.footnote)}[${node.label}]${reset(ctx)}`;
    case 'emoji':
      return node.value;
    default:
      return '';
  }
}

/** Render inlines as plain text (no ANSI — for width calculations) */
export function renderInlinesPlain(nodes: InlineNode[]): string {
  return nodes.map(n => {
    switch (n.type) {
      case 'text': return n.value;
      case 'bold': case 'italic': case 'bold_italic': case 'strikethrough':
      case 'underline': case 'highlight': case 'text_color': case 'background_color': case 'code_rich':
        return renderInlinesPlain(n.children);
      case 'code': return n.value;
      case 'link': return renderInlinesPlain(n.children);
      case 'internal_link': return `[[ ${n.pageId} ]]`;
      case 'image': return n.alt;
      case 'line_break': return ' ';
      case 'math_inline': return n.value;
      case 'footnote_ref': return `[${n.label}]`;
      case 'emoji': return n.value;
      default: return '';
    }
  }).join('');
}
