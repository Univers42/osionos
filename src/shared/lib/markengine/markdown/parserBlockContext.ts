// Markdown parser — parse context and cursor utilities
export interface ParseContext {
  lines: string[];
  pos: number;
}

export function peek(ctx: ParseContext): string | null {
  return ctx.pos < ctx.lines.length ? ctx.lines[ctx.pos] : null;
}

export function advance(ctx: ParseContext): string {
  return ctx.lines[ctx.pos++];
}
