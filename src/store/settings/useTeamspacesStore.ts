import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createLocalId, nowIso } from './settingsStoreUtils';
import { recordSettingsAction } from './useSettingsAuditStore';
import type { TeamspaceRecord } from './types';

interface TeamspacesStore {
  data: Record<string, TeamspaceRecord[]>;
  create: (workspaceId: string, input: { name: string; ownerId: string; pageId?: string | null }) => TeamspaceRecord;
  update: (workspaceId: string, teamspaceId: string, patch: Partial<TeamspaceRecord>) => void;
  archive: (workspaceId: string, teamspaceId: string) => void;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:teamspaces';

export const useTeamspacesStore = create<TeamspacesStore>()(
  persist(
    (set) => ({
      data: {},
      create: (workspaceId, input) => {
        const timestamp = nowIso();
        const teamspace: TeamspaceRecord = {
          _id: createLocalId('teamspace'),
          workspaceId,
          name: input.name,
          owners: [input.ownerId].filter(Boolean),
          access: 'open',
          pageId: input.pageId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
        };
        set((state) => ({ data: { ...state.data, [workspaceId]: [teamspace, ...(state.data[workspaceId] ?? [])] } }));
        recordSettingsAction('teamspace_create', { workspaceId, teamspaceId: teamspace._id, pageId: teamspace.pageId });
        return teamspace;
      },
      update: (workspaceId, teamspaceId, patch) => {
        set((state) => ({
          data: {
            ...state.data,
            [workspaceId]: (state.data[workspaceId] ?? []).map((teamspace) => teamspace._id === teamspaceId
              ? { ...teamspace, ...patch, updatedAt: nowIso() }
              : teamspace),
          },
        }));
        recordSettingsAction('teamspace_update', { workspaceId, teamspaceId, patch });
      },
      archive: (workspaceId, teamspaceId) => {
        set((state) => ({
          data: {
            ...state.data,
            [workspaceId]: (state.data[workspaceId] ?? []).map((teamspace) => teamspace._id === teamspaceId
              ? { ...teamspace, archivedAt: nowIso(), updatedAt: nowIso() }
              : teamspace),
          },
        }));
        recordSettingsAction('teamspace_archive', { workspaceId, teamspaceId });
      },
      reset: (workspaceId) => set((state) => ({ data: { ...state.data, [workspaceId]: [] } })),
    }),
    { name: STORE_NAME },
  ),
);