// Terminal renderer — AST to ANSI-escaped string
import type { BlockNode } from '../ast';
import {
  BOLD, DIM, STRIKETHROUGH, C,
  TerminalRenderOptions, defaults, RenderCtx, ind, c, reset,
  renderInlines, stripAnsi,
  getCalloutColor, getCalloutIcon, renderTermTable,
} from './terminalHelpers';
export type { TerminalRenderOptions } from './terminalHelpers';

export function renderTerminal(
  blocks: BlockNode[],
  opts?: TerminalRenderOptions,
): string {
  const o = { ...defaults, ...opts };
  const ctx: RenderCtx = { o, depth: 0 };
  return blocks.map(b => renderBlock(b, ctx)).join('\n');
}
function renderBlock(node: BlockNode, ctx: RenderCtx): string {
  const prefix = ind(ctx);

  switch (node.type) {
    case 'document':
      return node.children.map(ch => renderBlock(ch, ctx)).join('\n');

    case 'paragraph':
      return `${prefix}${renderInlines(node.children, ctx)}\n`;

    case 'heading': {
      const text = renderInlines(node.children, ctx);
      const marker = '#'.repeat(node.level);
      const hl = c(ctx, BOLD + C.heading);
      const rst = reset(ctx);
      if (node.level <= 2) {
        // Underline style for h1/h2
        const underChar = node.level === 1 ? '═' : '─';
        const underline = underChar.repeat(Math.min(stripAnsi(text).length + marker.length + 1, ctx.o.width - prefix.length));
        return `${prefix}${hl}${marker} ${text}${rst}\n${prefix}${c(ctx, C.heading)}${underline}${rst}\n`;
      }
      return `${prefix}${hl}${marker} ${text}${rst}\n`;
    }

    case 'blockquote': {
      const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
      const inner = node.children.map(ch => renderBlock(ch, innerCtx)).join('');
      // Add quote bar to each line
      const bar = `${c(ctx, C.quoteBorder)}│${reset(ctx)}`;
      return inner
        .split('\n')
        .map(line => line ? `${prefix}${bar} ${c(ctx, C.quote)}${line.trimStart()}${reset(ctx)}` : '')
        .join('\n') + '\n';
    }

    case 'code_block': {
      const langLabel = node.lang ? ` ${node.lang} ` : '';
      const top = `${prefix}${c(ctx, C.tableFrame)}┌${langLabel}${'─'.repeat(Math.max(0, ctx.o.width - prefix.length - langLabel.length - 2))}┐${reset(ctx)}`;
      const bottom = `${prefix}${c(ctx, C.tableFrame)}└${'─'.repeat(ctx.o.width - prefix.length - 2)}┘${reset(ctx)}`;

      const lines = node.value.split('\n').map(line =>
        `${prefix}${c(ctx, C.tableFrame)}│${reset(ctx)} ${c(ctx, C.code + C.codeBg)}${line}${reset(ctx)}`
      );

      return `${top}\n${lines.join('\n')}\n${bottom}\n`;
    }

    case 'unordered_list':
      return node.children.map((item, _i) => {
        const bullet = `${c(ctx, C.listBullet)}•${reset(ctx)}`;
        const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
        const body = item.children.map(ch => renderBlock(ch, innerCtx)).join('').trimEnd();
        // Replace first line's indent with bullet
        const _firstLinePrefix = ind(ctx) + ' ';
        const lines = body.split('\n');
        if (lines[0]) {
          lines[0] = `${prefix}${bullet} ${lines[0].trimStart()}`;
        }
        return lines.join('\n');
      }).join('\n') + '\n';

    case 'ordered_list':
      return node.children.map((item, i) => {
        const num = `${c(ctx, C.listBullet)}${(node.start ?? 1) + i}.${reset(ctx)}`;
        const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
        const body = item.children.map(ch => renderBlock(ch, innerCtx)).join('').trimEnd();
        const lines = body.split('\n');
        if (lines[0]) {
          lines[0] = `${prefix}${num} ${lines[0].trimStart()}`;
        }
        return lines.join('\n');
      }).join('\n') + '\n';

    case 'task_list':
      return node.children.map(item => {
        const check = item.checked
          ? `${c(ctx, C.taskDone)}[✓]${reset(ctx)}`
          : `${c(ctx, C.taskPending)}[ ]${reset(ctx)}`;
        const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
        const body = item.children.map(ch => renderBlock(ch, innerCtx)).join('').trimEnd();
        const lines = body.split('\n');
        if (lines[0]) {
          const textStyle = item.checked ? c(ctx, STRIKETHROUGH + DIM) : '';
          lines[0] = `${prefix}${check} ${textStyle}${lines[0].trimStart()}${reset(ctx)}`;
        }
        return lines.join('\n');
      }).join('\n') + '\n';

    case 'thematic_break': {
      const line = '─'.repeat(ctx.o.width - prefix.length * 2);
      return `${prefix}${c(ctx, C.hr)}${line}${reset(ctx)}\n`;
    }

    case 'table':
      return renderTermTable(node, ctx);

    case 'callout': {
      const kindUpper = node.kind.toUpperCase();
      const kindColor = getCalloutColor(node.kind);
      const icon = getCalloutIcon(node.kind);
      const title = node.title.length ? ' ' + renderInlines(node.title, ctx) : '';
      const header = `${prefix}${c(ctx, kindColor + BOLD)}${icon} ${kindUpper}${title}${reset(ctx)}`;
      const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
      const body = node.children.map(ch => renderBlock(ch, innerCtx)).join('');
      const bar = `${c(ctx, kindColor)}│${reset(ctx)}`;
      const bodyLines = body.split('\n').map(line =>
        line ? `${prefix}${bar} ${line.trimStart()}` : ''
      ).join('\n');
      return `${header}\n${bodyLines}\n`;
    }

    case 'math_block':
      return `${prefix}${c(ctx, C.math)}${node.value}${reset(ctx)}\n`;

    case 'html_block':
      return `${prefix}${c(ctx, DIM)}[HTML block]${reset(ctx)}\n`;

    case 'footnote_def': {
      const label = `${c(ctx, C.footnote)}[${node.label}]${reset(ctx)}`;
      const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
      const body = node.children.map(ch => renderBlock(ch, innerCtx)).join('').trimEnd();
      return `${prefix}${label} ${body.trimStart()}\n`;
    }

    case 'definition_list':
      return node.items.map(item => {
        const term = `${prefix}${c(ctx, BOLD)}${renderInlines(item.term, ctx)}${reset(ctx)}`;
        const defs = item.definitions.map(def =>
          `${prefix}  ${renderInlines(def, ctx)}`
        ).join('\n');
        return `${term}\n${defs}`;
      }).join('\n') + '\n';

    case 'toggle': {
      const summary = renderInlines(node.summary, ctx);
      const innerCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 };
      const body = node.children.map(ch => renderBlock(ch, innerCtx)).join('');
      return `${prefix}${c(ctx, BOLD)}▸${reset(ctx)} ${summary}\n${body}`;
    }

    default:
      return '';
  }
}
