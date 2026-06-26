/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useContactsStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  createConnection,
  listConnections,
  removeConnection,
  transitionConnection,
} from '@/shared/social/connectionApi';
import { errorMessage, pushSettingsError } from '@/store/settings/settingsStoreUtils';
import type { ContactEdge } from '@/store/social/types';

interface ContactsStore {
  data: ContactEdge[];
  requests: ContactEdge[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  sendRequest: (userId: string, note?: string) => Promise<void>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  withdraw: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const STORE_NAME = 'osionos:social:contacts';

/** Keep only well-formed edges — a null/peer-less entry must never enter the store,
 *  or every `.peer` reader (edgeFor, RequestsInbox, the panel) risks a crash. */
function partition(edges: ContactEdge[]): Pick<ContactsStore, 'data' | 'requests'> {
  const valid = (Array.isArray(edges) ? edges : []).filter((edge): edge is ContactEdge => !!edge?.peer?.id);
  return {
    data: valid.filter((edge) => edge.status === 'accepted'),
    requests: valid.filter((edge) => edge.status === 'pending'),
  };
}

export const useContactsStore = create<ContactsStore>()(
  persist(
    (set, get) => ({
      data: [],
      requests: [],
      loading: false,
      error: null,
      hydrate: async () => {
        set({ loading: true, error: null });
        try {
          const edges = await listConnections();
          set({ ...partition(edges), loading: false, error: null });
        } catch (error) {
          set({ loading: false, error: errorMessage(error) });
          pushSettingsError('Connections unavailable', error);
        }
      },
      sendRequest: async (userId, note) => {
        try {
          const edge = await createConnection(userId, note);
          // Never insert a malformed edge — that crashed edgeFor (`s.peer`) and blanked
          // the page. Surface a friendly error instead if the bridge contract regresses.
          if (!edge?.peer?.id) throw new Error('Connection request returned an unexpected response.');
          set({ requests: [edge, ...get().requests.filter((item) => item.id !== edge.id)] });
        } catch (error) {
          set({ error: errorMessage(error) });
          pushSettingsError('Could not send request', error);
        }
      },
      accept: async (id) => {
        const request = get().requests.find((item) => item.id === id);
        set({ requests: get().requests.filter((item) => item.id !== id) });
        try {
          const edge = await transitionConnection(id, 'accept');
          const next = edge ?? (request ? { ...request, status: 'accepted' as const } : null);
          if (next) set({ data: [next, ...get().data.filter((item) => item.id !== id)] });
        } catch (error) {
          if (request) set({ requests: [request, ...get().requests] });
          set({ error: errorMessage(error) });
          pushSettingsError('Could not accept request', error);
        }
      },
      decline: async (id) => {
        const request = get().requests.find((item) => item.id === id);
        set({ requests: get().requests.filter((item) => item.id !== id) });
        try {
          await transitionConnection(id, 'decline');
        } catch (error) {
          if (request) set({ requests: [request, ...get().requests] });
          set({ error: errorMessage(error) });
          pushSettingsError('Could not decline request', error);
        }
      },
      withdraw: async (id) => {
        const request = get().requests.find((item) => item.id === id);
        set({ requests: get().requests.filter((item) => item.id !== id) });
        try {
          await transitionConnection(id, 'withdraw');
        } catch (error) {
          if (request) set({ requests: [request, ...get().requests] });
          set({ error: errorMessage(error) });
          pushSettingsError('Could not withdraw request', error);
        }
      },
      remove: async (id) => {
        const previous = get().data;
        set({ data: previous.filter((item) => item.id !== id) });
        try {
          await removeConnection(id);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not remove connection', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data, requests: state.requests }),
      // Drop malformed/null edges persisted by older builds (a failed sendRequest once
      // stored `undefined`, which JSON-serializes to `null`) so a stale cache can never
      // crash a `.peer` read after rehydrate. Sanitize at the source, not per consumer.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<ContactsStore, 'data' | 'requests'>>;
        const clean = (arr: unknown): ContactEdge[] =>
          (Array.isArray(arr) ? arr : []).filter((edge): edge is ContactEdge => !!(edge as ContactEdge | null)?.peer?.id);
        return { ...current, ...saved, data: clean(saved.data), requests: clean(saved.requests) };
      },
    },
  ),
);
