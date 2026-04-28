// Markdown parser — list block parsers (task, ordered, unordered)
import type { BlockNode, ListItemNode, TaskItemNode } from "./ast";
import type { ParseContext } from "./parserBlockHelpers";
import { advance } from "./parserBlockHelpers";
import type { ParseBlocksFn } from "./parserBlockQuote";

function splitIndent(line: string): { indent: number; trimmed: string } {
  const trimmed = line.trimStart();
  return { indent: line.length - trimmed.length, trimmed };
}

function removeBaseIndent(line: string, baseIndent: number): string {
  let idx = 0;
  let remaining = baseIndent;
  while (
    idx < line.length &&
    remaining > 0 &&
    (line[idx] === " " || line[idx] === "\t")
  ) {
    idx++;
    remaining--;
  }
  return line.slice(idx);
}

function collectContinuation(
  ctx: ParseContext,
  contLines: string[],
  baseIndent: number,
): void {
  while (ctx.pos < ctx.lines.length) {
    const next = ctx.lines[ctx.pos];
    const { indent, trimmed } = splitIndent(next);

    if (trimmed === "") {
      if (ctx.pos + 1 < ctx.lines.length) {
        const lookAhead = splitIndent(ctx.lines[ctx.pos + 1]);
        if (lookAhead.trimmed !== "" && lookAhead.indent > baseIndent) {
          contLines.push("");
          advance(ctx);
          continue;
        }
      }
      break;
    }

    if (indent > baseIndent) {
      contLines.push(removeBaseIndent(next, baseIndent));
      advance(ctx);
      continue;
    }

    break;
  }
}

function listItemFromContent(
  parseBlocks: ParseBlocksFn,
  content: string,
  contLines: string[],
): ListItemNode {
  const innerCtx: ParseContext = { lines: [content, ...contLines], pos: 0 };
  return { type: "list_item", children: parseBlocks(innerCtx, 1) };
}

function taskItemFromContent(
  parseBlocks: ParseBlocksFn,
  checked: boolean,
  content: string,
  contLines: string[],
): TaskItemNode {
  const innerCtx: ParseContext = { lines: [content, ...contLines], pos: 0 };
  return { type: "task_item", checked, children: parseBlocks(innerCtx, 1) };
}

export function parseTaskList(
  ctx: ParseContext,
  parseBlocks: ParseBlocksFn,
): BlockNode {
  const items: TaskItemNode[] = [];
  let baseIndent: number | null = null;

  while (ctx.pos < ctx.lines.length) {
    const raw = ctx.lines[ctx.pos];
    const { indent, trimmed } = splitIndent(raw);
    const match = /^[-*+]\s+\[([ xX])\]\s+(.*)/.exec(trimmed);
    if (!match) break;

    if (baseIndent === null) baseIndent = indent;
    if (indent !== baseIndent) break;

    advance(ctx);
    const checked = match[1] !== " ";
    const content = match[2];
    const contLines: string[] = [];
    collectContinuation(ctx, contLines, baseIndent);
    items.push(taskItemFromContent(parseBlocks, checked, content, contLines));
  }

  return { type: "task_list", children: items };
}

export function parseOrderedList(
  ctx: ParseContext,
  parseBlocks: ParseBlocksFn,
): BlockNode {
  const items: ListItemNode[] = [];
  let start = 1;
  let first = true;
  let baseIndent: number | null = null;

  while (ctx.pos < ctx.lines.length) {
    const raw = ctx.lines[ctx.pos];
    const { indent, trimmed } = splitIndent(raw);
    const match = /^(\d{1,9})([.)]\s+)(.*)/.exec(trimmed);
    if (!match) break;

    if (baseIndent === null) baseIndent = indent;
    if (indent !== baseIndent) break;

    advance(ctx);
    if (first) {
      start = Number.parseInt(match[1], 10);
      first = false;
    }

    const content = match[3];
    const contLines: string[] = [];
    collectContinuation(ctx, contLines, baseIndent);
    items.push(listItemFromContent(parseBlocks, content, contLines));
  }

  return { type: "ordered_list", start, children: items };
}

export function parseUnorderedList(
  ctx: ParseContext,
  parseBlocks: ParseBlocksFn,
): BlockNode {
  const items: ListItemNode[] = [];
  let baseIndent: number | null = null;

  while (ctx.pos < ctx.lines.length) {
    const raw = ctx.lines[ctx.pos];
    const { indent, trimmed } = splitIndent(raw);
    const match = /^[-*+]\s+(.*)/.exec(trimmed);
    if (!match) break;

    if (baseIndent === null) baseIndent = indent;
    if (indent !== baseIndent) break;

    advance(ctx);
    const content = match[1];
    const contLines: string[] = [];
    collectContinuation(ctx, contLines, baseIndent);
    items.push(listItemFromContent(parseBlocks, content, contLines));
  }

  return { type: "unordered_list", children: items };
}
