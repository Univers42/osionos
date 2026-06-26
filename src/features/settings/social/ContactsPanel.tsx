/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ContactsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Settings panel: accepted connections + pending incoming/outgoing requests. */

import React, { useEffect } from 'react';

import { Button, Card, SectionHeader } from '@/shared/ui';
import { RequestsInbox } from '@/features/connections/RequestsInbox';
import { useContactsStore } from '@/store/social/useContactsStore';
import type { ContactEdge } from '@/store/social/types';

function PeerRow({ edge, action }: { edge: ContactEdge; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
        {edge.peer.name}
        {edge.introMessage ? <span className="text-[var(--osio-fg-muted)]"> — {edge.introMessage}</span> : null}
      </span>
      {action}
    </li>
  );
}

export const ContactsPanel: React.FC = () => {
  const { data, loading, hydrate, remove } = useContactsStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <div className="flex flex-col gap-4">
      <RequestsInbox />

      <Card>
        <div className="flex flex-col gap-3">
          <SectionHeader title={`Connections (${data.length})`} />
          {loading && data.length === 0 ? (
            <p className="text-sm text-[var(--osio-fg-muted)]">Loading…</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-[var(--osio-fg-muted)]">No connections yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.map((edge) => (
                <PeerRow
                  key={edge.id}
                  edge={edge}
                  action={<Button tone="ghost" onClick={() => void remove(edge.id)}>Remove</Button>}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};
