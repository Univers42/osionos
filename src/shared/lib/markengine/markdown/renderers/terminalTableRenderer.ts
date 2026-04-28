/**
 * Terminal table rendering.
 */

import type { BlockNode } from '../ast';
import {
  BOLD,
  C,
  type RenderCtx,
  c,
  ind,
  reset,
} from './terminalAnsi';
import { renderInlines, renderInlinesPlain } from './terminalInlineRenderers';

export function renderTermTable(
  node: Extract<BlockNode, { type: 'table' }>,
  ctx: RenderCtx,
): string {
  const allRows = [node.head, ...node.rows];
  const colCount = node.head.cells.length;
  const colWidths = new Array<number>(colCount).fill(0);
  for (const row of allRows) {
    for (let i = 0; i < colCount; i++) {
      const cell = row.cells[i];
      if (cell) {
        const text = renderInlinesPlain(cell.children);
        colWidths[i] = Math.max(colWidths[i], text.length);
      }
    }
  }

  for (let i = 0; i < colCount; i++) {
    colWidths[i] = Math.max(colWidths[i], 3);
  }

  const fc = c(ctx, C.tableFrame);
  const rst = reset(ctx);
  const prefix = ind(ctx);
  const hLine = (left: string, mid: string, right: string) => {
    return `${prefix}${fc}${left}${colWidths.map(w => '─'.repeat(w + 2)).join(mid)}${right}${rst}`;
  };
  const formatRow = (cells: typeof node.head.cells, bold: boolean) => {
    return `${prefix}${fc}│${rst}` + cells.map((cell, i) => {
      const text = cell ? renderInlines(cell.children, ctx) : '';
      const plain = cell ? renderInlinesPlain(cell.children) : '';
      const padLen = Math.max(0, (colWidths[i] || 3) - plain.length);
      const align = node.alignments[i];
      let padded: string;
      if (align === 'center') {
        const left = Math.floor(padLen / 2);
        padded = ' '.repeat(left) + text + ' '.repeat(padLen - left);
      } else if (align === 'right') {
        padded = ' '.repeat(padLen) + text;
      } else {
        padded = text + ' '.repeat(padLen);
      }
      const style = bold ? c(ctx, BOLD) : '';
      return ` ${style}${padded}${bold ? rst : ''} ${fc}│${rst}`;
    }).join('');
  };
  const lines = [
    hLine('┌', '┬', '┐'),
    formatRow(node.head.cells, true),
    hLine('├', '┼', '┤'),
    ...node.rows.map(row => formatRow(row.cells, false)),
    hLine('└', '┴', '┘'),
  ];
  return lines.join('\n') + '\n';
}
