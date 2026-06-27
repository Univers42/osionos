/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectButton.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Connect CTA + state pill (none/incoming/outgoing/connected/blocked) for a
 * peer. Opens ConnectNoteModal to compose an intro note; accept/withdraw act
 * inline. NEVER gates opening a DM — chat is open to anyone; this only governs
 * the social connection graph.
 */

import React, { useState } from 'react';
import { Check, Clock, UserPlus, X } from 'lucide-react';

import { ConnectNoteModal } from '@/features/connections/ConnectNoteModal';
import { useConnections } from '@/features/connections/useConnections';
import { Button } from '@/shared/ui/atoms/Button';

interface ConnectButtonProps {
  userId: string;
  name?: string;
  size?: 'sm' | 'md';
}

export const ConnectButton: React.FC<ConnectButtonProps> = ({ userId, name, size = 'md' }) => {
  const { state, edge, accept, withdraw } = useConnections(userId);
  const [composing, setComposing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : '';

  if (state === 'blocked') {
    return <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--osio-fg-subtle)] ${pad}`}>Blocked</span>;
  }
  if (state === 'connected') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm text-[var(--osio-success)] ${pad}`}>
        <Check size={size === 'sm' ? 14 : 16} /> Connected
      </span>
    );
  }
  if (state === 'incoming' && edge) {
    return (
      <Button tone="primary" className={pad} onClick={() => void accept(edge.id)}>
        <UserPlus size={size === 'sm' ? 14 : 16} /> Accept
      </Button>
    );
  }
  if (state === 'outgoing' && edge) {
    // Two intentional clicks to withdraw (resets on mouse-leave) so a single stray click on
    // the status pill no longer silently cancels a request you've sent.
    return (
      <Button
        tone={confirmWithdraw ? 'danger' : 'ghost'}
        className={pad}
        onMouseLeave={() => setConfirmWithdraw(false)}
        title={confirmWithdraw ? 'Click again to withdraw your request' : 'Request sent'}
        onClick={() => {
          if (confirmWithdraw) { setConfirmWithdraw(false); void withdraw(edge.id); }
          else setConfirmWithdraw(true);
        }}
      >
        {confirmWithdraw
          ? <><X size={size === 'sm' ? 14 : 16} /> Withdraw?</>
          : <><Clock size={size === 'sm' ? 14 : 16} /> Requested</>}
      </Button>
    );
  }

  return (
    <>
      <Button tone="default" className={pad} onClick={() => setComposing(true)}>
        <UserPlus size={size === 'sm' ? 14 : 16} /> Connect
      </Button>
      <ConnectNoteModal userId={userId} name={name} open={composing} onClose={() => setComposing(false)} />
    </>
  );
};

export type { ConnectButtonProps };
