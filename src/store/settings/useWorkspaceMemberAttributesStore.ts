/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceMemberAttributesStore.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';

import { errorMessage, pushSettingsError, trySettingsDelete, trySettingsGet, trySettingsPut } from './settingsStoreUtils';

export interface MemberAttribute {
  name: string;
  value: string;
}

type AttributeList = MemberAttribute[];

interface WorkspaceMemberAttributesStore {
  data: Record<string, AttributeList>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  hydrate: (workspaceId: string, userId: string) => Promise<void>;
  fetch: (workspaceId: string, userId: string) => Promise<void>;
  load: (workspaceId: string, userId: string) => Promise<void>;
  refresh: (workspaceId: string, userId: string) => Promise<void>;
  set: (workspaceId: string, userId: string, name: string, value: string) => Promise<void>;
  add: (workspaceId: string, userId: string, name: string, value: string) => Promise<void>;
  update: (workspaceId: string, userId: string, name: string, value: string) => Promise<void>;
  upsert: (workspaceId: string, userId: string, name: string, value: string) => Promise<void>;
  remove: (workspaceId: string, userId: string, name: string) => Promise<void>;
  delete: (workspaceId: string, userId: string, name: string) => Promise<void>;
  deleteAttribute: (workspaceId: string, userId: string, name: string) => Promise<void>;
  reset: (workspaceId: string, userId: string) => void;
}

function key(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}

export const useWorkspaceMemberAttributesStore = create<WorkspaceMemberAttributesStore>()((set, get) => ({
  data: {},
  loading: {},
  error: {},
  hydrate: async (workspaceId, userId) => {
    if (!workspaceId || !userId) return;
    const k = key(workspaceId, userId);
    set((state) => ({ loading: { ...state.loading, [k]: true }, error: { ...state.error, [k]: null } }));
    try {
      const remote = await trySettingsGet<{ attributes?: AttributeList; items?: AttributeList }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/attributes`);
      const list = Array.isArray(remote?.attributes) ? remote.attributes : Array.isArray(remote?.items) ? remote.items : [];
      set((state) => ({ data: { ...state.data, [k]: list }, loading: { ...state.loading, [k]: false }, error: { ...state.error, [k]: null } }));
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, [k]: false }, error: { ...state.error, [k]: errorMessage(error) } }));
      pushSettingsError('Member attributes unavailable', error);
    }
  },
  fetch: async (workspaceId, userId) => get().hydrate(workspaceId, userId),
  load: async (workspaceId, userId) => get().hydrate(workspaceId, userId),
  refresh: async (workspaceId, userId) => get().hydrate(workspaceId, userId),
  set: async (workspaceId, userId, name, value) => get().add(workspaceId, userId, name, value),
  add: async (workspaceId, userId, name, value) => {
    const k = key(workspaceId, userId);
    const previous = get().data[k] ?? [];
    const next = [...previous.filter((a) => a.name !== name), { name, value }];
    set((state) => ({ data: { ...state.data, [k]: next } }));
    try {
      await trySettingsPut(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/attributes/${encodeURIComponent(name)}`, { value });
    } catch (error) {
      set((state) => ({ data: { ...state.data, [k]: previous }, error: { ...state.error, [k]: errorMessage(error) } }));
      pushSettingsError('Could not save attribute', error);
    }
  },
  update: async (workspaceId, userId, name, value) => get().add(workspaceId, userId, name, value),
  upsert: async (workspaceId, userId, name, value) => get().add(workspaceId, userId, name, value),
  remove: async (workspaceId, userId, name) => {
    const k = key(workspaceId, userId);
    const previous = get().data[k] ?? [];
    set((state) => ({ data: { ...state.data, [k]: previous.filter((a) => a.name !== name) } }));
    try {
      await trySettingsDelete(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/attributes/${encodeURIComponent(name)}`);
    } catch (error) {
      set((state) => ({ data: { ...state.data, [k]: previous }, error: { ...state.error, [k]: errorMessage(error) } }));
      pushSettingsError('Could not remove attribute', error);
    }
  },
  delete: async (workspaceId, userId, name) => get().remove(workspaceId, userId, name),
  deleteAttribute: async (workspaceId, userId, name) => get().remove(workspaceId, userId, name),
  reset: (workspaceId, userId) => set((state) => {
    const k = key(workspaceId, userId);
    const next = { ...state.data };
    delete next[k];
    return { data: next };
  }),
}));

export const useMemberAttributesStore = useWorkspaceMemberAttributesStore;
