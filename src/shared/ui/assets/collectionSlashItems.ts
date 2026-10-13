/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collectionSlashItems.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The slash-menu entries this editor supports, out of ui-collection's catalog. Kept apart
// from the asset-picker config so the editor's boot path does not load the pickers.

import {
  SLASH_ITEMS as PACKAGE_SLASH_ITEMS,
  type SlashMenuItem as PackageSlashMenuItem,
} from '@univers42/ui-collection';
import type { BlockType } from '@/entities/block';

export { SECTION_LABELS as COLLECTION_SLASH_SECTION_LABELS } from '@univers42/ui-collection';

const SUPPORTED_SLASH_TYPES = new Set<BlockType>([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'heading_5',
  'heading_6',
  'bulleted_list',
  'numbered_list',
  'to_do',
  'toggle',
  'image',
  'video',
  'audio',
  'file',
  'code',
  'quote',
  'callout',
  'divider',
  'table_block',
  'database_inline',
  'database_full_page',
]);

export const COLLECTION_SLASH_ITEMS = PACKAGE_SLASH_ITEMS.filter(
  (
    item,
  ): item is PackageSlashMenuItem & {
    type: BlockType;
  } => {
    if (!SUPPORTED_SLASH_TYPES.has(item.type as BlockType)) {
      return false;
    }

    if (item.type !== 'callout') {
      return true;
    }

    const firstCallout = PACKAGE_SLASH_ITEMS.find(
      (candidate) => candidate.type === 'callout',
    );

    return firstCallout === item;
  },
);
