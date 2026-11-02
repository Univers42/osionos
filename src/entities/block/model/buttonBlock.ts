/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonBlock.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: DJSurgeon <djsurgeon83@gmail.com>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/02 19:25:00 by DJSurgeon         #+#    #+#             */
/*   Updated: 2026/11/02 19:25:00 by DJSurgeon        ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Resolves the visible label of a button block.
 * Checks canonical `content` first, then legacy `buttonLabel`, falling back to "Button".
 */
export function buttonBlockLabel(block?: {
  content?: string | null;
  buttonLabel?: string | null;
} | null): string {
  const content = block?.content?.trim();
  if (content) {
    return content;
  }
  const buttonLabel = block?.buttonLabel?.trim();
  if (buttonLabel) {
    return buttonLabel;
  }
  return "Button";
}
