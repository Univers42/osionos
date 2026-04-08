/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CalloutBlockReadOnly.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@src/types/database';
import { CALLOUT_COLORS } from './PlaygroundPageEditorConstants';

export const CalloutBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const icon = block.color || '💡';
  const colors = CALLOUT_COLORS[icon] || { bg: 'bg-[var(--color-surface-secondary)]', border: 'border-[var(--color-line)]', text: 'text-[var(--color-ink)]' };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border my-0.5 ${colors.bg} ${colors.border}`}>
      <span className={`text-lg shrink-0 ${colors.text}`}>{icon}</span>
      <span className={`text-sm ${colors.text} leading-relaxed py-0.5 flex-1`}>{block.content}</span>
    </div>
  );
};
