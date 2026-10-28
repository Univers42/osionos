/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceInvitesStore.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { API_BASE } from '@/shared/api/client';
import { createLocalId, errorCode, errorMessage, nowIso, pushSettingsError, settingsJwt, trySettingsDelete, trySettingsGet, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { MineInvite, WorkspaceInvite, WorkspaceMemberRole } from './types';

/** The by-id accept either joins, or names the bridge code the dialog turns into a sentence. */
export type InviteAcceptResult =
  | { ok: true; workspaceId: string; role: string }
  | { ok: false; code: string };

interface WorkspaceInvitesStore {
  data: Record<string, WorkspaceInvite[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  /** The bridge code of the last failed create (`not_connected` shows connection guidance, not the raw message). */
  errorCode: Record<string, string | null>;
  /** Set by the sidebar CTA so the People panel opens its invite modal. */
  inviteRequested: boolean;
  /** Accept links by invite id, shown once to the inviter. In memory only: the plaintext token
   *  exists nowhere else, and `partialize` below never writes this field. */
  acceptLinks: Record<string, string>;
  /** The invitee's own pending invites (GET /api/invites/mine). In memory only. */
  mine: MineInvite[];
  mineLoading: boolean;
  mineError: string | null;
  /** True when /mine is not served (old bridge): no group, no badge, no error. */
  mineUnavailable: boolean;
  /** The invite the decision dialog is open on, set by the ?invite= boot link or a pending row. */
  openedInviteId: string | null;
  requestInvite: () => void;
  consumeInviteRequest: () => boolean;
  hydrate: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, input: { email: string; role: Exclude<WorkspaceMemberRole, 'owner'>; invitedBy?: string; message?: string }) => Promise<WorkspaceInvite | null>;
  invite: (workspaceId: string, input: { email: string; role: Exclude<WorkspaceMemberRole, 'owner'>; invitedBy?: string; message?: string }) => Promise<WorkspaceInvite | null>;
  resend: (workspaceId: string, inviteId: string) => Promise<void>;
  revoke: (workspaceId: string, inviteId: string) => Promise<void>;
  accept: (token: string) => Promise<string | null>;
  /** Load the invitee's pending invites. An old bridge (404) answers [] with no error. */
  fetchMine: () => Promise<MineInvite[]>;
  /** Turn a link token into the invite id addressed to this account; null for every refusal. */
  resolve: (token: string) => Promise<string | null>;
  acceptById: (inviteId: string) => Promise<InviteAcceptResult>;
  decline: (inviteId: string) => Promise<boolean>;
  openInvite: (inviteId: string) => void;
  closeInvite: () => void;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:workspace-invites';

/** The bridge's public invite row: `id`, never the token hash or the invited account id. */
type RemoteInvite = Omit<WorkspaceInvite, '_id' | 'workspaceId' | 'updatedAt'> & { id: string };

/** POST create / resend answers `{ok, invite, token, acceptUrl}`; the link is the only copy of the token. */
interface InviteResponse { invite?: RemoteInvite; acceptUrl?: string }

function inviteFromRemote(workspaceId: string, row: RemoteInvite): WorkspaceInvite {
  const { id, ...rest } = row;
  return { ...rest, _id: id, workspaceId, updatedAt: row.createdAt };
}

function inviteFrom(workspaceId: string, remote: InviteResponse | null): WorkspaceInvite | null {
  return remote?.invite ? inviteFromRemote(workspaceId, remote.invite) : null;
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
      errorCode: {},
      inviteRequested: false,
      acceptLinks: {},
      mine: [],
      mineLoading: false,
      mineError: null,
      mineUnavailable: false,
      openedInviteId: null,
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
          const remote = await trySettingsGet<RemoteInvite[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`);
          const rows = remote?.map((row) => inviteFromRemote(workspaceId, row));
          set((state) => ({ data: { ...state.data, [workspaceId]: rows ?? state.data[workspaceId] ?? [] }, loading: { ...state.loading, [workspaceId]: false }, error: { ...state.error, [workspaceId]: null } }));
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
          const invite = inviteFrom(workspaceId, remote) ?? (API_BASE && jwt ? null : localInvite(workspaceId, input));
          if (!invite) throw new Error('The invite was not created.');
          set((state) => ({
            data: { ...state.data, [workspaceId]: upsertById(previous, invite) },
            acceptLinks: remote?.acceptUrl ? { ...state.acceptLinks, [invite._id]: remote.acceptUrl } : state.acceptLinks,
            error: { ...state.error, [workspaceId]: null },
            errorCode: { ...state.errorCode, [workspaceId]: null },
          }));
          return invite;
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) }, errorCode: { ...state.errorCode, [workspaceId]: errorCode(error) ?? null } }));
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
          const remote = await trySettingsPost<InviteResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}/resend`, {});
          const invite = inviteFrom(workspaceId, remote);
          if (invite) {
            set((state) => ({
              data: { ...state.data, [workspaceId]: upsertById(state.data[workspaceId] ?? [], invite) },
              acceptLinks: remote?.acceptUrl ? { ...state.acceptLinks, [invite._id]: remote.acceptUrl } : state.acceptLinks,
            }));
          }
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not resend invite', error);
        }
      },
      revoke: async (workspaceId, inviteId) => {
        const previous = get().data[workspaceId] ?? [];
        // The bridge keeps a revoked row (it shows as Revoked), so mark it rather than drop it.
        const stamp = nowIso();
        const links = Object.fromEntries(Object.entries(get().acceptLinks).filter(([id]) => id !== inviteId));
        set((state) => ({
          data: { ...state.data, [workspaceId]: previous.map((invite) => invite._id === inviteId ? { ...invite, revokedAt: stamp } : invite) },
          acceptLinks: links,
        }));
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
      fetchMine: async () => {
        set({ mineLoading: true, mineError: null });
        try {
          const remote = await trySettingsGet<{ invites?: MineInvite[] }>('/api/invites/mine');
          // A null answer is the old bridge: the route is not served at all (N26 degrade).
          const invites = remote?.invites ?? [];
          set({ mine: invites, mineLoading: false, mineError: null, mineUnavailable: remote === null });
          return invites;
        } catch (error) {
          set({ mineLoading: false, mineError: errorMessage(error) });
          return get().mine;
        }
      },
      resolve: async (token) => {
        try {
          const remote = await trySettingsPost<{ id?: string }>('/api/invites/resolve', { token });
          return remote?.id ?? null;
        } catch {
          // 404 (wrong account, used, expired, declined, unknown) and an old bridge are
          // indistinguishable to the caller on purpose: the boot toast says nothing.
          return null;
        }
      },
      acceptById: async (inviteId) => {
        try {
          const remote = await trySettingsPost<{ ok?: boolean; workspaceId?: string; role?: string }>(
            `/api/invites/${encodeURIComponent(inviteId)}/accept`,
            {},
          );
          if (!remote?.workspaceId) return { ok: false, code: remote === null ? 'not_found' : 'unknown' };
          set((state) => ({ mine: state.mine.filter((invite) => invite.id !== inviteId) }));
          return { ok: true, workspaceId: remote.workspaceId, role: remote.role ?? 'member' };
        } catch (error) {
          const status = (error as { status?: number } | null)?.status;
          return { ok: false, code: errorCode(error) ?? (status === 404 ? 'not_found' : 'unknown') };
        }
      },
      decline: async (inviteId) => {
        const forget = () => set((state) => ({ mine: state.mine.filter((invite) => invite.id !== inviteId) }));
        try {
          await trySettingsPost<{ ok?: boolean }>(`/api/invites/${encodeURIComponent(inviteId)}/decline`, {});
          forget();
          return true;
        } catch (error) {
          // A 404 means the invite is already gone: the row still has to disappear.
          if ((error as { status?: number } | null)?.status === 404) {
            forget();
            return true;
          }
          set({ mineError: errorMessage(error) });
          return false;
        }
      },
      openInvite: (inviteId) => set({ openedInviteId: inviteId }),
      closeInvite: () => set({ openedInviteId: null }),
      reset: (workspaceId) => set((state) => ({ data: { ...state.data, [workspaceId]: [] }, error: { ...state.error, [workspaceId]: null } })),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
