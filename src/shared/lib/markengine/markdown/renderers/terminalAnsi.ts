/**
 * ANSI escape codes, color constants, types, and context utilities
 * for terminal rendering.
 */

export const ESC = '\x1b';
export const RESET = `${ESC}[0m`;
export const BOLD = `${ESC}[1m`;
export const DIM = `${ESC}[2m`;
export const ITALIC = `${ESC}[3m`;
export const UNDERLINE = `${ESC}[4m`;
export const STRIKETHROUGH = `${ESC}[9m`;
export const INVERSE = `${ESC}[7m`;
export const FG = (code: number) => `${ESC}[38;5;${code}m`;
export const BG = (code: number) => `${ESC}[48;5;${code}m`;
export const C = {
  heading: FG(75),     // blue
  link: FG(39),        // bright blue
  code: FG(214),       // orange
  codeBg: BG(236),     // dark bg
  quote: FG(245),      // gray
  quoteBorder: FG(242),
  listBullet: FG(214), // orange
  taskDone: FG(40),    // green
  taskPending: FG(245),
  calloutInfo: FG(75),
  calloutWarn: FG(214),
  calloutError: FG(196),
  calloutTip: FG(40),
  highlight: BG(226) + FG(0), // yellow bg, black fg
  hr: FG(240),
  tableFrame: FG(240),
  math: FG(141),       // purple
  footnote: FG(245),
};
export interface TerminalRenderOptions {
  /** Terminal width in columns (default: 80) */
  width?: number;
  /** Indentation per nesting level (default: 2) */
  indent?: number;
  /** Enable colors (default: true) */
  color?: boolean;
}

export const defaults: Required<TerminalRenderOptions> = {
  width: 80,
  indent: 2,
  color: true,
};
export interface RenderCtx {
  o: Required<TerminalRenderOptions>;
  depth: number;
}

export function ind(ctx: RenderCtx): string {
  return ' '.repeat(ctx.depth * ctx.o.indent);
}

export function c(ctx: RenderCtx, code: string): string {
  return ctx.o.color ? code : '';
}

export function reset(ctx: RenderCtx): string {
  return ctx.o.color ? RESET : '';
}
