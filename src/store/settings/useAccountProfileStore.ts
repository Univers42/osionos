/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountProfileStore.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one holder of the server profile.
 *
 * The row has a version and a write carries it as an `If-Match`, so somebody has to
 * remember which version the client holds. That somebody is this store, and only this
 * store: a profession pick and the profile form write the same row, and two holders
 * would be two ETags for one row — one of them stale, and a stale ETag is a 412.
 *
 * The version lives in memory. It is never persisted: a version from yesterday is not a
 * version, it is a conflict waiting to happen.
 */

import { create } from 'zustand';

import {
  fetchAccountProfile,
  saveAccountProfile,
  type AccountProfile,
  type AccountProfileOutcome,
  type AccountProfilePatch,
} from '@/shared/api/accountProfileApi';

export type AccountProfileStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface AccountProfileStore {
  status: AccountProfileStatus;
  profile: AccountProfile | null;
  version: number | null;
  error: string | null;
  hydrate: () => Promise<AccountProfileOutcome>;
  save: (patch: AccountProfilePatch) => Promise<AccountProfileOutcome>;
}

export const useAccountProfileStore = create<AccountProfileStore>()((set, get) => ({
  status: 'idle',
  profile: null,
  version: null,
  error: null,

  hydrate: async () => {
    set({ status: 'loading', error: null });
    const outcome = await fetchAccountProfile();
    if (outcome.ok) {
      set({ status: 'ready', profile: outcome.profile, version: outcome.version, error: null });
      return outcome;
    }
    if (outcome.reason === 'unavailable') {
      set({ status: 'unavailable', profile: null, version: null, error: null });
      return outcome;
    }
    set({ status: 'error', error: outcome.reason === 'failed' ? outcome.message : 'The profile could not be read.', version: null });
    return outcome;
  },

  save: async (patch) => {
    const outcome = await saveAccountProfile(patch, get().version ?? Number.NaN);
    if (outcome.ok) {
      set({ status: 'ready', profile: outcome.profile, version: outcome.version, error: null });
      return outcome;
    }
    if (outcome.reason === 'conflict') {
      // The server's row and its version: the next write goes against them, so a retry
      // never writes over a row the client has not seen.
      set({ profile: outcome.profile ?? get().profile, version: outcome.version ?? get().version });
      return outcome;
    }
    if (outcome.reason === 'invalid') {
      set({ error: outcome.field ? `The server refused the "${outcome.field}" field.` : 'The server refused one of the values.' });
      return outcome;
    }
    if (outcome.reason === 'unavailable') {
      set({ status: 'unavailable' });
      return outcome;
    }
    set({ status: 'error', error: outcome.message });
    return outcome;
  },
}));
