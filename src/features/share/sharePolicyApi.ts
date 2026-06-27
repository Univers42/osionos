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
export async function fetchRoles(): Promise<EngineRole[]> {
  const body = await api.get<{ roles: EngineRole[] }>('/api/perms/roles');
  return body.roles ?? [];
}

/** Every resource policy, including ids (needed for deletes). */
export async function fetchPolicies(): Promise<EnginePolicyRow[]> {
  const body = await api.get<{ policies: EnginePolicyRow[] }>('/api/perms/policies');
  return body.policies ?? [];
}

/** Create one policy row. */
export async function createPolicy(payload: EnginePolicyPayload): Promise<EnginePolicyRow> {
  return api.post<EnginePolicyRow>('/api/perms/policies', payload);
}

/** Delete one policy row by id. */
export async function deletePolicy(policyId: string): Promise<void> {
  await api.delete<{ deleted: boolean }>(`/api/perms/policies/${encodeURIComponent(policyId)}`);
}

/** Central ABAC decision (the "View as" tester). */
export async function decide(request: DecideRequest): Promise<DecideResponse> {
  return api.post<DecideResponse>('/api/perms/decide', request);
}
