/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sharePolicyApi.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge calls against the permission-engine (live database pages + matrix):
 *  roles, policies CRUD and the central decide endpoint, all via /api/perms/*. */

import { api } from '@/shared/api/client';
import { permsBearer } from './shareApi';
import { permsPathFor } from './permsPath';
import type { EnginePolicyPayload, EnginePolicyRow, EngineRole } from './types';

export interface DecideRequest {
  user: { id: string };
  resource_type: string;
  resource_name: string;
  op: 'list' | 'get' | 'create' | 'update' | 'upsert' | 'delete' | string;
}

export interface DecideResponse {
  allow: boolean;
  reason: string;
  mode: 'abac' | 'rbac';
  mask?: { hide?: string[]; redact?: Record<string, string> };
}

/** All engine roles (id/name/description/metadata). */
export async function fetchRoles(workspaceId: string): Promise<EngineRole[]> {
  const body = await api.get<{ roles: EngineRole[] }>(permsPathFor('/api/perms/roles', workspaceId), permsBearer());
  return body.roles ?? [];
}

/** Every resource policy, including ids (needed for deletes). */
export async function fetchPolicies(workspaceId: string): Promise<EnginePolicyRow[]> {
  const body = await api.get<{ policies: EnginePolicyRow[] }>(permsPathFor('/api/perms/policies', workspaceId), permsBearer());
  return body.policies ?? [];
}

/** Create one policy row. */
export async function createPolicy(payload: EnginePolicyPayload): Promise<EnginePolicyRow> {
  return api.post<EnginePolicyRow>('/api/perms/policies', payload, permsBearer());
}

/** Delete one policy row by id. */
export async function deletePolicy(policyId: string): Promise<void> {
  await api.delete<{ deleted: boolean }>(`/api/perms/policies/${encodeURIComponent(policyId)}`, permsBearer());
}

/** Central ABAC decision (the "View as" tester). */
export async function decide(workspaceId: string, request: DecideRequest): Promise<DecideResponse> {
  return api.post<DecideResponse>(permsPathFor('/api/perms/decide', workspaceId), request, permsBearer());
}
