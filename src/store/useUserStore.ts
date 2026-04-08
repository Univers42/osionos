/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUserStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { api } from '../api/client';
import type { UserSession, UserStore, Workspace } from './userStore.types';
import { INITIAL_PERSONAS, loginPersona, fetchWorkspaces, partition } from './userStore.helpers';

export type { StaticPersona, Workspace } from './userStore.types';

// Module-level guard against React Strict Mode double-invoke
let _initInProgress = false;

/** Zustand store managing multi-user authentication and workspace access. */
export const useUserStore = create<UserStore>((set, get) => ({
  personas:     INITIAL_PERSONAS.map(p => ({ ...p })),
  sessions:     {},
  activeUserId: '',
  initialized:  false,
  loading:      false,
  error:        null,

  init: async () => {
    if (get().initialized || _initInProgress) return;
    _initInProgress = true;
    set({ loading: true, error: null });

    const updatedPersonas = [...get().personas];
    const sessions: Record<string, UserSession> = {};
    let firstUserId = '';

    // Try to log in the first persona as a connectivity check.
    // If it fails, skip all remaining logins and go to offline mode.
    const firstLogin = await loginPersona(INITIAL_PERSONAS[0]);

    if (firstLogin) {
      // API is reachable — process first result and login the rest
      const { userId, accessToken, refreshToken } = firstLogin;
      updatedPersonas[0] = { ...updatedPersonas[0], id: userId };
      const workspaces = await fetchWorkspaces(accessToken);
      const { privateWorkspaces, sharedWorkspaces } = partition(workspaces, userId);
      sessions[userId] = { userId, accessToken, refreshToken, privateWorkspaces, sharedWorkspaces };
      firstUserId = userId;

      // Login remaining personas
      const remainingResults = await Promise.all(INITIAL_PERSONAS.slice(1).map(loginPersona));
      for (let i = 0; i < remainingResults.length; i++) {
        const lr = remainingResults[i];
        if (!lr) continue;
        const idx = i + 1; // offset since we already did index 0
        updatedPersonas[idx] = { ...updatedPersonas[idx], id: lr.userId };
        const ws = await fetchWorkspaces(lr.accessToken);
        const parts = partition(ws, lr.userId);
        sessions[lr.userId] = { userId: lr.userId, accessToken: lr.accessToken, refreshToken: lr.refreshToken, privateWorkspaces: parts.privateWorkspaces, sharedWorkspaces: parts.sharedWorkspaces };
      }
    }

    if (Object.keys(sessions).length === 0) {
      console.info('[playground] API unreachable — running in offline mode with seed data');
      const sharedWs: Workspace = {
        _id: 'mock-ws-shared-team',
        name: 'Team Workspace',
        slug: 'team',
        ownerId: 'mock-user-0',
      };
      for (let i = 0; i < updatedPersonas.length; i++) {
        const mockId = `mock-user-${i}`;
        updatedPersonas[i] = { ...updatedPersonas[i], id: mockId };
        sessions[mockId] = {
          userId: mockId,
          accessToken: '',
          refreshToken: '',
          privateWorkspaces: [{
            _id: `mock-ws-private-${i}`,
            name: `Notion de ${updatedPersonas[i].name.split(' ')[0].toLowerCase()}`,
            slug: updatedPersonas[i].name.toLowerCase().replaceAll(/\s+/g, '-'),
            ownerId: mockId,
          }],
          sharedWorkspaces: [sharedWs],
        };
        if (!firstUserId) firstUserId = mockId;
      }
    }

    set({ personas: updatedPersonas, sessions, activeUserId: firstUserId, initialized: true, loading: false });
    _initInProgress = false;
  },

  switchUser: (userId: string) => set({ activeUserId: userId }),

  refreshWorkspaces: async (userId: string) => {
    const session = get().sessions[userId];
    if (!session) return;
    const workspaces = await fetchWorkspaces(session.accessToken);
    const { privateWorkspaces, sharedWorkspaces } = partition(workspaces, userId);
    set(s => ({
      sessions: {
        ...s.sessions,
        [userId]: { ...session, privateWorkspaces, sharedWorkspaces },
      },
    }));
  },

  createWorkspace: async (name, slug) => {
    const jwt = get().activeJwt();
    if (!jwt) return null;
    try {
      const ws = await api.post<Workspace>('/api/workspaces', { name, slug }, jwt);
      const uid = get().activeUserId;
      await get().refreshWorkspaces(uid);
      return ws;
    } catch {
      return null;
    }
  },

  activeSession: () => {
    const { sessions, activeUserId } = get();
    return sessions[activeUserId] ?? null;
  },

  activePersona: () => {
    const { personas, activeUserId } = get();
    return personas.find(p => p.id === activeUserId) ?? personas[0] ?? null;
  },

  activeJwt: () => get().activeSession()?.accessToken ?? null,

  personaById: (id: string) => get().personas.find(p => p.id === id),
}));

// Expose on globalThis so usePageStore can access JWT without circular imports
(globalThis as unknown as Record<string, unknown>).__playgroundUserStore = useUserStore;
