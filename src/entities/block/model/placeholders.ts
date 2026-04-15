/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   placeholders.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/15 00:00:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/15 00:00:00 by rstancu         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "./types";

export function getBlockPlaceholder(block: Block, fallback: string): string {
  return typeof block.placeholderText === "string" &&
    block.placeholderText.trim().length > 0
    ? block.placeholderText
    : fallback;
}
