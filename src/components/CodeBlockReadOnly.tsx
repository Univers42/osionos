/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeBlockReadOnly.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@src/types/database';

export const CodeBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const lang = block.language || 'plaintext';

  return (
    <div className="my-1 rounded-lg overflow-hidden border border-[var(--color-line)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-secondary)] border-b border-[var(--color-line)]">
        <span className="text-[11px] font-mono text-[var(--color-ink-muted)]">{lang}</span>
      </div>
      <pre className="p-3 bg-[var(--color-surface-primary)] overflow-x-auto">
        <code className="text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre">
          {block.content}
        </code>
      </pre>
    </div>
  );
};
