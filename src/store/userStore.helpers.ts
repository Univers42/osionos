/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   userStore.helpers.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from '../api/client';
import type { StaticPersona, Workspace } from './userStore.types';

export const INITIAL_PERSONAS: StaticPersona[] = [
  {
    id: '',
    email: 'admin@playground.local',
    password: 'playground123', // NOSONAR - demo/playground credential
    name: 'Dylan Admin',
    emoji: '👑',
    roleBadge: 'Admin',
  },
  {
    id: '',
    email: 'alex@playground.local',
    password: 'playground123', // NOSONAR - demo/playground credential
    name: 'Alex Collaborator',
    emoji: '🎨',
    roleBadge: 'Member',
  },
  {
    id: '',
    email: 'sam@playground.local',
    password: 'playground123', // NOSONAR - demo/playground credential
    name: 'Sam Guest',
    emoji: '👁️',
    roleBadge: 'Guest',
  },
];

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
    sharedWorkspaces:  workspaces.filter(w => w.ownerId !== ownerId),
  };
}
