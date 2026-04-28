/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   userStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 16:12:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from '@/shared/api/client';
import seedUsers from '@/data/seedUsers.json';
import type { StaticPersona, Workspace } from '@/entities/user';

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
  if (!jwt || !API_BASE) return [];  // offline mode — skip network call
  try {
    return await api.get<Workspace[]>('/api/workspaces', jwt);
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
