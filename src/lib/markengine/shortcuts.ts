/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcuts.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:08 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:09 by dlesieur         ###   ########.fr       */
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
