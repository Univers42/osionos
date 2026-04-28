// Markdown parser — footnote definition block parser
import type { BlockNode } from './ast';
import type { ParseContext } from './parserBlockHelpers';
import { advance } from './parserBlockHelpers';
import type { ParseBlocksFn } from './parserBlockQuote';

export function parseFootnoteDef(ctx: ParseContext, parseBlocks: ParseBlocksFn): BlockNode {
  const line = advance(ctx);
  const match = /^\[\^([^\]]+)\]:\s*(.*)/.exec(line);
  const label = match?.[1] || '';
  const firstContent = match?.[2] || '';
  const contLines = [firstContent];
  while (ctx.pos < ctx.lines.length) {
    const next = ctx.lines[ctx.pos];
    const indent = next.length - next.trimStart().length;
    if (next.trim() === '' || indent >= 2) {
      contLines.push(next.trimStart());
      advance(ctx);
    } else {
      break;
    }
  }

  const innerCtx: ParseContext = { lines: contLines, pos: 0 };
  return { type: 'footnote_def', label, children: parseBlocks(innerCtx, 1) };
}
