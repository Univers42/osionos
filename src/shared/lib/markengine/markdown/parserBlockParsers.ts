/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserBlockParsers.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — block-level parsers and helpers
import type {
  BlockNode, TableRowNode, TableCellNode, TableAlign,
} from './ast';
import { parseInline } from './parserInline';
import type { ParseContext } from './parserBlockContext';
import { advance } from './parserBlockContext';

export function isThematicBreak(line: string): boolean {
  // Single charCode pass (this runs on every block line): 3+ of one marker
  // char (- * _), whitespace anywhere between, nothing else.
  let marker = 0;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    if (code === 32 || code === 9 || code === 13) continue; // space, tab, CR
    if (code !== 45 && code !== 42 && code !== 95) return false; // - * _
    if (marker === 0) marker = code;
    else if (code !== marker) return false;
    count += 1;
  }
  return count >= 3;
}

export function isSetextHeading(ctx: ParseContext): boolean {
  if (ctx.pos + 1 >= ctx.lines.length) return false;
  const nextLine = ctx.lines[ctx.pos + 1].trim();
  const currentLine = ctx.lines[ctx.pos].trim();
  if (!currentLine || currentLine.startsWith('>') || /^[-*+]\s/.test(currentLine)) return false;
  return /^={3,}\s*$/.test(nextLine) || /^-{3,}\s*$/.test(nextLine);
}

export function parseFencedCode(ctx: ParseContext): BlockNode {
  const openLine = advance(ctx).trimStart();
  const fenceChar = openLine[0] as '`' | '~';
  let fenceLength = 0;
  while (openLine[fenceLength] === fenceChar) fenceLength += 1;
  const info = openLine.slice(fenceLength).trim();
  const lang = info.split(/\s/)[0] || '';
  const meta = info.slice(lang.length).trim() || undefined;
  const lines: string[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos].trimStart();
    // CommonMark: the closing fence uses the same char, is at least as long as
    // the opener, and carries no info text — so a 4-backtick fence can show a
    // 3-backtick block verbatim inside it.
    if (line[0] === fenceChar) {
      let closeLength = 0;
      while (line[closeLength] === fenceChar) closeLength += 1;
      if (closeLength >= fenceLength && line.slice(closeLength).trim() === '') {
        advance(ctx);
        break;
      }
    }
    lines.push(advance(ctx));
  }

  const value = lines.join('\n');
  // GitHub's ```math fence is display math, not code.
  if (lang === 'math') return { type: 'math_block', value };
  return { type: 'code_block', lang, meta, value };
}

export function parseMathBlock(ctx: ParseContext): BlockNode {
  advance(ctx); // skip opening $$
  const lines: string[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos].trim();
    if (line === '$$') {
      advance(ctx);
      break;
    }
    lines.push(advance(ctx));
  }
  return { type: 'math_block', value: lines.join('\n') };
}

export const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body',
  'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'pre',
  'section', 'source', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'title', 'tr', 'track', 'ul',
  // Media blocks — let a bare <video>/<audio>/<img>/<picture> line pass through
  // as a raw HTML block (parity with the already-allowed <iframe>/<figure>), so
  // .xmd docs can embed images, video, and audio without a wrapping <div>.
  'video', 'audio', 'img', 'picture', 'embed', 'object', 'svg',
]);
export function isHtmlBlockTag(line: string): boolean {
  const match = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(line);
  return match ? HTML_BLOCK_TAGS.has(match[1].toLowerCase()) : false;
}

export function parseHtmlBlock(ctx: ParseContext): BlockNode {
  const lines: string[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    lines.push(advance(ctx));
    if (line.trim() === '' && lines.length > 1) break;
  }
  return { type: 'html_block', value: lines.join('\n').trimEnd() };
}

export const listStartPattern = /^(?:[-*+]|\d{1,9}[.)])\s/;
export function parseIndentedCode(ctx: ParseContext): BlockNode {
  const lines: string[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    if (line.length >= 4 && line.startsWith('    ')) {
      lines.push(line.slice(4));
      advance(ctx);
    } else if (line.trim() === '') {
      lines.push('');
      advance(ctx);
    } else {
      break;
    }
  }

  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return { type: 'code_block', lang: '', value: lines.join('\n') };
}

