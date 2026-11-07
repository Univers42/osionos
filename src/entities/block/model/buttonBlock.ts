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
 * Checks `buttonLabel` first to preserve existing legacy records,
 * falling back to canonical `content`, and finally defaulting to "Button".
 */
export function buttonBlockLabel(block?: {
  content?: string | null;
  buttonLabel?: string | null;
} | null): string {
  const buttonLabel = block?.buttonLabel?.trim();
  if (buttonLabel) {
    return buttonLabel;
  }
  const content = block?.content?.trim();
  if (content) {
    return content;
  }
  return "Button";
}
