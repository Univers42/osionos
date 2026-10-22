/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceInvitesStore.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { API_BASE } from '@/shared/api/client';
import { createLocalId, errorMessage, nowIso, pushSettingsError, removeById, settingsJwt, trySettingsDelete, trySettingsGet, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { WorkspaceInvite, WorkspaceMemberRole } from './types';

interface WorkspaceInvitesStore {
  data: Record<string, WorkspaceInvite[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  /** Set by the sidebar CTA so the People panel opens its invite modal. */
  inviteRequested: boolean;
  requestInvite: () => void;
  consumeInviteRequest: () => boolean;
  hydrate: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, input: { email: string; role: Exclude<WorkspaceMemberRole, 'owner'>; invitedBy?: string; message?: string }) => Promise<WorkspaceInvite | null>;
  invite: (workspaceId: string, input: { email: string; role: Exclude<WorkspaceMemberRole, 'owner'>; invitedBy?: string; message?: string }) => Promise<WorkspaceInvite | null>;
  resend: (workspaceId: string, inviteId: string) => Promise<void>;
  revoke: (workspaceId: string, inviteId: string) => Promise<void>;
  accept: (token: string) => Promise<string | null>;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:workspace-invites';

/** POST /api/workspaces/:id/invites answers `{ok, status, invite, member}`. */
type InviteResponse = WorkspaceInvite | { invite?: WorkspaceInvite };

function inviteFrom(remote: InviteResponse | null): WorkspaceInvite | null {
  if (!remote) return null;
  if ('invite' in remote) return (remote as { invite?: WorkspaceInvite }).invite ?? null;
  return remote as WorkspaceInvite;
}

function localInvite(workspaceId: string, input: { email: string; role: Exclude<WorkspaceMemberRole, 'owner'>; invitedBy?: string }): WorkspaceInvite {
  const timestamp = nowIso();
  return {
    _id: createLocalId('invite'),
    workspaceId,
    email: input.email,
    role: input.role,
    invitedBy: input.invitedBy ?? 'local',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null,
    revokedAt: null,
    token: createLocalId('token'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const useWorkspaceInvitesStore = create<WorkspaceInvitesStore>()(
  persist(
    (set, get) => ({
      data: {},
      loading: {},
      error: {},
      inviteRequested: false,
      requestInvite: () => set({ inviteRequested: true }),
      consumeInviteRequest: () => {
        if (!get().inviteRequested) return false;
        set({ inviteRequested: false });
        return true;
      },
      hydrate: async (workspaceId) => {
        if (!workspaceId) return;
        set((state) => ({ loading: { ...state.loading, [workspaceId]: true }, error: { ...state.error, [workspaceId]: null } }));
        try {
          const remote = await trySettingsGet<WorkspaceInvite[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`);
          set((state) => ({ data: { ...state.data, [workspaceId]: remote ?? state.data[workspaceId] ?? [] }, loading: { ...state.loading, [workspaceId]: false }, error: { ...state.error, [workspaceId]: null } }));
        } catch (error) {
          set((state) => ({ loading: { ...state.loading, [workspaceId]: false }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Workspace invites unavailable', error);
        }
      },
      create: async (workspaceId, input) => {
        const previous = get().data[workspaceId] ?? [];
        try {
          const jwt = settingsJwt();
          const remote = await trySettingsPost<InviteResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, input, jwt);
          // A configured bridge must answer; only a build with no bridge at all
          // falls back to a local-only invite (offline/demo).
          const invite = inviteFrom(remote) ?? (API_BASE && jwt ? null : localInvite(workspaceId, input));
          if (!invite) throw new Error('The invite was not created.');
          set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(previous, invite) }, error: { ...state.error, [workspaceId]: null } }));
          return invite;
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not create invite', error);
          return null;
        }
      },
      invite: async (workspaceId, input) => get().create(workspaceId, input),
      resend: async (workspaceId, inviteId) => {
        const previous = get().data[workspaceId] ?? [];
        const timestamp = nowIso();
        set((state) => ({ data: { ...state.data, [workspaceId]: previous.map((invite) => invite._id === inviteId ? { ...invite, updatedAt: timestamp } : invite) } }));
        try {
          const remote = await trySettingsPost<WorkspaceInvite>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}/resend`, {});
          if (remote) set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(state.data[workspaceId] ?? [], remote) } }));
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not resend invite', error);
        }
      },
      revoke: async (workspaceId, inviteId) => {
        const previous = get().data[workspaceId] ?? [];
        set((state) => ({ data: { ...state.data, [workspaceId]: removeById(previous, inviteId) } }));
        try {
          await trySettingsDelete<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`);
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not revoke invite', error);
        }
      },
      accept: async (token) => {
        try {
          const remote = await trySettingsPost<{ workspaceId: string }>('/api/invites/accept', { token });
          return remote?.workspaceId ?? null;
        } catch (error) {
          pushSettingsError('Could not accept invite', error);
          return null;
        }
      },
      reset: (workspaceId) => set((state) => ({ data: { ...state.data, [workspaceId]: [] }, error: { ...state.error, [workspaceId]: null } })),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
