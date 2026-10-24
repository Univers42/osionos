/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTeamspacesStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createLocalId, errorMessage, nowIso, pushSettingsError, trySettingsDelete, trySettingsGet, trySettingsPatch, trySettingsPost } from './settingsStoreUtils';
import { recordSettingsAction } from './useSettingsAuditStore';
import type { TeamspaceRecord, WorkspaceTeam, WorkspaceTeamMember, WorkspaceTeamRole } from './types';

interface TeamspacesStore {
  data: Record<string, TeamspaceRecord[]>;
  create: (workspaceId: string, input: { name: string; ownerId: string; pageId?: string | null }) => TeamspaceRecord;
  update: (workspaceId: string, teamspaceId: string, patch: Partial<TeamspaceRecord>) => void;
  archive: (workspaceId: string, teamspaceId: string) => void;
  reset: (workspaceId: string) => void;
  /** Teams slice: member groups of a workspace. Keyed by workspace id; members by team id. */
  teams: Record<string, WorkspaceTeam[]>;
  teamMembers: Record<string, WorkspaceTeamMember[]>;
  teamsLoading: Record<string, boolean>;
  teamsError: Record<string, string | null>;
  hydrateTeams: (workspaceId: string) => Promise<void>;
  createTeam: (workspaceId: string, input: { name: string; description?: string }) => Promise<WorkspaceTeam | null>;
  updateTeam: (workspaceId: string, teamId: string, patch: { name?: string; description?: string }) => Promise<void>;
  deleteTeam: (workspaceId: string, teamId: string) => Promise<void>;
  hydrateTeamMembers: (workspaceId: string, teamId: string) => Promise<void>;
  addTeamMember: (workspaceId: string, teamId: string, input: { userId: string; role?: WorkspaceTeamRole; name?: string }) => Promise<void>;
  removeTeamMember: (workspaceId: string, teamId: string, userId: string) => Promise<void>;
}

interface TeamsPage { teams?: unknown; nextCursor?: string | null }
interface TeamAnswer { team?: Partial<WorkspaceTeam> & { id?: string } }
interface MembersPage { members?: WorkspaceTeamMember[]; nextCursor?: string | null }

// Caveat: 10 pages of 50 teams. A workspace with more teams shows the first 500; the cap is a
// guard against a server that never returns a null cursor, not a product limit.
const MAX_TEAM_PAGES = 10;
const PAGE_SIZE = 50;

const STORE_NAME = 'osionos:settings:teamspaces';
const teamsPath = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/teams`;

function teamFromWire(workspaceId: string, raw: unknown): WorkspaceTeam | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  return {
    id: row.id,
    workspaceId,
    name: row.name,
    description: typeof row.description === 'string' ? row.description : '',
    memberCount: typeof row.memberCount === 'number' ? row.memberCount : 0,
    myRole: row.myRole === 'lead' || row.myRole === 'member' ? row.myRole : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
  };
}

/** Follows the keyset cursor until the server says there is no more. `null`: the server does not offer teams. */
async function fetchAllPages<T>(path: string, pick: (page: unknown) => { items: T[]; nextCursor: string | null }): Promise<T[] | null> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_TEAM_PAGES; page += 1) {
    const query: string = `limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const answer: unknown = await trySettingsGet<unknown>(`${path}?${query}`);
    if (answer === null) return page === 0 ? null : items;
    const read = pick(answer);
    items.push(...read.items);
    cursor = read.nextCursor;
    if (!cursor) break;
  }
  return items;
}

const patchTeam = (list: WorkspaceTeam[], teamId: string, change: Partial<WorkspaceTeam>) =>
  list.map((team) => (team.id === teamId ? { ...team, ...change, updatedAt: nowIso() } : team));

