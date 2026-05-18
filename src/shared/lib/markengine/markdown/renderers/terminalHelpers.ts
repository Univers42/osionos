/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   terminalHelpers.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
