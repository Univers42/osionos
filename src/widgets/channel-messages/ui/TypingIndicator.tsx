/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TypingIndicator.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "X is typing…" line shown just above the composer. Reads the ephemeral
 * useReceiptsStore typing map for this channel; entries self-expire on the
 * timer in useChannelReceipts, so this stays purely presentational. Renders
 * nothing when no one is typing. Names are resolved best-effort from the
 * current message list (id → authorName); falls back to "Someone".
 */

import React from 'react';

import { useReceiptsStore } from '@/store/chat/useReceiptsStore';

interface TypingIndicatorProps {
  channelId: string;
  /** id → display name, e.g. from the loaded message authors. */
  names?: Record<string, string>;
}

function phrase(typers: string[], names: Record<string, string>): string {
  const labels = typers.map((id) => names[id] ?? 'Someone');
  if (labels.length === 1) return `${labels[0]} is typing…`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} are typing…`;
  return 'Several people are typing…';
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ channelId, names = {} }) => {
  const typers = useReceiptsStore((s) => s.typing[channelId]) ?? [];
  if (typers.length === 0) return null;

  return (
    <div className="px-1 pb-1 text-xs italic text-[var(--osio-fg-muted)]" aria-live="polite">
      {phrase(typers, names)}
    </div>
  );
};
