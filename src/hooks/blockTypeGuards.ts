/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockTypeGuards.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:08 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:09 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Block type guard utilities.
 * Standalone replacement for @src/hooks/blockTypeGuards.
 */
import type { BlockType } from '../types/database';

const HEADING_TYPES: Set<string> = new Set([
  'heading_1', 'heading_2', 'heading_3',
  'heading_4', 'heading_5', 'heading_6',
]);

const LIST_TYPES: Set<string> = new Set([
  'bulleted_list', 'numbered_list',
]);

const CONTINUES_ON_ENTER: Set<string> = new Set([
  'bulleted_list', 'numbered_list', 'to_do',
]);

export function isHeadingType(type: BlockType): boolean {
  return HEADING_TYPES.has(type);
}

export function isListType(type: BlockType): boolean {
  return LIST_TYPES.has(type);
}

export function isTodoType(type: BlockType): boolean {
  return type === 'to_do';
}

/** Returns true if pressing Enter should create a new block of the same type. */
export function continuesWithSameTypeOnEnter(type: BlockType): boolean {
  return CONTINUES_ON_ENTER.has(type);
}

/** Returns true when the text content is effectively empty (blank / whitespace). */
export function isEffectivelyEmpty(text: string): boolean {
  return !text || text.trim().length === 0;
}
