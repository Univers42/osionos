/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBlocksRenderer.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@src/types/database';
import { ReadOnlyBlock } from './ReadOnlyBlock';

interface PageBlocksRendererProps {
  blocks: Block[];
}

/**
 * Renders an array of Block objects as read-only HTML.
 * Tracks numbered list indices correctly (resets when a non-numbered block appears).
 */
export const PageBlocksRenderer: React.FC<PageBlocksRendererProps> = ({ blocks }) => {
  let numberedIndex = 0;

  return (
    <div className="flex flex-col">
      {blocks.map((block, i) => {
        // Track numbered list index (reset when type changes)
        if (block.type === 'numbered_list') {
          numberedIndex++;
        } else {
          numberedIndex = 0;
        }

        const effectiveIndex = block.type === 'numbered_list' ? numberedIndex - 1 : i;

        return (
          <ReadOnlyBlock
            key={block.id}
            block={block}
            index={effectiveIndex}
          />
        );
      })}
    </div>
  );
};
