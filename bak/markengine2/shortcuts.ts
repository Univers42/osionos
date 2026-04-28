/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcuts.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:03 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:26:04 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export {
  parseInlineMarkdown,
  renderInlineToReact,
  parseMarkdownToBlocks,
  BLOCK_SHORTCUTS,
  detectBlockType,
} from "./markdown/shortcuts";
export type { BlockDetection } from "./shortcutsDetect";
