/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotificationsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Notifications panel — the activity-rail "Notifications" destination. v1 surfaces
 * incoming connection invitations with inline Accept/Decline (the actionable
 * items, LinkedIn-style). Page-activity ("someone changed work you share") plugs
 * in here as a second source once the bridge exposes an events feed.
 */

import React, { useEffect, useMemo } from 'react';
import { Check, UserPlus, X } from 'lucide-react';

import { Button } from '@/shared/ui/atoms/Button';
import { useContactsStore } from '@/store/social/useContactsStore';
import type { ContactEdge } from '@/store/social/types';

const InviteRow: React.FC<{ edge: ContactEdge; onAccept: () => void; onDecline: () => void }> = ({
  edge,
  onAccept,
  onDecline,
}) => (
  <li className="flex items-center gap-3 border-b border-[var(--osio-border-default)] px-3 py-2.5 last:border-b-0">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
      {edge.peer.avatar ? (
        <img src={edge.peer.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        edge.peer.name.slice(0, 1).toUpperCase()
      )}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-[var(--osio-fg-default)]">
        <strong className="font-semibold">{edge.peer.name}</strong> wants to connect
      </span>
      {edge.introMessage ? (
        <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{edge.introMessage}</span>
      ) : null}
    </span>
    <span className="flex shrink-0 items-center gap-1.5">
      <Button tone="primary" className="px-2.5 py-1 text-xs" onClick={onAccept}>
        <Check size={14} /> Accept
      </Button>
      <Button tone="ghost" className="px-2.5 py-1 text-xs" onClick={onDecline}>
        <X size={14} /> Decline
      </Button>
    </span>
  </li>
);

export const NotificationsPanel: React.FC = () => {
  const { requests, loading, hydrate, accept, decline } = useContactsStore();
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  // Guard `edge?.peer` so a malformed edge can never crash the panel.
  const invites = useMemo(
    () => requests.filter((edge) => edge?.peer && edge.direction === 'incoming'),
    [requests],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {invites.length > 0 ? (
        <ul className="flex flex-col">
          {invites.map((edge) => (
            <InviteRow
              key={edge.id}
              edge={edge}
              onAccept={() => void accept(edge.id)}
              onDecline={() => void decline(edge.id)}
            />
          ))}
        </ul>
      ) : null}
      {!loading && invites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <UserPlus size={22} className="text-[var(--osio-fg-subtle)]" />
          <p className="text-sm text-[var(--osio-fg-muted)]">You&apos;re all caught up.</p>
          <p className="text-xs text-[var(--osio-fg-subtle)]">Connection invitations show up here.</p>
        </div>
      ) : null}
    </div>
  );
};
