/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSharedSpacePage.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Opens the page-scoped realtime channel for the page being viewed and closes it
 * on navigation/unmount (C501). The workspace channel stays connected; this hook
 * only affects `collabpage:<pageId>`.
 *
 * A token 404/403 means the caller cannot read the page: the store records
 * `pageStatus: 'unavailable'` and this effect does NOT retry — it only re-runs
 * when the page (or space/self) actually changes.
 */

import { useEffect } from 'react';

import { joinSharedSpacePage } from '../api/grobaseTransport.factory';
import { useCollabStore, type CollabSelf } from '../store/useCollabStore';

export function useSharedSpacePage(
  spaceId: string | null, pageId: string | null, self: CollabSelf | null,
): void {
  const connectPage = useCollabStore((state) => state.connectPage);
  const disconnectPage = useCollabStore((state) => state.disconnectPage);
  const publishPresence = useCollabStore((state) => state.publishPresence);
  const selfId = self?.id ?? null;
  const displayName = self?.displayName ?? '';
  const avatarRef = self?.avatarRef;

  // Presence details intentionally do not re-run this effect (C501/C502): the
  // page channel is bound to ids, and renames flow through publishPresence below.
  useEffect(() => {
    if (!spaceId || !pageId || !selfId) {
      disconnectPage();
      return undefined;
    }
    void connectPage(spaceId, pageId, { id: selfId, displayName, avatarRef }, joinSharedSpacePage);
    return () => disconnectPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, pageId, selfId, connectPage, disconnectPage]);

  useEffect(() => {
    if (!spaceId || !pageId || !selfId) return;
    publishPresence({ displayName, avatarRef });
  }, [spaceId, pageId, selfId, displayName, avatarRef, publishPresence]);
}
