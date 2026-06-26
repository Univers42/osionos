/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RequestsInbox.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Connection requests inbox: incoming/outgoing tabs (MiniTabs) over the pending
 * edges in useContactsStore. Incoming → accept/decline; outgoing → withdraw.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';

import { Button } from '@/shared/ui/atoms/Button';
import { MiniTabs } from '@/shared/ui/primitives/MiniTabs';
import { useContactsStore } from '@/store/social/useContactsStore';
import type { ContactEdge } from '@/store/social/types';

type Box = 'incoming' | 'outgoing';

const Row: React.FC<{ edge: ContactEdge; children: React.ReactNode }> = ({ edge, children }) => (
  <li className="flex items-center gap-3 border-b border-[var(--osio-border-default)] px-3 py-2.5 last:border-b-0">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
      {edge.peer.avatar ? <img src={edge.peer.avatar} alt="" className="h-full w-full object-cover" /> : edge.peer.name.slice(0, 1).toUpperCase()}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-[var(--osio-fg-default)]">{edge.peer.name}</span>
      {edge.introMessage ? <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{edge.introMessage}</span> : null}
    </span>
    <span className="flex shrink-0 items-center gap-1.5">{children}</span>
  </li>
);

export const RequestsInbox: React.FC = () => {
  const { requests, loading, hydrate, accept, decline, withdraw } = useContactsStore();
  const [box, setBox] = useState<Box>('incoming');

  useEffect(() => { void hydrate(); }, [hydrate]);

  const incoming = useMemo(() => requests.filter((edge) => edge?.peer && edge.direction === 'incoming'), [requests]);
  const outgoing = useMemo(() => requests.filter((edge) => edge?.peer && edge.direction !== 'incoming'), [requests]);
  const rows = box === 'incoming' ? incoming : outgoing;

  return (
    <div className="flex flex-col gap-3">
      <MiniTabs<Box>
        value={box}
        onChange={setBox}
        options={[
          { value: 'incoming', label: 'Incoming', count: incoming.length },
          { value: 'outgoing', label: 'Outgoing', count: outgoing.length },
        ]}
      />
      <ul className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
        {rows.map((edge) => (
          <Row key={edge.id} edge={edge}>
            {box === 'incoming' ? (
              <>
                <Button tone="primary" className="px-2.5 py-1 text-xs" onClick={() => void accept(edge.id)}>
                  <Check size={14} /> Accept
                </Button>
                <Button tone="ghost" className="px-2.5 py-1 text-xs" onClick={() => void decline(edge.id)}>
                  <X size={14} /> Decline
                </Button>
              </>
            ) : (
              <Button tone="ghost" className="px-2.5 py-1 text-xs" onClick={() => void withdraw(edge.id)}>
                Withdraw
              </Button>
            )}
          </Row>
        ))}
        {!loading && rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-[var(--osio-fg-muted)]">
            No {box} requests.
          </li>
        ) : null}
      </ul>
    </div>
  );
};
