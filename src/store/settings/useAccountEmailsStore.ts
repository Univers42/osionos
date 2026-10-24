/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountEmailsStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { addEmail, removeEmail, resendEmailCode, verifyEmail, type CodeRequested } from '@/shared/api/accountEmailsApi';
import type { AccountSecurityOutcome } from '@/shared/api/accountSecurityApi';

import { currentAccountEpoch } from './accountEpoch';
import { defaultEmail } from './defaults';
import { errorMessage, pushSettingsError, trySettingsGet } from './settingsStoreUtils';
import type { EmailRecord } from './types';

interface AccountEmailsStore {
  data: EmailRecord[];
  loading: boolean;
  error: string | null;
  hydrate: (userId: string, email?: string) => Promise<void>;
  reset: (userId: string, email?: string) => void;
  add: (email: string) => Promise<AccountSecurityOutcome<CodeRequested>>;
  resend: (id: string) => Promise<AccountSecurityOutcome<CodeRequested>>;
  verify: (id: string, code: string) => Promise<AccountSecurityOutcome<true>>;
  remove: (id: string) => Promise<AccountSecurityOutcome<true>>;
}

const STORE_NAME = 'osionos:settings:account-emails';
const isPrimary = (record: EmailRecord): boolean => record.isPrimary;

// Not persisted: who to re-read for after a mutation.
let hydratedFor: { userId: string; email?: string } | null = null;

// Caveat: a secondary is never written to localStorage (the primary is, as before), so a cold boot
// shows the primary until the first fetch answers. Persisted `email-*` rows of builds before
// this one are dropped by `migrate`.
export const useAccountEmailsStore = create<AccountEmailsStore>()(
  persist(
    (set, get) => {
      // No optimistic row: a success is followed by a read, a failure leaves `data` untouched.
      async function refreshAfter<T>(outcome: AccountSecurityOutcome<T>): Promise<AccountSecurityOutcome<T>> {
        if (outcome.ok && hydratedFor) await get().hydrate(hydratedFor.userId, hydratedFor.email);
        return outcome;
      }
      return {
        data: [],
        loading: false,
        error: null,
        hydrate: async (userId, email) => {
          if (!userId) return;
          hydratedFor = { userId, email };
          // Another user's rows go; this user's stay in view while the read is in flight.
          // `email-*` ids are the fake rows older builds made up; real ids are the server's UUIDs.
          const mine = get().data.filter((record) => record.userId === userId && !record._id.startsWith('email-'));
          set({ data: mine, loading: true, error: null });
          const epoch = currentAccountEpoch();
          const sessionRow = email ? [defaultEmail(userId, email)] : [];
          try {
            const remote = await trySettingsGet<EmailRecord[]>('/api/account/emails');
            if (epoch !== currentAccountEpoch()) return;
            set({ data: remote ?? sessionRow, loading: false, error: null });
          } catch (error) {
            if (epoch !== currentAccountEpoch()) return;
            set({ data: [...sessionRow, ...mine.filter((record) => !isPrimary(record))], loading: false, error: errorMessage(error) });
            pushSettingsError('Emails unavailable', error);
          }
        },
        reset: (userId, email) => set({ data: email ? [defaultEmail(userId || 'anonymous', email)] : [], error: null }),
        add: async (email) => refreshAfter(await addEmail(email)),
        resend: async (id) => refreshAfter(await resendEmailCode(id)),
        verify: async (id, code) => refreshAfter(await verifyEmail(id, code)),
        remove: async (id) => refreshAfter(await removeEmail(id)),
      };
    },
    {
      name: STORE_NAME,
      version: 1,
      partialize: (state) => ({ data: state.data.filter(isPrimary) }),
      migrate: (stored) => ({ data: ((stored as { data?: EmailRecord[] } | null)?.data ?? []).filter(isPrimary) }),
    },
  ),
);
