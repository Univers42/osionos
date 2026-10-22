/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useProfessionStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The profession a member picked.
 *
 * The pick is written through the account profile route, so it carries the profile's
 * ETag and a row that moved answers a conflict. The store retries once with the version
 * the server handed back — one retry, never a loop — and a second refusal keeps the
 * value the user had.
 *
 * The store holds no version of its own: the account profile store is the one holder,
 * so a pick and the profile form never carry two ETags for one row.
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { isProfessionId, type ProfessionId } from '@/data/professions/professions';
import { useAccountProfileStore } from '@/store/settings/useAccountProfileStore';
import { pushSettingsError } from '@/store/settings/settingsStoreUtils';

const STORE_NAME = 'osionos:profession';

// The default storage of the persist middleware reads the `localStorage` identifier,
// which does not exist outside a browser: the pick would then be kept in memory only.
// Reading it off globalThis keeps the store working where there is no storage at all.
const browserStorage: StateStorage = {
  getItem: (name) => globalThis.localStorage?.getItem(name) ?? null,
  setItem: (name, value) => globalThis.localStorage?.setItem(name, value),
  removeItem: (name) => globalThis.localStorage?.removeItem(name),
};

export interface ProfessionStore {
  profession: ProfessionId | null;
  open: boolean;
  busy: boolean;
  error: string | null;
  setOpen: (open: boolean) => void;
  hydrate: () => Promise<void>;
  pick: (id: ProfessionId) => Promise<void>;
}

/** The version the client holds, or null when the account plane is not there.
 *
 * Only an `unavailable` hydrate (no account plane) resolves to `null`; any other
 * failure (500, network, ...) is re-thrown so the caller can surface it instead of
 * silently treating the server as absent. */
async function ensureVersion(): Promise<number | null> {
  const account = useAccountProfileStore.getState();
  if (account.version !== null) return account.version;
  const outcome = await account.hydrate();
  if (!outcome.ok) {
    if (outcome.reason === 'unavailable') return null;
    throw new Error(outcome.reason === 'failed' ? outcome.message : 'The profile could not be read.');
  }
  return useAccountProfileStore.getState().version;
}

export const useProfessionStore = create<ProfessionStore>()(
  persist(
    (set, get) => ({
      profession: null,
      open: false,
      busy: false,
      error: null,

      setOpen: (open) => set({ open }),

      hydrate: async () => {
        const outcome = await useAccountProfileStore.getState().hydrate();
        if (!outcome.ok) return;
        const saved = outcome.profile.profession;
        set({ profession: isProfessionId(saved) ? saved : null });
      },

      pick: async (id) => {
        if (get().busy) return;
        set({ busy: true, error: null });
        try {
          let version: number | null;
          try {
            version = await ensureVersion();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'The profile could not be read.';
            set({ error: message });
            pushSettingsError('Could not save the profession', new Error(message));
            return;
          }
          if (version === null) {
            // No account plane: the pick stays local, and the next hydrate syncs it.
            set({ profession: id });
            return;
          }
          let outcome = await useAccountProfileStore.getState().save({ profession: id });
          let attempts = 0;
          while (!outcome.ok && outcome.reason === 'conflict' && attempts < 1) {
            attempts += 1;
            outcome = await useAccountProfileStore.getState().save({ profession: id });
          }
          if (outcome.ok) {
            const saved = outcome.profile.profession;
            set({ profession: isProfessionId(saved) ? saved : id });
            return;
          }
          if (outcome.reason === 'unavailable') {
            set({ profession: id });
            return;
          }
          const message = outcome.reason === 'conflict'
            ? 'The profile changed in another tab or device. Pick again.'
            : outcome.reason === 'invalid'
              ? `The server refused ${outcome.field ? `the "${outcome.field}" field` : 'the profession'}.`
              : outcome.message;
          set({ error: message });
          pushSettingsError('Could not save the profession', new Error(message));
        } finally {
          set({ busy: false });
        }
      },
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => browserStorage),
      partialize: (state) => ({ profession: state.profession }),
    },
  ),
);
