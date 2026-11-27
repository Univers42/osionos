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
 * timer in useChannelReceipts, so this stays purely presentational. The live region stays mounted
 * (empty when no one is typing) so screen readers announce changes. Names are resolved best-effort from the
 * current message list (id → authorName); falls back to "Someone".
 */

import React from 'react';

import { TypingDots } from '@/shared/ui/typing/TypingDots';
import { useReceiptsStore } from '@/store/chat/useReceiptsStore';

import { typingPhrase } from '../model/aiTyping';

interface TypingIndicatorProps {
  channelId: string;
  /** id → display name, e.g. from the loaded message authors. */
  names?: Record<string, string>;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ channelId, names = {} }) => {
  const typers = useReceiptsStore((s) => s.typing[channelId]) ?? [];
  const typing = typers.length > 0;

  return (
    <div className={typing ? 'flex items-center gap-1.5 px-1 pb-1 text-xs italic text-[var(--osio-fg-muted)]' : undefined} aria-live="polite">
      {typing && <TypingDots />}
      {typing && typingPhrase(typers, names)}
    </div>
  );
};
