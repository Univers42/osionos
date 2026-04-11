/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:38 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * DatabaseBlock — placeholder surface backed by the shared asset board.
 */
import React from 'react';
import {
  IconBoard,
} from '@/shared/lib/uiCollectionAssets';
import { CompactAssetPickerBoard } from '@/shared/ui';

interface DatabaseBlockProps {
  databaseId?: string;
  initialViewId?: string;
  mode?: 'inline' | 'full';
}

export const DatabaseBlock: React.FC<DatabaseBlockProps> = ({
  databaseId,
  mode = 'inline',
}) => (
  <div className={`border border-dashed border-[var(--color-line)] rounded-lg p-4 my-2 ${
    mode === 'full' ? 'h-full' : ''
  }`}>
    <div className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
      <IconBoard />
      <span>Database view</span>
      {databaseId && (
        <span className="text-xs font-mono text-[var(--color-ink-faint)]">
          ({databaseId})
        </span>
      )}
    </div>
    <p className="text-xs text-[var(--color-ink-faint)] mt-1">
      Package-backed board placeholder for table, board, and gallery views.
    </p>
    <div className="mt-4">
      <CompactAssetPickerBoard
        label="Selector de assets"
        width="100%"
        onSerializedValueChange={() => {
          // Placeholder until database view selection is wired to store state.
        }}
      />
    </div>
  </div>
);
