/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineMarkdown.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Inline markdown → HTML. Lives apart from `shortcuts.ts` because it has no
 * block dependency at all: it is pure inline rendering, and belongs on the
 * engine's root entry point rather than behind the block-shortcut surface.
 */

import { renderInlineNodesToHtml, type InlineHtmlOptions } from "./renderers/inlineHtml";
import { parseInline } from "./parser";

export function parseInlineMarkdown(
  text: string,
  options: InlineHtmlOptions = {},
): string {
  // Use the full parser's inline engine → convert to HTML
  const nodes = parseInline(text);
  return renderInlineNodesToHtml(nodes, options);
}
