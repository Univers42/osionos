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
 * DatabaseBlock stub — placeholder for database views.
 * In a full implementation, this renders table/board/gallery views.
 * For standalone mode, it renders a placeholder.
 */
import React from 'react';

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
      <span className="text-lg">🗃️</span>
      <span>Database view</span>
      {databaseId && (
        <span className="text-xs font-mono text-[var(--color-ink-faint)]">
          ({databaseId})
        </span>
      )}
    </div>
    <p className="text-xs text-[var(--color-ink-faint)] mt-1">
      Connect a database backend to enable table/board/gallery views.
    </p>
  </div>
);
