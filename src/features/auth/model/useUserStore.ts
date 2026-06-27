/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUserStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 19:49:09 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { api } from '@/shared/api/client';
import type { UserSession, UserStore, Workspace } from '@/entities/user';
import {
  INITIAL_PERSONAS,
  ALLOW_OFFLINE_MODE,
  REQUIRE_BRIDGE_SESSION,
  isPortalMode,
  type BridgeSessionImport,
  consumeBridgeSessionFromLocation,
  createOfflineWorkspace,
  fetchWorkspaces,
  apiJwtFromSessionToken,
  pageApiJwtFromSessionToken,
  isAdminFromSessionToken,
  isBridgeSession,
  loginPersona,
  partition,
  seededWorkspaceSession,
  signupPersona,
} from '@/features/auth/model/userStore.helpers';
import { selectActivatedSessions } from '@/features/auth/model/sessionSelect';

export type { StaticPersona, Workspace } from '@/entities/user';

// Module-level guard against React Strict Mode double-invoke
let _initInProgress = false;

const ACTIVE_ACCOUNTS_STORAGE_KEY = 'osionos:active-accounts';
const WORKSPACES_STORAGE_KEY = 'osionos:user-workspaces';
const ACTIVE_CONTEXT_STORAGE_KEY = 'osionos:user-context';
const BRIDGE_SESSION_STORAGE_KEY = 'osionos:bridge-session';
// Set in sessionStorage immediately BEFORE a website redirect when the user
// deliberately chose "Add another account" — tells resolveInitialState to MERGE
// the returning handoff into the existing accounts. Absent (the default for any
// fresh sign-in) → the handoff REPLACES the account set, so a new login never
// inherits a different person's session left in this browser.
const ADDING_ACCOUNT_FLAG = 'osionos:adding-account';
// Persisted bridge sessions age out after this window so a stale cross-account
// record can't linger in the switcher indefinitely (the never-expiring bug).
const BRIDGE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Read+clear the deliberate "add account" intent (one-shot, survives the redirect). */
function consumeAddingAccountIntent(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const adding = sessionStorage.getItem(ADDING_ACCOUNT_FLAG) === '1';
  if (adding) sessionStorage.removeItem(ADDING_ACCOUNT_FLAG);
  return adding;
}

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

// Bridge sessions are persisted as a MAP keyed by userId so MULTIPLE accounts
// survive a hard refresh (accumulate-accounts). Reads migrate the legacy
// single-record shape transparently.
function readPersistedBridgeSessions(): Record<string, PersistedBridgeSession> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BRIDGE_SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    const records: PersistedBridgeSession[] = Array.isArray(parsed)
      ? parsed as PersistedBridgeSession[]
      : parsed && typeof parsed === 'object' && (parsed as PersistedBridgeSession).session
        ? [parsed as PersistedBridgeSession]                               // legacy single record
        : parsed && typeof parsed === 'object'
          ? Object.values(parsed as Record<string, PersistedBridgeSession>) // map
          : [];
    const out: Record<string, PersistedBridgeSession> = {};
    for (const record of records) {
      if (!record?.session?.userId || !record?.persona?.id) continue;
      if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) continue;
      out[record.session.userId] = record;
    }
    return out;
  } catch {
    return {};
  }
}

function savePersistedBridgeSessions(map: Record<string, PersistedBridgeSession>) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BRIDGE_SESSION_STORAGE_KEY, JSON.stringify(map));
}

function savePersistedBridgeSession(record: PersistedBridgeSession) {
  const map = readPersistedBridgeSessions();
  map[record.session.userId] = record;
  savePersistedBridgeSessions(map);
}

