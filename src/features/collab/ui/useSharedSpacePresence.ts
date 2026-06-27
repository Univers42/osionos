/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSharedSpacePresence.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The single React seam that wires the collab store to the grobase transport
 * (AOC §6). It hands `joinSharedSpace` (the one factory that reaches the one
 * adapter) to the transport-free store, then connects on mount / disconnects on
 * unmount or when the space changes. Primitive deps only, so a re-render with an
 * equal self does NOT reconnect. Gated by `isSharedCollabEnabled()` upstream.
 */

import { useEffect } from 'react';

import { joinSharedSpace } from '../api/grobaseTransport.factory';
import { useCollabStore, type CollabSelf } from '../store/useCollabStore';

export function useSharedSpacePresence(spaceId: string | null, self: CollabSelf | null): void {
  const connect = useCollabStore((state) => state.connect);
  const disconnect = useCollabStore((state) => state.disconnect);
  const selfId = self?.id ?? null;
  const displayName = self?.displayName ?? '';
  const avatarRef = self?.avatarRef;

  useEffect(() => {
    if (!spaceId || !selfId) return undefined;
    void connect(spaceId, { id: selfId, displayName, avatarRef }, joinSharedSpace);
    return () => disconnect();
  }, [spaceId, selfId, displayName, avatarRef, connect, disconnect]);
}
