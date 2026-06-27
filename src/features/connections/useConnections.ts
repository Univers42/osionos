/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConnections.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Thin hook over useContactsStore + useBlocksStore for a single peer userId.
 * Resolves the current connection state pill and exposes the store actions the
 * ConnectButton / ContactContextMenu need. Hydrates both stores once on mount.
 */

import { useEffect, useMemo } from 'react';

import { useBlocksStore } from '@/store/social/useBlocksStore';
import { useContactsStore } from '@/store/social/useContactsStore';
import type { ContactEdge } from '@/store/social/types';

export type ConnectState = 'none' | 'incoming' | 'outgoing' | 'connected' | 'blocked';

function edgeFor(userId: string, data: ContactEdge[], requests: ContactEdge[]): ContactEdge | null {
  // Guard `edge?.peer?.id`: a malformed/undefined edge (e.g. a bad API response or
  // stale persisted state) must NOT throw and blank the whole app via the error boundary.
  return (
    data.find((edge) => edge?.peer?.id === userId) ??
    requests.find((edge) => edge?.peer?.id === userId) ??
    null
  );
}

export function useConnections(userId: string) {
  const contacts = useContactsStore();
  const blocks = useBlocksStore();

  useEffect(() => {
    void contacts.hydrate();
    void blocks.hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const edge = useMemo(
    () => edgeFor(userId, contacts.data, contacts.requests),
    [userId, contacts.data, contacts.requests],
  );
  const isBlocked = useMemo(
    () => blocks.data.some((item) => item.userId === userId),
    [userId, blocks.data],
  );

  let state: ConnectState = 'none';
  if (isBlocked) state = 'blocked';
  else if (edge?.status === 'accepted') state = 'connected';
  else if (edge?.status === 'pending') state = edge.direction === 'incoming' ? 'incoming' : 'outgoing';

  return {
    state,
    edge,
    isBlocked,
    sendRequest: contacts.sendRequest,
    accept: contacts.accept,
    decline: contacts.decline,
    withdraw: contacts.withdraw,
    remove: contacts.remove,
    block: blocks.block,
    unblock: blocks.unblock,
  };
}
