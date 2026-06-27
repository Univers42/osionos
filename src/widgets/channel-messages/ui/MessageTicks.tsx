/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageTicks.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Delivery ticks for the author's own messages: single Check = sent, double
 * CheckCheck = delivered, double + accent = seen. State is the ephemeral
 * useReceiptsStore keyed by message id (defaults to 'sent' until a peer
 * receipt arrives). Rendered inline beside the timestamp in MessageRow.
 */

import React from 'react';
import { Check, CheckCheck } from 'lucide-react';

import { useReceiptsStore, type ReceiptStatus } from '@/store/chat/useReceiptsStore';

interface MessageTicksProps {
  messageId: string;
}

const LABEL: Record<ReceiptStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  seen: 'Seen',
};

export const MessageTicks: React.FC<MessageTicksProps> = ({ messageId }) => {
  const status = useReceiptsStore((s) => s.receipts[messageId]) ?? 'sent';
  const color = status === 'seen' ? 'var(--osio-accent)' : 'var(--osio-fg-subtle)';

  return (
    <span
      className="inline-flex items-center"
      style={{ color }}
      aria-label={LABEL[status]}
      title={LABEL[status]}
    >
      {status === 'sent' ? <Check size={13} /> : <CheckCheck size={13} />}
    </span>
  );
};
