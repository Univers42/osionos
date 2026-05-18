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
import { persist } from 'zustand/middleware';

import { createLocalId, errorMessage, nowIso, pushSettingsError, removeById, trySettingsDelete, trySettingsGet, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { PasskeyRecord } from './types';

interface AccountPasskeysStore {
  data: PasskeyRecord[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  registerOptions: (nickname?: string) => Promise<Record<string, unknown> | null>;
  verifyRegistration: (payload: unknown, nickname?: string) => Promise<PasskeyRecord | null>;
  rename: (passkeyId: string, nickname: string) => void;
  remove: (passkeyId: string) => Promise<void>;
  reset: () => void;
}

const STORE_NAME = 'osionos:settings:account-passkeys';

function localPasskey(nickname?: string): PasskeyRecord {
  const timestamp = nowIso();
  return {
    _id: createLocalId('passkey'),
    userId: 'local',
    credentialId: createLocalId('credential'),
    publicKey: 'local-passkey',
    counter: 0,
    transports: ['internal'],
    nickname: nickname || 'Local passkey',
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export const useAccountPasskeysStore = create<AccountPasskeysStore>()(
  persist(
    (set, get) => ({
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
      registerOptions: async (nickname) => {
        try {
          return await trySettingsPost<Record<string, unknown>>('/api/account/passkeys/register/options', { nickname });
        } catch (error) {
          set({ error: errorMessage(error) });
          pushSettingsError('Could not start passkey setup', error);
          return null;
        }
      },
      verifyRegistration: async (payload, nickname) => {
        const previous = get().data;
        try {
          const record = payload as Record<string, unknown>;
          const response = record.response as Record<string, unknown> | undefined;
          const remote = await trySettingsPost<PasskeyRecord>('/api/account/passkeys/register/verify', {
            credentialId: String(record.id ?? record.rawId ?? createLocalId('credential')),
            publicKey: String(response?.publicKey ?? response?.attestationObject ?? 'browser-passkey'),
            transports: Array.isArray(response?.transports) ? response.transports : [],
            nickname,
          });
          const passkey = remote ?? localPasskey(nickname);
          set({ data: upsertById(previous, passkey), error: null });
          return passkey;
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not add passkey', error);
          return null;
        }
      },
      rename: (passkeyId, nickname) => {
        const timestamp = nowIso();
        set({ data: get().data.map((passkey) => passkey._id === passkeyId ? { ...passkey, nickname, updatedAt: timestamp } : passkey), error: null });
      },
      remove: async (passkeyId) => {
        const previous = get().data;
        set({ data: removeById(previous, passkeyId), error: null });
        try {
          await trySettingsDelete<void>(`/api/account/passkeys/${encodeURIComponent(passkeyId)}`);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not remove passkey', error);
        }
      },
      reset: () => set({ data: [], error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
