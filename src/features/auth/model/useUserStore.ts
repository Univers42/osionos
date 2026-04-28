/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUserStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 17:32:09 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { api } from '@/shared/api/client';
import type { UserSession, UserStore, Workspace } from '@/entities/user';
import {
  INITIAL_PERSONAS,
  createOfflineWorkspace,
  fetchWorkspaces,
  loginPersona,
  partition,
  seededWorkspaceSession,
  signupPersona,
} from '@/features/auth/model/userStore.helpers';

export type { StaticPersona, Workspace } from '@/entities/user';

// Module-level guard against React Strict Mode double-invoke
let _initInProgress = false;

const ACTIVE_ACCOUNTS_STORAGE_KEY = 'osionos:active-accounts';
const WORKSPACES_STORAGE_KEY = 'osionos:user-workspaces';
const ACTIVE_CONTEXT_STORAGE_KEY = 'osionos:user-context';

type PersistedUserContext = {
  activeUserId?: string;
  activeWorkspaceByUser?: Record<string, string>;
};

function readPersistedContext(): PersistedUserContext {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ACTIVE_CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedUserContext : {};
  } catch {
    return {};
  }
}

function savePersistedContext(context: PersistedUserContext) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}

function readPersistedWorkspaces(): Record<string, Workspace[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, Workspace[]> : {};
  } catch {
    return {};
  }
}

function savePersistedWorkspaces(sessions: Record<string, UserSession>) {
  if (typeof localStorage === 'undefined') return;
  const workspacesByUser = Object.fromEntries(
    Object.entries(sessions).map(([userId, session]) => [userId, session.privateWorkspaces]),
  );
  localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspacesByUser));
}

function readPersistedPersonas() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACTIVE_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as typeof INITIAL_PERSONAS;
  } catch {
    return [];
  }
}

function savePersistedPersonas(personas: typeof INITIAL_PERSONAS) {
  if (typeof localStorage === 'undefined') return;
  const persisted = personas.filter((persona) => persona.persistInSessions);
  localStorage.setItem(ACTIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(persisted));
}

function uniquePersonas(personas: typeof INITIAL_PERSONAS) {
  const byEmail = new Map<string, typeof INITIAL_PERSONAS[number]>();
  for (const persona of personas) {
    byEmail.set(persona.email.toLowerCase(), persona);
  }
  return [...byEmail.values()];
}

function createOfflineSessions(personas: typeof INITIAL_PERSONAS) {
  const sessions: Record<string, UserSession> = {};
  let firstUserId = '';
  const persistedWorkspaces = readPersistedWorkspaces();

  for (let i = 0; i < personas.length; i++) {
    const mockId = personas[i].id || `mock-user-${i}`;
    personas[i] = { ...personas[i], id: mockId };
    const seededWorkspaces = seededWorkspaceSession(mockId);
    let privateWorkspaces = persistedWorkspaces[mockId];
    if (!privateWorkspaces?.length) {
      privateWorkspaces = seededWorkspaces.privateWorkspaces.length > 0
        ? seededWorkspaces.privateWorkspaces
        : [createOfflineWorkspace(mockId, `${personas[i].name}'s workspace`)];
    }
    sessions[mockId] = {
      userId: mockId,
      accessToken: '',
      refreshToken: '',
      privateWorkspaces,
      sharedWorkspaces: seededWorkspaces.sharedWorkspaces,
    };
    if (!firstUserId) firstUserId = mockId;
  }

  return { sessions, firstUserId };
}

