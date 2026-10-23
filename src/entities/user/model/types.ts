/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 05:03:32 by dlesieur         ###   ########.fr       */
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
  persistInSessions?: boolean;
  workspaceIds?: string[];
}

/** Workspace metadata returned from the API. */
export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  icon?: string;
  memberIds?: string[];
  settings?: Record<string, unknown>;
  /** The CALLER's own membership role, never the creator's: the bridge stamps it from
   *  osionos_workspace_members, and a bridge-created workspace puts the creator's
   *  owner role in `settings` instead (models/osionos-bridge-migration.sql:392-404). */
  role?: string;
  /** The caller's own workspace permissions (the strings the bridge's ACL compares). */
  permissions?: string[];
  /** Set by the bridge's workspace list while a delete is staged: the owner may cancel until `deleteAfter`. */
  pendingDeleteAt?: string | null;
  deleteAfter?: string | null;
}

/** What `deleteWorkspace` did: `code` is the bridge's machine code (e.g. `sudo_required`) on a refusal. */
export interface DeleteWorkspaceOutcome {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface UserSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  privateWorkspaces: Workspace[];  // workspaces owned by this user
  sharedWorkspaces: Workspace[];   // workspaces where user is member but not owner
}

/** The platform role of a signed-in user — the session claim's vocabulary (ADR 0005).
 *  The bridge is the authority: this only decides which surfaces the app offers. */
export type PlatformRole = 'admin' | 'moderator' | 'user' | 'guest';

export interface UserStore {
  personas: StaticPersona[];
  sessions: Record<string, UserSession>;
  activeUserId: string;
  activeWorkspaceByUser: Record<string, string>;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  switchUser: (userId: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  loginWithCredentials: (
    email: string,
    password: string,
    persistInSessions: boolean,
    mode: "login" | "signup",
    name?: string,
  ) => Promise<boolean>;
  /** Signs the persona out of every device (bridge), then locally whatever the bridge said. */
  logoutUser: (userId: string) => Promise<unknown>;
  /** The bridge refused this token as signed out: drop the session that owns it. */
  handleSessionRevoked: (token: string) => void;
  refreshWorkspaces: (userId: string) => Promise<void>;
  createWorkspace: (name: string, slug: string) => Promise<Workspace | null>;
  renameWorkspace: (workspaceId: string, name: string, icon?: string) => void;
  deleteWorkspace: (workspaceId: string) => Promise<DeleteWorkspaceOutcome>;
  importBridgeSession: (session: UserSession, persona: StaticPersona, expiresAt?: string) => void;

  // Selectors
  activeSession: () => UserSession | null;
  activeWorkspace: () => Workspace | null;
  activePersona: () => StaticPersona | null;
  activeJwt: () => string | null;
  activePageJwt: () => string | null;
  isAdmin: () => boolean;
  /** The platform role the active session claims; null when the session claims none. */
  platformRole: () => PlatformRole | null;
  personaById: (id: string) => StaticPersona | undefined;
}
