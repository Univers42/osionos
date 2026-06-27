/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Shared contracts for the Share dialog (Notion-style page sharing). */

/** The five AbacEngine permission levels, least → most access. */
export type ShareLevel = 'no_access' | 'can_view' | 'can_comment' | 'can_edit' | 'full_access';

export const SHARE_LEVELS: readonly ShareLevel[] = [
  'no_access', 'can_view', 'can_comment', 'can_edit', 'full_access',
] as const;

/** A person from the workspace roster (`GET /api/perms/people`). */
export interface SharePerson {
  id: string;
  email: string;
  name: string;
  /** Functional role, e.g. "analyst" — maps to engine role `agency:analyst`. */
  role: string;
  department?: string;
  clearance?: string;
  region?: string;
  wsRole?: string;
}

/** An engine role row (`GET /api/perms/roles`). */
export interface EngineRole {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

/** What the dialog is sharing. Live database pages also carry the table name. */
export interface ShareResource {
  workspaceId: string;
  resourceId: string;
  resourceType: 'page' | 'database' | 'block';
  /** Set for live database pages: the engine resource (table) name. */
  liveResourceName?: string;
}

/** One row of the dialog: a person or a general-access target with a level. */
export interface ShareEntry {
  key: string;
  target:
    | { type: 'user'; person: SharePerson }
    | { type: 'role'; role: string }
    | { type: 'workspace' }
    | { type: 'public' };
  level: ShareLevel;
  /** AccessRule _id (page mode) or policy id (live mode) backing this entry. */
  sourceId?: string;
}

/** AbacEngine AccessRule shape (packages/core/src/abac + accessRule.model). */
export interface ShareAccessRule {
  _id?: string;
  workspaceId: string;
  resourceId: string | null;
  resourceType: 'workspace' | 'page' | 'database' | 'block';
  target: { type: 'user'; userId: string } | { type: 'role'; role: string } | { type: 'workspace' } | { type: 'public' };
  permission: ShareLevel;
  explicit: boolean;
}

/** permission-engine CreatePolicyDto payload (live database pages). */
export interface EnginePolicyPayload {
  role_id: string;
  resource_type: string;
  resource_name: string;
  actions: string[];
  conditions?: Record<string, unknown>;
  effect: 'allow' | 'deny';
  priority?: number;
}

/** Policy row as listed back by the engine (includes id). */
export interface EnginePolicyRow extends Omit<EnginePolicyPayload, 'conditions' | 'priority'> {
  id: string;
  priority: number;
  conditions: Record<string, unknown> | null;
}
