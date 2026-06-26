/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConnectionNotifications.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live connection-notification glue for the activity-rail bell. Re-hydrates the
 * contacts inbox whenever the bridge publishes a connection event to this user's
 * realtime topic (`user:<id>` — see bridge-social.mjs createConnection /
 * patchConnection), so the badge + Notifications panel update without a manual
 * refresh. Inert (no-op disposer) when realtime is off — the panel still hydrates
 * on open. Also exposes the incoming-invitation count that drives the badge.
 */

import { useEffect } from 'react';

import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { useContactsStore } from '@/store/social/useContactsStore';
import { useUserStore } from '@/features/auth';

export function useConnectionNotifications(): void {
  const activeUserId = useUserStore((s) => s.activeUserId);
  useEffect(() => {
    if (!activeUserId) return undefined;
    void useContactsStore.getState().hydrate();
    // The user topic only carries connection events today, so any frame → refresh.
    return subscribeTopic(`user:${activeUserId}`, () => {
      void useContactsStore.getState().hydrate();
    });
  }, [activeUserId]);
}

/** Count of incoming pending invitations — the rail bell badge. */
export function useIncomingInviteCount(): number {
  return useContactsStore((s) => s.requests.filter((edge) => edge?.direction === 'incoming').length);
}
