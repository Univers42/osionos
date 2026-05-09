/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUserStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 05:35:14 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { api } from '@/shared/api/client';
import type { UserSession, UserStore, Workspace } from '@/entities/user';
import {
  INITIAL_PERSONAS,
  ALLOW_OFFLINE_MODE,
  REQUIRE_BRIDGE_SESSION,
  type BridgeSessionImport,
  consumeBridgeSessionFromLocation,
  createOfflineWorkspace,
  fetchWorkspaces,
  apiJwtFromSessionToken,
  isBridgeSession,
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
const BRIDGE_SESSION_STORAGE_KEY = 'osionos:bridge-session';

type PersistedUserContext = {
  activeUserId?: string;
  activeWorkspaceByUser?: Record<string, string>;
};

type PersistedBridgeSession = BridgeSessionImport;

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

function readPersistedBridgeSession(): PersistedBridgeSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRIDGE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PersistedBridgeSession;
    if (!record.session?.userId || !record.persona?.id) return null;
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      localStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

function savePersistedBridgeSession(record: PersistedBridgeSession) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BRIDGE_SESSION_STORAGE_KEY, JSON.stringify(record));
}

function clearPersistedBridgeSession(userId?: string) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
    return;
  }
  const record = readPersistedBridgeSession();
  if (record?.session.userId === userId) localStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
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

function activateBridgeSession(record: PersistedBridgeSession) {
  const storedPersona = { ...record.persona, persistInSessions: true };
  const bridgeSession: UserSession = {
    ...record.session,
    privateWorkspaces: record.session.privateWorkspaces ?? [],
    sharedWorkspaces: record.session.sharedWorkspaces ?? [],
  };
  const nextPersonas = [storedPersona];
  const sessions: Record<string, UserSession> = { [bridgeSession.userId]: bridgeSession };
  const workspaceId = bridgeSession.privateWorkspaces[0]?._id ?? bridgeSession.sharedWorkspaces[0]?._id ?? '';
  const activeWorkspaceByUser = { [bridgeSession.userId]: workspaceId };
  savePersistedPersonas(nextPersonas);
  savePersistedWorkspaces(sessions);
  savePersistedBridgeSession({ ...record, persona: storedPersona, session: bridgeSession });
  savePersistedContext({ activeUserId: bridgeSession.userId, activeWorkspaceByUser });
  return { personas: nextPersonas, sessions, activeUserId: bridgeSession.userId, activeWorkspaceByUser };
}

function bridgeSessionRequiredState() {
  return {
    personas: [] as typeof INITIAL_PERSONAS,
    sessions: {} as Record<string, UserSession>,
    activeUserId: '',
    activeWorkspaceByUser: {} as Record<string, string>,
    initialized: true,
    loading: false,
    error: 'bridge-session-required',
  };
}

function bridgeOnlyMode() {
  return REQUIRE_BRIDGE_SESSION && !ALLOW_OFFLINE_MODE;
}

function initialPersonas() {
  return uniquePersonas([...INITIAL_PERSONAS.map(p => ({ ...p })), ...readPersistedPersonas()]);
}

function finalizedState(personas: typeof INITIAL_PERSONAS, sessions: Record<string, UserSession>, firstUserId: string) {
  savePersistedPersonas(personas);
  const storedContext = readPersistedContext();
  const activeUserId = storedContext.activeUserId && sessions[storedContext.activeUserId]
    ? storedContext.activeUserId
    : firstUserId;
  savePersistedWorkspaces(sessions);
  savePersistedContext({ activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {} });
  return { personas, sessions, activeUserId, activeWorkspaceByUser: storedContext.activeWorkspaceByUser ?? {}, initialized: true, loading: false, error: null };
}

function offlineState() {
  const personas = initialPersonas();
  const { sessions, firstUserId } = createOfflineSessions(personas);
  return finalizedState(personas, sessions, firstUserId);
}

async function connectedOrOfflineState(personas: typeof INITIAL_PERSONAS) {
  const sessions: Record<string, UserSession> = {};
  let firstUserId = '';
  const firstLogin = await loginPersona(INITIAL_PERSONAS[0]);

  if (firstLogin) {
    const { userId, accessToken, refreshToken } = firstLogin;
    personas[0] = { ...personas[0], id: userId };
    const workspaces = await fetchWorkspaces(accessToken);
    const { privateWorkspaces, sharedWorkspaces } = partition(workspaces, userId);
    sessions[userId] = { userId, accessToken, refreshToken, privateWorkspaces, sharedWorkspaces };
    firstUserId = userId;

    const remainingResults = await Promise.all(INITIAL_PERSONAS.slice(1).map(loginPersona));
    for (let i = 0; i < remainingResults.length; i++) {
      const loginResult = remainingResults[i];
      if (!loginResult) continue;
      const personaIndex = i + 1;
      personas[personaIndex] = { ...personas[personaIndex], id: loginResult.userId };
      const parts = partition(await fetchWorkspaces(loginResult.accessToken), loginResult.userId);
      sessions[loginResult.userId] = { ...loginResult, privateWorkspaces: parts.privateWorkspaces, sharedWorkspaces: parts.sharedWorkspaces };
    }
  }

  if (Object.keys(sessions).length > 0) return finalizedState(personas, sessions, firstUserId);
  console.info('[playground] API unreachable — running in offline mode with seed data');
  return offlineState();
}

async function resolveInitialState() {
  const bridgeSession = await consumeBridgeSessionFromLocation().catch(() => null) ?? readPersistedBridgeSession();
  if (bridgeSession) return { ...activateBridgeSession(bridgeSession), initialized: true, loading: false, error: null };
  if (bridgeOnlyMode()) return bridgeSessionRequiredState();
  const personas = initialPersonas();
  return connectedOrOfflineState(personas);
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
      set(await resolveInitialState());
    } catch {
      set(bridgeOnlyMode() ? bridgeSessionRequiredState() : offlineState());
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
      clearPersistedBridgeSession(userId);
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
    if (isBridgeSession(session)) return;
    const workspaces = await fetchWorkspaces(apiJwtFromSessionToken(session.accessToken));
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
      set((state) => {
        const session = state.sessions[uid];
        if (!session) return state;
        const privateWorkspaces = session.privateWorkspaces.some((workspace) => workspace._id === ws._id)
          ? session.privateWorkspaces
          : [...session.privateWorkspaces, ws];
        const sessions = {
          ...state.sessions,
          [uid]: { ...session, privateWorkspaces },
        };
        const activeWorkspaceByUser = { ...state.activeWorkspaceByUser, [uid]: ws._id };
        savePersistedWorkspaces(sessions);
        savePersistedContext({ activeUserId: uid, activeWorkspaceByUser });
        return { sessions, activeWorkspaceByUser };
      });
      return ws;
    } catch {
      return null;
    }
  },

  importBridgeSession: (session, persona, expiresAt) => {
    set(() => activateBridgeSession({ ok: true, session, persona, expiresAt }));
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

  activeJwt: () => apiJwtFromSessionToken(get().activeSession()?.accessToken) || null,

  personaById: (id: string) => get().personas.find(p => p.id === id),
}));

// Expose on globalThis so usePageStore can access JWT without circular imports
(globalThis as unknown as Record<string, unknown>).__playgroundUserStore = useUserStore;
