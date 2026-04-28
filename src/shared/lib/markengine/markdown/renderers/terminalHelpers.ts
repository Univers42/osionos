/**
 * Barrel re-export — preserves every original export from terminalHelpers.
 */

export {
  ESC, RESET, BOLD, DIM, ITALIC, UNDERLINE, STRIKETHROUGH, INVERSE,
  FG, BG, C,
  type TerminalRenderOptions, defaults,
  type RenderCtx,
  ind, c, reset,
} from './terminalAnsi';

export { renderInlines, renderInline, renderInlinesPlain } from './terminalInlineRenderers';
export { renderTermTable } from './terminalTableRenderer';
export { stripAnsi, getCalloutColor, getCalloutIcon } from './terminalUtils';
