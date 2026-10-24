/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountPasskeysStore.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';

import { errorMessage, nowIso, pushSettingsError, removeById, trySettingsDelete, trySettingsGet, trySettingsPatch } from './settingsStoreUtils';
import type { PasskeyRecord } from './types';

// The server (public.webauthn_credentials, through the bridge) is the only source: nothing is
// persisted here, so a passkey that was never really registered cannot linger in localStorage.
// Passkeys are managed, not created, in this app: registering one is the control plane's job.
interface AccountPasskeysStore {
  data: PasskeyRecord[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  rename: (passkeyId: string, nickname: string) => Promise<void>;
  remove: (passkeyId: string) => Promise<void>;
  reset: () => void;
}

export const useAccountPasskeysStore = create<AccountPasskeysStore>()((set, get) => ({
  data: [],
  loading: false,
  error: null,
  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const remote = await trySettingsGet<PasskeyRecord[]>('/api/account/passkeys');
      set({ data: remote ?? get().data, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      pushSettingsError('Passkeys unavailable', error);
    }
  },
  rename: async (passkeyId, nickname) => {
    const previous = get().data;
    set({ data: previous.map((passkey) => passkey._id === passkeyId ? { ...passkey, nickname, updatedAt: nowIso() } : passkey), error: null });
    try {
      const saved = await trySettingsPatch<PasskeyRecord>(`/api/account/passkeys/${encodeURIComponent(passkeyId)}`, { nickname });
      if (saved) set({ data: get().data.map((passkey) => passkey._id === passkeyId ? saved : passkey) });
      else set({ data: previous });
    } catch (error) {
      set({ data: previous, error: errorMessage(error) });
      pushSettingsError('Could not rename passkey', error);
    }
  },
  remove: async (passkeyId) => {
    const previous = get().data;
    set({ data: removeById(previous, passkeyId), error: null });
    try {
      const done = await trySettingsDelete<unknown>(`/api/account/passkeys/${encodeURIComponent(passkeyId)}`);
      if (done === null) set({ data: previous });
    } catch (error) {
      set({ data: previous, error: errorMessage(error) });
      pushSettingsError('Could not remove passkey', error);
    }
  },
  reset: () => set({ data: [], error: null }),
}));
