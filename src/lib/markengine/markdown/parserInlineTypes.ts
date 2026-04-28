/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserInlineTypes.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:23:30 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:23:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — inline formatting types
import type { InlineNode } from './ast';

export interface InlineMatchResult {
  start: number;
  end: number;
  node: InlineNode;
}

export type InlineMatcher = (text: string, pos: number) => InlineMatchResult | null;

export type InlineParser = (text: string) => InlineNode[];
