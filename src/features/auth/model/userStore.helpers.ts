/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   userStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 19:49:09 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from '@/shared/api/client';
import seedUsers from '@/data/seedUsers.json';
import type { StaticPersona, UserSession, Workspace } from '@/entities/user';

type SeedUsersFile = {
  users?: StaticPersona[];
  workspaces?: Workspace[];
};

const seed = seedUsers as SeedUsersFile;

export const INITIAL_PERSONAS: StaticPersona[] = (seed.users ?? []).map((user) => ({
  ...user,
  id: user.id || '',
  persistInSessions: user.persistInSessions ?? true,
}));

export const SEEDED_WORKSPACES: Workspace[] = seed.workspaces ?? [];

/** Resolved API base URL — empty string means "no API configured → offline" */
export const API_BASE: string = ((import.meta.env as Record<string, string>)['VITE_API_URL'] ?? '').trim();
const TEST_MODE = (import.meta.env as Record<string, string>)['MODE'] === 'test';
export const REQUIRE_BRIDGE_SESSION = ((import.meta.env as Record<string, string>)['VITE_REQUIRE_BRIDGE_SESSION'] ?? (TEST_MODE ? 'false' : 'true')) !== 'false';
export const ALLOW_OFFLINE_MODE = ((import.meta.env as Record<string, string>)['VITE_ALLOW_OFFLINE_MODE'] ?? (TEST_MODE ? 'true' : 'false')) === 'true';
export const PRISMATICA_URL = ((import.meta.env as Record<string, string>)['VITE_PRISMATICA_URL'] ?? 'http://localhost:4322').trim();
export const BRIDGE_APP_TOKEN_PREFIX = 'osionos_v1.';

export type BridgeSessionImport = {
  ok: boolean;
  persona: StaticPersona;
  session: UserSession;
  expiresAt?: string;
  message?: string;
};

export function isBridgeAppToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(BRIDGE_APP_TOKEN_PREFIX);
}

function decodeBridgeAppTokenPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!isBridgeAppToken(token)) return null;
  const [, encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;
  try {
    const paddedPayload = `${encodedPayload}${'='.repeat((4 - encodedPayload.length % 4) % 4)}`;
    const json = globalThis.atob(paddedPayload.replaceAll('-', '+').replaceAll('_', '/'));
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function isBridgeAppTokenExpired(token: string | null | undefined, now = Date.now()): boolean {
  if (!isBridgeAppToken(token)) return false;
  const payload = decodeBridgeAppTokenPayload(token);
  const exp = Number(payload?.exp);
  return !Number.isFinite(exp) || exp <= Math.floor(now / 1000);
}

export function apiJwtFromSessionToken(token: string | null | undefined): string {
  if (!token || isBridgeAppToken(token)) return '';
  return token;
}

export function pageApiJwtFromSessionToken(token: string | null | undefined): string {
  if (isBridgeAppTokenExpired(token)) return '';
  return token ?? '';
}

export function isBridgeSession(session: UserSession | null | undefined): boolean {
  if (!session) return false;
  if (isBridgeAppToken(session.accessToken)) return true;
  return session.privateWorkspaces.some((workspace) => workspace.settings?.bridgeProvider === 'prismatica');
}

function bridgeTokenFromLocation(): string {
  if (globalThis.window === undefined) return '';
  const hash = globalThis.location.hash.startsWith('#') ? globalThis.location.hash.slice(1) : globalThis.location.hash;
  const searchToken = new URLSearchParams(globalThis.location.search).get('bridge_token') ?? '';
  const hashToken = new URLSearchParams(hash).get('bridge_token') ?? '';
  return (hashToken || searchToken).trim();
}

export function clearBridgeTokenFromLocation() {
  if (globalThis.window === undefined) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.delete('bridge_token');
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  hashParams.delete('bridge_token');
  url.hash = hashParams.toString();
  globalThis.history.replaceState(globalThis.history.state, document.title, url.toString());
}

export async function consumeBridgeSessionFromLocation(): Promise<BridgeSessionImport | null> {
  const token = bridgeTokenFromLocation();
  if (!token || !API_BASE) return null;
  const response = await fetch(`${API_BASE}/api/auth/bridge/consume`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error('Bridge session could not be imported.');
  const payload = await response.json() as BridgeSessionImport;
  clearBridgeTokenFromLocation();
  return payload;
}

export async function loginPersona(persona: StaticPersona) {
  if (!API_BASE) return null; // no API configured → skip fetch entirely
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(
      `${API_BASE}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: persona.email, password: persona.password }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return { userId: data.user.id as string, accessToken: data.accessToken as string, refreshToken: data.refreshToken as string };
  } catch {
    return null;
  }
}

export async function signupPersona(persona: StaticPersona) {
  if (!API_BASE) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(
      `${API_BASE}/api/auth/signup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: persona.email,
          password: persona.password,
          name: persona.name,
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return { userId: data.user.id as string, accessToken: data.accessToken as string, refreshToken: data.refreshToken as string };
  } catch {
    return null;
  }
}

export async function fetchWorkspaces(jwt: string): Promise<Workspace[]> {
  const apiJwt = apiJwtFromSessionToken(jwt);
  if (!apiJwt || !API_BASE) return [];  // offline mode — skip network call
  try {
    return await api.get<Workspace[]>('/api/workspaces', apiJwt);
  } catch {
    return [];
  }
}

export function partition(workspaces: Workspace[], ownerId: string) {
  return {
    privateWorkspaces: workspaces.filter(w => w.ownerId === ownerId),
    sharedWorkspaces:  workspaces.filter(w => w.ownerId !== ownerId && (!w.memberIds || w.memberIds.includes(ownerId))),
  };
}

export function seededWorkspaceSession(userId: string) {
  const privateWorkspaces = SEEDED_WORKSPACES.filter((w) => w.ownerId === userId);
  const sharedWorkspaces = SEEDED_WORKSPACES.filter(
    (w) => w.ownerId !== userId && (w.memberIds?.includes(userId) ?? false),
  );

  return { privateWorkspaces, sharedWorkspaces };
}

export function createOfflineWorkspace(userId: string, name: string): Workspace {
  const slug = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || userId;
  return {
    _id: `mock-ws-${userId}-${Date.now()}`,
    name,
    slug,
    ownerId: userId,
    memberIds: [userId],
    settings: {
      plan: 'Playground',
      memberCount: 1,
    },
  };
}