function clearPersistedBridgeSession(userId?: string) {
  if (typeof localStorage === 'undefined') return;
  if (!userId) {
    localStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
    return;
  }
  const map = readPersistedBridgeSessions();
  if (map[userId]) {
    delete map[userId];
    savePersistedBridgeSessions(map);
  }
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

function activateBridgeSessions(records: PersistedBridgeSession[], preferredActiveUserId?: string) {
  const personas: typeof INITIAL_PERSONAS = [];
  const sessions: Record<string, UserSession> = {};
  const workspaceByUser: Record<string, string> = {};
  const persistedMap: Record<string, PersistedBridgeSession> = {};
  for (const record of records) {
    const storedPersona = { ...record.persona, persistInSessions: true };
    const bridgeSession: UserSession = {
      ...record.session,
      privateWorkspaces: record.session.privateWorkspaces ?? [],
      sharedWorkspaces: record.session.sharedWorkspaces ?? [],
    };
    personas.push(storedPersona);
    sessions[bridgeSession.userId] = bridgeSession;
    workspaceByUser[bridgeSession.userId] = bridgeSession.privateWorkspaces[0]?._id ?? bridgeSession.sharedWorkspaces[0]?._id ?? '';
    persistedMap[bridgeSession.userId] = {
      ...record,
      persona: storedPersona,
      session: bridgeSession,
      // Guarantee a real expiry so a stale cross-account record ages out of the
      // switcher (readPersistedBridgeSessions drops expired records).
      expiresAt: record.expiresAt || new Date(Date.now() + BRIDGE_SESSION_TTL_MS).toISOString(),
    };
  }
  const nextPersonas = uniquePersonas(personas);
  const storedContext = readPersistedContext();
  const activeUserId = preferredActiveUserId && sessions[preferredActiveUserId]
    ? preferredActiveUserId
    : storedContext.activeUserId && sessions[storedContext.activeUserId]
      ? storedContext.activeUserId
      : (records[0]?.session.userId ?? '');
  const activeWorkspaceByUser = { ...workspaceByUser, ...(storedContext.activeWorkspaceByUser ?? {}) };
  savePersistedPersonas(nextPersonas);
  savePersistedWorkspaces(sessions);
  savePersistedBridgeSessions(persistedMap);
  savePersistedContext({ activeUserId, activeWorkspaceByUser });
  return { personas: nextPersonas, sessions, activeUserId, activeWorkspaceByUser };
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

function portalRequiredState() {
  return {
    personas: [] as typeof INITIAL_PERSONAS,
    sessions: {} as Record<string, UserSession>,
    activeUserId: '',
    activeWorkspaceByUser: {} as Record<string, string>,
    initialized: true,
    loading: false,
    error: null as string | null,
  };
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

function renameWorkspaceList(workspaces: Workspace[], workspaceId: string, name: string, icon?: string) {
  return workspaces.map((workspace) => {
    if (workspace._id !== workspaceId) return workspace;
    return { ...workspace, name, ...(icon ? { icon } : {}) };
  });
}

function renamedWorkspaceSession(session: UserSession, workspaceId: string, name: string, icon?: string): UserSession {
  return {
    ...session,
    privateWorkspaces: renameWorkspaceList(session.privateWorkspaces, workspaceId, name, icon),
    sharedWorkspaces: renameWorkspaceList(session.sharedWorkspaces, workspaceId, name, icon),
  };
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

  if (firstLogin?.ok) {
    const { userId, accessToken, refreshToken } = firstLogin;
    personas[0] = { ...personas[0], id: userId };
    const workspaces = await fetchWorkspaces(accessToken);
    const { privateWorkspaces, sharedWorkspaces } = partition(workspaces, userId);
    sessions[userId] = { userId, accessToken, refreshToken, privateWorkspaces, sharedWorkspaces };
    firstUserId = userId;

    const remainingResults = await Promise.all(INITIAL_PERSONAS.slice(1).map(loginPersona));
    for (let i = 0; i < remainingResults.length; i++) {
      const loginResult = remainingResults[i];
      if (!loginResult?.ok) continue;
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
  const fromUrl = await consumeBridgeSessionFromLocation().catch(() => null);
  // A fresh handoff REPLACES the account set (fresh primary login never inherits
  // a different person's session); the in-app "Add another account" intent flag
  // opts into MERGE; a plain refresh restores every persisted account. See
  // selectActivatedSessions for the full isolation rule.
  const fromUserId = fromUrl?.session?.userId ?? null;
  const adding = fromUserId ? consumeAddingAccountIntent() : false;
  const records = selectActivatedSessions(fromUserId, fromUrl, readPersistedBridgeSessions(), adding);
  if (records.length > 0) {
    return { ...activateBridgeSessions(records, fromUserId ?? undefined), initialized: true, loading: false, error: null };
  }
  if (isPortalMode()) return portalRequiredState();
  if (bridgeOnlyMode()) return bridgeSessionRequiredState();
  const personas = initialPersonas();
  return connectedOrOfflineState(personas);
}

/** Zustand store managing multi-user authentication and workspace access. */
export const useUserStore = create<UserStore>((set, get) => ({
  personas:     isPortalMode() ? [] : uniquePersonas([...INITIAL_PERSONAS.map(p => ({ ...p })), ...readPersistedPersonas()]),
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
      set(isPortalMode() ? portalRequiredState() : bridgeOnlyMode() ? bridgeSessionRequiredState() : offlineState());
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
    // loginResult is null ONLY when no backend is configured (genuine offline). A reachable
    // backend returns {ok:true} or {ok:false,message}; a real auth failure (wrong password,
    // server error) MUST be rejected — never silently turned into a `local-*` mock account,
    // which would "accept" any password and leave the old account visible.
    if (loginResult && !loginResult.ok) {
      set({ error: loginResult.message ?? 'Invalid email or password.', loading: false });
      return false;
    }
    const ok = loginResult?.ok ? loginResult : null;
    const userId = ok?.userId ?? `local-${crypto.randomUUID()}`;
    const storedPersona = { ...persona, id: userId };
    const workspaces = ok ? await fetchWorkspaces(ok.accessToken) : [];
    const parts = ok
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
          accessToken: ok?.accessToken ?? '',
          refreshToken: ok?.refreshToken ?? '',
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
      // Persist a per-account bridge session so an added account survives a hard
      // refresh (the accumulate-accounts fix). Honour the "keep me signed in" box.
      if (ok && persistInSessions) {
        savePersistedBridgeSession({
          ok: true,
          session: sessions[userId],
          persona: { ...storedPersona, persistInSessions: true },
          expiresAt: new Date(Date.now() + BRIDGE_SESSION_TTL_MS).toISOString(),
        });
      }
      return {
        personas,
        activeUserId: userId,
        activeWorkspaceByUser,
        sessions,
        error: null,
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

  renameWorkspace: (workspaceId, name, icon) => {
    set((state) => {
      const sessions = Object.fromEntries(
        Object.entries(state.sessions).map(([userId, session]) => [
          userId,
          renamedWorkspaceSession(session, workspaceId, name, icon),
        ]),
      );
      savePersistedWorkspaces(sessions);
      return { sessions };
    });
  },

  deleteWorkspace: async (workspaceId) => {
    const state = get();
    const uid = state.activeUserId;
    const session = state.sessions[uid];
    if (!session) return false;
    const allWorkspaces = [...session.privateWorkspaces, ...session.sharedWorkspaces];
    if (allWorkspaces.length <= 1) return false;

    const jwt = get().activeJwt();
    if (jwt) {
      await api.delete(`/api/workspaces/${workspaceId}`, jwt).catch(() => undefined);
    }

    set((currentState) => {
      const currentSession = currentState.sessions[uid];
      if (!currentSession) return currentState;
      const privateWorkspaces = currentSession.privateWorkspaces.filter((workspace) => workspace._id !== workspaceId);
      const sharedWorkspaces = currentSession.sharedWorkspaces.filter((workspace) => workspace._id !== workspaceId);
      const nextWorkspaceId = currentState.activeWorkspaceByUser[uid] === workspaceId
        ? privateWorkspaces[0]?._id ?? sharedWorkspaces[0]?._id ?? ''
        : currentState.activeWorkspaceByUser[uid];
      const sessions = {
        ...currentState.sessions,
        [uid]: { ...currentSession, privateWorkspaces, sharedWorkspaces },
      };
      const activeWorkspaceByUser = { ...currentState.activeWorkspaceByUser, [uid]: nextWorkspaceId };
      savePersistedWorkspaces(sessions);
      savePersistedContext({ activeUserId: uid, activeWorkspaceByUser });
      return { sessions, activeWorkspaceByUser };
    });

    return true;
  },

  importBridgeSession: (session, persona, expiresAt) => set((state) => {
    const record: PersistedBridgeSession = { ok: true, session, persona: { ...persona, persistInSessions: true }, expiresAt };
    savePersistedBridgeSession(record);
    const bridgeSession: UserSession = {
      ...session,
      privateWorkspaces: session.privateWorkspaces ?? [],
      sharedWorkspaces: session.sharedWorkspaces ?? [],
    };
    const personas = uniquePersonas([...state.personas, record.persona]);
    const sessions = { ...state.sessions, [session.userId]: bridgeSession };
    const workspaceId = bridgeSession.privateWorkspaces[0]?._id ?? bridgeSession.sharedWorkspaces[0]?._id ?? '';
    const activeWorkspaceByUser = { ...state.activeWorkspaceByUser, [session.userId]: state.activeWorkspaceByUser[session.userId] ?? workspaceId };
    savePersistedPersonas(personas);
    savePersistedWorkspaces(sessions);
    savePersistedContext({ activeUserId: session.userId, activeWorkspaceByUser });
    return { personas, sessions, activeUserId: session.userId, activeWorkspaceByUser, error: null };
  }),

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

  activePageJwt: () => pageApiJwtFromSessionToken(get().activeSession()?.accessToken) || null,

  isAdmin: () => isAdminFromSessionToken(get().activeSession()?.accessToken),

  personaById: (id: string) => get().personas.find(p => p.id === id),
}));

// Expose on globalThis so usePageStore can access JWT without circular imports
(globalThis as unknown as Record<string, unknown>).__playgroundUserStore = useUserStore;
