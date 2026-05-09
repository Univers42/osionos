import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultWorkspaceMember } from './defaults';
import { errorMessage, nowIso, pushSettingsError, trySettingsDelete, trySettingsGet, trySettingsPatch, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { WorkspaceMember, WorkspaceMemberRole } from './types';

interface WorkspaceMembersStore {
  data: Record<string, WorkspaceMember[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  hydrate: (workspaceId: string, activeUserId: string, seedUserIds?: string[]) => Promise<void>;
  updateRole: (workspaceId: string, userId: string, role: WorkspaceMemberRole) => Promise<void>;
  changeRole: (workspaceId: string, userId: string, role: WorkspaceMemberRole) => Promise<void>;
  remove: (workspaceId: string, userId: string) => Promise<void>;
  transferOwnership: (workspaceId: string, toUserId: string) => Promise<void>;
  reset: (workspaceId: string, activeUserId: string) => void;
}

const STORE_NAME = 'osionos:settings:workspace-members';

function fallbackMembers(workspaceId: string, activeUserId: string, seedUserIds: string[] = []): WorkspaceMember[] {
  const members = [activeUserId, ...seedUserIds].filter(Boolean);
  const uniqueMembers = [...new Set(members)];
  return uniqueMembers.map((userId, index) => ({ ...defaultWorkspaceMember(workspaceId, userId), role: index === 0 ? 'owner' : 'member' }));
}

function transferOwnerRole(member: WorkspaceMember, toUserId: string): WorkspaceMember {
  if (member.userId === toUserId) return { ...member, role: 'owner' };
  if (member.role === 'owner') return { ...member, role: 'admin' };
  return member;
}

export const useWorkspaceMembersStore = create<WorkspaceMembersStore>()(
  persist(
    (set, get) => ({
      data: {},
      loading: {},
      error: {},
      hydrate: async (workspaceId, activeUserId, seedUserIds = []) => {
        if (!workspaceId) return;
        set((state) => ({ loading: { ...state.loading, [workspaceId]: true }, error: { ...state.error, [workspaceId]: null } }));
        try {
          const remote = await trySettingsGet<WorkspaceMember[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
          set((state) => ({
            data: { ...state.data, [workspaceId]: remote ?? state.data[workspaceId] ?? fallbackMembers(workspaceId, activeUserId, seedUserIds) },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: null },
          }));
        } catch (error) {
          set((state) => ({
            data: { ...state.data, [workspaceId]: state.data[workspaceId] ?? fallbackMembers(workspaceId, activeUserId, seedUserIds) },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: errorMessage(error) },
          }));
          pushSettingsError('Workspace members unavailable', error);
        }
      },
      updateRole: async (workspaceId, userId, role) => {
        const previous = get().data[workspaceId] ?? [];
        const timestamp = nowIso();
        set((state) => ({ data: { ...state.data, [workspaceId]: previous.map((member) => member.userId === userId ? { ...member, role, updatedAt: timestamp } : member) } }));
        try {
          const remote = await trySettingsPatch<WorkspaceMember>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`, { role });
          if (remote) set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(state.data[workspaceId] ?? [], remote) } }));
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not update member role', error);
        }
      },
      changeRole: async (workspaceId, userId, role) => get().updateRole(workspaceId, userId, role),
      remove: async (workspaceId, userId) => {
        const previous = get().data[workspaceId] ?? [];
        const targetId = previous.find((member) => member.userId === userId)?._id ?? userId;
        set((state) => ({ data: { ...state.data, [workspaceId]: previous.filter((member) => member.userId !== userId) } }));
        try {
          await trySettingsDelete<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`);
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError(`Could not remove member ${targetId}`, error);
        }
      },
      transferOwnership: async (workspaceId, toUserId) => {
        const previous = get().data[workspaceId] ?? [];
        set((state) => ({
          data: {
            ...state.data,
            [workspaceId]: previous.map((member) => transferOwnerRole(member, toUserId)),
          },
        }));
        try {
          const remote = await trySettingsPost<WorkspaceMember[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/transfer-ownership`, { toUserId });
          if (remote) set((state) => ({ data: { ...state.data, [workspaceId]: remote } }));
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not transfer ownership', error);
        }
      },
      reset: (workspaceId, activeUserId) => set((state) => ({ data: { ...state.data, [workspaceId]: fallbackMembers(workspaceId, activeUserId) }, error: { ...state.error, [workspaceId]: null } })),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