/** Zustand store managing multi-user authentication and workspace access. */
export const useUserStore = create<UserStore>((set, get) => ({
  personas:     uniquePersonas([...INITIAL_PERSONAS.map(p => ({ ...p })), ...readPersistedPersonas()]),
  sessions:     {},
  activeUserId: '',
  activeWorkspaceByUser: readPersistedContext().activeWorkspaceByUser ?? {},
  initialized:  false,
  loading:      false,
  error:        null,

  init: async () => {
    if (get().initialized || _initInProgress) return;
    _initInProgress = true;
    set({ loading: true, error: null });

    try {
      const updatedPersonas = uniquePersonas([...INITIAL_PERSONAS.map(p => ({ ...p })), ...readPersistedPersonas()]);
      const sessions: Record<string, UserSession> = {};
      let firstUserId = '';

      const applyOfflineFallback = () => {
        console.info('[playground] API unreachable — running in offline mode with seed data');
        const offline = createOfflineSessions(updatedPersonas);
        Object.assign(sessions, offline.sessions);
        firstUserId = offline.firstUserId;
      };

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
        applyOfflineFallback();
      }

      savePersistedPersonas(updatedPersonas);
      const storedContext = readPersistedContext();
      const activeUserId = storedContext.activeUserId && sessions[storedContext.activeUserId]
        ? storedContext.activeUserId
        : firstUserId;
      savePersistedWorkspaces(sessions);
      savePersistedContext({ activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {} });
      set({ personas: updatedPersonas, sessions, activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {}, initialized: true, loading: false });
    } catch {
      const updatedPersonas = uniquePersonas([...INITIAL_PERSONAS.map(p => ({ ...p })), ...readPersistedPersonas()]);
      const { sessions, firstUserId } = createOfflineSessions(updatedPersonas);

      savePersistedPersonas(updatedPersonas);
      const storedContext = readPersistedContext();
      const activeUserId = storedContext.activeUserId && sessions[storedContext.activeUserId]
        ? storedContext.activeUserId
        : firstUserId;
      savePersistedWorkspaces(sessions);
      savePersistedContext({ activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {} });
      set({ personas: updatedPersonas, sessions, activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {}, initialized: true, loading: false, error: null });
    } finally {
      _initInProgress = false;
    }
  },

  switchUser: (userId: string) => set((state) => {
    savePersistedContext({ activeUserId: userId, activeWorkspaceByUser: state.activeWorkspaceByUser });
    return { activeUserId: userId };
  }),

  switchWorkspace: (workspaceId: string) => set((state) => {
    const activeWorkspaceByUser = {
      ...state.activeWorkspaceByUser,
      [state.activeUserId]: workspaceId,
    };
    savePersistedContext({ activeUserId: state.activeUserId, activeWorkspaceByUser });
    return { activeWorkspaceByUser };
  }),

  loginWithCredentials: async (email, password, persistInSessions, mode, name) => {
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name?.trim() || normalizedEmail.split('@')[0] || 'New account';
    const persona = {
      id: '',
      email: normalizedEmail,
      password,
      name: displayName,
      emoji: '👤',
      roleBadge: 'Member',
      persistInSessions,
    };

    const loginResult = mode === 'signup'
      ? await signupPersona(persona)
      : await loginPersona(persona);
    const userId = loginResult?.userId ?? `local-${crypto.randomUUID()}`;
    const storedPersona = { ...persona, id: userId };
    const workspaces = loginResult ? await fetchWorkspaces(loginResult.accessToken) : [];
    const parts = loginResult
      ? partition(workspaces, userId)
      : {
        privateWorkspaces: [createOfflineWorkspace(userId, `${displayName}'s workspace`)],
        sharedWorkspaces: [] as Workspace[],
      };

    set((state) => {
      const personas = uniquePersonas([...state.personas, storedPersona]);
      const sessions = {
        ...state.sessions,
        [userId]: {
          userId,
          accessToken: loginResult?.accessToken ?? '',
          refreshToken: loginResult?.refreshToken ?? '',
          privateWorkspaces: parts.privateWorkspaces,
          sharedWorkspaces: parts.sharedWorkspaces,
        },
      };
      const activeWorkspaceByUser = {
        ...state.activeWorkspaceByUser,
        [userId]: parts.privateWorkspaces[0]?._id ?? parts.sharedWorkspaces[0]?._id ?? '',
      };
      savePersistedPersonas(personas);
      savePersistedWorkspaces(sessions);
      savePersistedContext({ activeUserId: userId, activeWorkspaceByUser });
      return {
        personas,
        activeUserId: userId,
        activeWorkspaceByUser,
        sessions,
      };
    });

    return true;
  },

  logoutUser: (userId: string) => {
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions[userId];
      const personas = state.personas.filter((persona) => persona.id !== userId || persona.persistInSessions);
      savePersistedPersonas(personas.filter((persona) => persona.id !== userId));
      const nextActiveUserId = state.activeUserId === userId
        ? Object.keys(sessions)[0] ?? ''
        : state.activeUserId;
      savePersistedWorkspaces(sessions);
      savePersistedContext({ activeUserId: nextActiveUserId, activeWorkspaceByUser: state.activeWorkspaceByUser });
      return { sessions, personas, activeUserId: nextActiveUserId };
    });
  },

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
    const uid = get().activeUserId;
    if (!jwt) {
      const ws = {
        ...createOfflineWorkspace(uid, name),
        slug,
      };
      set((state) => {
        const session = state.sessions[uid];
        if (!session) return state;
        const sessions = {
          ...state.sessions,
          [uid]: {
            ...session,
            privateWorkspaces: [...session.privateWorkspaces, ws],
          },
        };
        const activeWorkspaceByUser = { ...state.activeWorkspaceByUser, [uid]: ws._id };
        savePersistedWorkspaces(sessions);
        savePersistedContext({ activeUserId: uid, activeWorkspaceByUser });
        return {
          activeWorkspaceByUser,
          sessions,
        };
      });
      return ws;
    }
    try {
      const ws = await api.post<Workspace>('/api/workspaces', { name, slug }, jwt);
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

  activeWorkspace: () => {
    const { sessions, activeUserId, activeWorkspaceByUser } = get();
    const session = sessions[activeUserId];
    if (!session) return null;
    const all = [...session.privateWorkspaces, ...session.sharedWorkspaces];
    return all.find((workspace) => workspace._id === activeWorkspaceByUser[activeUserId]) ?? all[0] ?? null;
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
