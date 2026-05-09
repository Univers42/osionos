import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultEmail } from './defaults';
import { createLocalId, errorMessage, nowIso, pushSettingsError, removeById, trySettingsDelete, trySettingsGet, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { EmailRecord } from './types';

interface AccountEmailsStore {
  data: EmailRecord[];
  loading: boolean;
  error: string | null;
  hydrate: (userId: string, email?: string) => Promise<void>;
  add: (email: string, userId: string) => Promise<EmailRecord | null>;
  verify: (emailId: string) => Promise<void>;
  remove: (emailId: string) => Promise<void>;
  makePrimary: (emailId: string) => Promise<void>;
  reset: (userId: string, email?: string) => void;
}

const STORE_NAME = 'osionos:settings:account-emails';

function localEmail(userId: string, email: string): EmailRecord {
  const timestamp = nowIso();
  return {
    _id: createLocalId('email'),
    userId,
    email,
    isPrimary: false,
    verifiedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export const useAccountEmailsStore = create<AccountEmailsStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async (userId, email) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<EmailRecord[]>('/api/account/emails');
          const fallback = email ? [defaultEmail(userId, email)] : [];
          set({ data: remote ?? (get().data.length ? get().data : fallback), loading: false, error: null });
        } catch (error) {
          const fallback = email ? [defaultEmail(userId, email)] : [];
          set({ data: get().data.length ? get().data : fallback, loading: false, error: errorMessage(error) });
          pushSettingsError('Emails unavailable', error);
        }
      },
      add: async (email, userId) => {
        const previous = get().data;
        try {
          const remote = await trySettingsPost<EmailRecord>('/api/account/emails', { email });
          const record = remote ?? localEmail(userId, email);
          set({ data: upsertById(previous, record), error: null });
          return record;
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not add email', error);
          return null;
        }
      },
      verify: async (emailId) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((record) => record._id === emailId ? { ...record, verifiedAt: timestamp, updatedAt: timestamp } : record), error: null });
      },
      remove: async (emailId) => {
        const previous = get().data;
        set({ data: removeById(previous, emailId), error: null });
        try {
          await trySettingsDelete<void>(`/api/account/emails/${encodeURIComponent(emailId)}`);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not remove email', error);
        }
      },
      makePrimary: async (emailId) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((record) => ({ ...record, isPrimary: record._id === emailId, updatedAt: timestamp })), error: null });
        try {
          const remote = await trySettingsPost<EmailRecord[] | EmailRecord>(`/api/account/emails/${encodeURIComponent(emailId)}/make-primary`, {});
          if (Array.isArray(remote)) set({ data: remote });
          else if (remote) set({ data: get().data.map((record) => record._id === emailId ? remote : { ...record, isPrimary: false }) });
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not change primary email', error);
        }
      },
      reset: (userId, email) => set({ data: email ? [defaultEmail(userId || 'anonymous', email)] : [], error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
