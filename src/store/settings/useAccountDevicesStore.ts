/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountDevicesStore.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';

import { reportRevokedSession } from '@/shared/api/client';
import { errorMessage, pushSettingsError, settingsJwt, trySettingsDelete, trySettingsGet } from './settingsStoreUtils';
import type { SessionRow } from './types';

export type SessionsStatus = 'loading' | 'ready' | 'unavailable' | 'error';

interface AccountDevicesStore {
  data: SessionRow[];
  status: SessionsStatus;
  error: string | null;
  userId: string | null;
  hydrate: (userId: string) => Promise<void>;
  revoke: (sessionId: string) => Promise<void>;
}

/**
 * The signed-in sessions of this account, as the bridge lists them. Server state only: it is
 * never persisted (a row carries a user agent and a network), and nothing is invented when the
 * server cannot answer. "Revoke all" is the bridge logout, owned by the auth feature.
 *
 * Caveat: the list is capped at 50 families by the bridge; a person with more sees the newest.
 */
export const useAccountDevicesStore = create<AccountDevicesStore>()((set, get) => ({
  data: [],
  status: 'loading',
  error: null,
  userId: null,
  hydrate: async (userId) => {
    if (!userId) return;
    set({ status: 'loading', error: null, userId });
    try {
      const remote = await trySettingsGet<{ sessions?: SessionRow[] }>('/api/account/sessions');
      if (remote === null) set({ data: [], status: 'unavailable' });
      else set({ data: Array.isArray(remote.sessions) ? remote.sessions : [], status: 'ready' });
    } catch (error) {
      set({ data: [], status: 'error', error: errorMessage(error) });
    }
  },
  revoke: async (sessionId) => {
    const previous = get().data;
    const revoked = previous.find((row) => row.id === sessionId);
    const token = settingsJwt();
    set({ data: previous.filter((row) => row.id !== sessionId), error: null });
    try {
      await trySettingsDelete<void>(`/api/account/sessions/${encodeURIComponent(sessionId)}`);
    } catch (error) {
      set({ data: previous, error: errorMessage(error) });
      pushSettingsError('Could not revoke session', error);
      return;
    }
    // Otherwise this tab stays signed in until the bridge's next poll refuses its token.
    if (revoked?.current && token) reportRevokedSession(token);
  },
}));
