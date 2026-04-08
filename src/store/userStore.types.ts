/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   userStore.types.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Pre-defined user profile used for playground login. */
export interface StaticPersona {
  /** Filled by init() after first successful login. Empty string until then. */
  id: string;
  email: string;
  password: string;
  name: string;
  emoji: string;
  roleBadge: string;
}

/** Workspace metadata returned from the API. */
export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  settings?: Record<string, unknown>;
}

export interface UserSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  privateWorkspaces: Workspace[];  // workspaces owned by this user
  sharedWorkspaces: Workspace[];   // workspaces where user is member but not owner
}

export interface UserStore {
  personas: StaticPersona[];
  sessions: Record<string, UserSession>;
  activeUserId: string;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  switchUser: (userId: string) => void;
  refreshWorkspaces: (userId: string) => Promise<void>;
  createWorkspace: (name: string, slug: string) => Promise<Workspace | null>;

  // Selectors
  activeSession: () => UserSession | null;
  activePersona: () => StaticPersona | null;
  activeJwt: () => string | null;
  personaById: (id: string) => StaticPersona | undefined;
}