export const useTeamspacesStore = create<TeamspacesStore>()(
  persist(
    (set, get) => ({
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
      teams: {},
      teamMembers: {},
      teamsLoading: {},
      teamsError: {},
      hydrateTeams: async (workspaceId) => {
        if (!workspaceId) return;
        set((state) => ({ teamsLoading: { ...state.teamsLoading, [workspaceId]: true }, teamsError: { ...state.teamsError, [workspaceId]: null } }));
        try {
          const remote = await fetchAllPages<WorkspaceTeam>(teamsPath(workspaceId), (page) => {
            const body = page as TeamsPage;
            const rows = Array.isArray(body.teams) ? body.teams : [];
            return { items: rows.map((row) => teamFromWire(workspaceId, row)).filter((team): team is WorkspaceTeam => team !== null), nextCursor: body.nextCursor ?? null };
          });
          set((state) => ({
            teams: { ...state.teams, [workspaceId]: remote ?? state.teams[workspaceId] ?? [] },
            teamsLoading: { ...state.teamsLoading, [workspaceId]: false },
          }));
        } catch (error) {
          set((state) => ({ teamsLoading: { ...state.teamsLoading, [workspaceId]: false }, teamsError: { ...state.teamsError, [workspaceId]: errorMessage(error) } }));
        }
      },
      createTeam: async (workspaceId, input) => {
        try {
          const remote = await trySettingsPost<TeamAnswer>(teamsPath(workspaceId), input);
          const timestamp = nowIso();
          const created = teamFromWire(workspaceId, remote?.team) ?? { id: createLocalId('team'), workspaceId, name: input.name, description: input.description ?? '', memberCount: 0, myRole: null, createdAt: timestamp, updatedAt: timestamp };
          set((state) => ({ teams: { ...state.teams, [workspaceId]: [...(state.teams[workspaceId] ?? []), created] } }));
          recordSettingsAction('team_create', { workspaceId, teamId: created.id });
          return created;
        } catch (error) {
          pushSettingsError('Could not create the team', error);
          return null;
        }
      },
      updateTeam: async (workspaceId, teamId, patch) => {
        try {
          const remote = await trySettingsPatch<TeamAnswer>(`${teamsPath(workspaceId)}/${encodeURIComponent(teamId)}`, patch);
          const saved = teamFromWire(workspaceId, remote?.team);
          set((state) => ({ teams: { ...state.teams, [workspaceId]: patchTeam(state.teams[workspaceId] ?? [], teamId, saved ? { name: saved.name, description: saved.description } : patch) } }));
          recordSettingsAction('team_update', { workspaceId, teamId });
        } catch (error) {
          pushSettingsError('Could not save the team', error);
        }
      },
      deleteTeam: async (workspaceId, teamId) => {
        try {
          await trySettingsDelete(`${teamsPath(workspaceId)}/${encodeURIComponent(teamId)}`);
          set((state) => ({
            teams: { ...state.teams, [workspaceId]: (state.teams[workspaceId] ?? []).filter((team) => team.id !== teamId) },
            teamMembers: Object.fromEntries(Object.entries(state.teamMembers).filter(([key]) => key !== teamId)),
          }));
          recordSettingsAction('team_delete', { workspaceId, teamId });
        } catch (error) {
          pushSettingsError('Could not delete the team', error);
        }
      },
      hydrateTeamMembers: async (workspaceId, teamId) => {
        try {
          const remote = await fetchAllPages<WorkspaceTeamMember>(`${teamsPath(workspaceId)}/${encodeURIComponent(teamId)}/members`, (page) => {
            const body = page as MembersPage;
            return { items: Array.isArray(body.members) ? body.members : [], nextCursor: body.nextCursor ?? null };
          });
          if (remote === null) return;
          set((state) => ({
            teamMembers: { ...state.teamMembers, [teamId]: remote },
            teams: { ...state.teams, [workspaceId]: patchTeam(state.teams[workspaceId] ?? [], teamId, { memberCount: remote.length }) },
          }));
        } catch (error) {
          pushSettingsError('Could not load the team members', error);
        }
      },
      addTeamMember: async (workspaceId, teamId, input) => {
        const role = input.role ?? 'member';
        try {
          const remote = await trySettingsPost<unknown>(`${teamsPath(workspaceId)}/${encodeURIComponent(teamId)}/members`, { userId: input.userId, role });
          if (remote !== null) return await get().hydrateTeamMembers(workspaceId, teamId);
          const current = get().teamMembers[teamId] ?? [];
          const next = [...current.filter((member) => member.userId !== input.userId), { userId: input.userId, name: input.name ?? 'Member', role, addedAt: nowIso() }];
          set((state) => ({ teamMembers: { ...state.teamMembers, [teamId]: next }, teams: { ...state.teams, [workspaceId]: patchTeam(state.teams[workspaceId] ?? [], teamId, { memberCount: next.length }) } }));
        } catch (error) {
          pushSettingsError('Could not add the member', error);
        }
      },
      removeTeamMember: async (workspaceId, teamId, userId) => {
        try {
          await trySettingsDelete(`${teamsPath(workspaceId)}/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`);
          const next = (get().teamMembers[teamId] ?? []).filter((member) => member.userId !== userId);
          set((state) => ({ teamMembers: { ...state.teamMembers, [teamId]: next }, teams: { ...state.teams, [workspaceId]: patchTeam(state.teams[workspaceId] ?? [], teamId, { memberCount: next.length }) } }));
        } catch (error) {
          pushSettingsError('Could not remove the member', error);
        }
      },
    }),
    // Loading/error flags are per-session; persisting `true` would show a spinner forever after a crash.
    { name: STORE_NAME, partialize: ({ data, teams, teamMembers }) => ({ data, teams, teamMembers }) },
  ),
);