export function isTableStart(ctx: ParseContext): boolean {
  if (ctx.pos + 1 >= ctx.lines.length) return false;
  const line1 = ctx.lines[ctx.pos].trim();
  const line2 = ctx.lines[ctx.pos + 1].trim();
  if (!line1.includes('|')) return false;
  // GFM delimiter row: each cell is `:?-+:?` (optional alignment colons around
  // one or more dashes), cells separated by pipes, outer pipes optional.
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line2);
}

function parseTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  // Split on unescaped pipes only — `\|` stays inside its cell as a literal `|`.
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function parseAlignments(line: string): TableAlign[] {
  return parseTableRow(line).map(cell => {
    const trimmed = cell.trim().replaceAll(/\s/g, '');
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
    if (trimmed.endsWith(':')) return 'right';
    if (trimmed.startsWith(':')) return 'left';
    return null;
  });
}

export function parseTable(ctx: ParseContext): BlockNode {
  const headerLine = advance(ctx);
  const sepLine = advance(ctx);
  const alignments = parseAlignments(sepLine);
  const headCells: TableCellNode[] = parseTableRow(headerLine).map(cell => ({
    type: 'table_cell',
    children: parseInline(cell),
  }));
  const head: TableRowNode = { type: 'table_row', cells: headCells };
  const rows: TableRowNode[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos].trim();
    if (!line?.includes('|')) break;
    const cells = parseTableRow(line).map(cell => ({
      type: 'table_cell' as const,
      children: parseInline(cell),
    }));
    rows.push({ type: 'table_row', cells });
    advance(ctx);
  }

  return { type: 'table', head, rows, alignments };
}

function isParagraphBreak(ctx: ParseContext, trimmed: string): boolean {
  if (trimmed === '') return true;
  if (isThematicBreak(trimmed)) return true;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) return true;
  if (trimmed.startsWith('$$')) return true;
  if (trimmed.startsWith('<!--')) return true;
  if (trimmed.startsWith(':::')) return true;
  if (/^>\s/.test(trimmed) || trimmed === '>') return true;
  if (/^[-*+]\s+/.test(trimmed)) return true;
  if (/^:\s+/.test(trimmed)) return true;
  if (/^\d{1,9}[.)]\s+/.test(trimmed)) return true;
  if (/^\[\^([^\]]+)\]:\s/.test(trimmed)) return true;
  if (isTableStart(ctx)) return true;
  if (/^<([a-zA-Z])/.test(trimmed) && isHtmlBlockTag(trimmed)) return true;
  return false;
}

/** The line after this one opens a `: definition` — leave it as the def term. */
function nextLineStartsDefinition(ctx: ParseContext, linesCollected: number): boolean {
  if (linesCollected === 0) return false;
  const next = ctx.lines[ctx.pos + 1];
  return next !== undefined && /^:\s+/.test(next.trimStart());
}

function isSetextBreak(ctx: ParseContext, linesCollected: number): boolean {
  if (ctx.pos + 1 >= ctx.lines.length) return false;
  const nextLine = ctx.lines[ctx.pos + 1].trim();
  if (/^={3,}\s*$/.test(nextLine) || /^-{3,}\s*$/.test(nextLine)) {
    return linesCollected === 0;
  }
  return false;
}

export function parseParagraph(ctx: ParseContext): BlockNode {
  const lines: string[] = [];
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    const trimmed = line.trim();
    if (isParagraphBreak(ctx, trimmed)) break;
    if (isSetextBreak(ctx, lines.length)) break;
    if (nextLineStartsDefinition(ctx, lines.length)) break;
    lines.push(trimmed);
    advance(ctx);
  }

  // Progress guarantee: a line that trips a break condition yet matched no
  // block parser (e.g. a stray bare ":::") is consumed as literal text —
  // returning without advancing would loop the block parser forever.
  if (lines.length === 0 && ctx.pos < ctx.lines.length) {
    lines.push(advance(ctx).trim());
  }

  const text = lines.join('\n');
  return { type: 'paragraph', children: parseInline(text) };
}
