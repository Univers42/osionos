/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   api.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the users administration API (scripts/bridge-account-users.mjs).
 *
 * The route answers an allowlist, so every answer is rebuilt here field by field: a column the
 * panel has no use for (an email, if a bridge ever sent one) cannot reach the store.
 * Nothing is cached; the store re-reads a user after each write.
 */

import { api, getActivePageJwt } from "@/shared/api/client";
import { isPlatformRole, type PlatformRole } from "@/features/auth/model/platformRole";

const USERS = "/api/account/admin/users";

export interface AdminUser {
  userId: string;
  displayName: string;
  username: string | null;
  directoryOptOut: boolean;
}

export interface AdminUserPatch {
  displayName?: string;
  directoryOptOut?: boolean;
}

export interface AdminUsersPage {
  users: AdminUser[];
  nextCursor: string | null;
}

export interface AdminUserDetail {
  user: AdminUser;
  roles: PlatformRole[];
}

const jwt = () => getActivePageJwt() ?? undefined;
const userPath = (userId: string) => `${USERS}/${encodeURIComponent(userId)}`;

function toUser(raw: Record<string, unknown>): AdminUser {
  return {
    userId: String(raw.userId ?? ""),
    displayName: String(raw.displayName ?? ""),
    username: typeof raw.username === "string" ? raw.username : null,
    directoryOptOut: raw.directoryOptOut === true,
  };
}

const toRoles = (raw: unknown): PlatformRole[] => (Array.isArray(raw) ? raw.filter(isPlatformRole) : []);

/** One keyset page. Caveat: a malformed row is kept with empty fields rather than dropped, so a
 *  bridge bug shows as a blank row instead of a silently shorter list. */
export async function listAdminUsers({ limit, cursor }: { limit: number; cursor?: string | null }): Promise<AdminUsersPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const res = await api.get<{ users?: Record<string, unknown>[]; nextCursor?: string | null }>(`${USERS}?${query}`, jwt());
  return {
    users: Array.isArray(res?.users) ? res.users.map(toUser) : [],
    nextCursor: typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null,
  };
}

export async function getAdminUser(userId: string): Promise<AdminUserDetail> {
  const res = await api.get<{ user?: Record<string, unknown>; roles?: unknown }>(userPath(userId), jwt());
  return { user: toUser(res?.user ?? {}), roles: toRoles(res?.roles) };
}

/** Only displayName and directoryOptOut leave the client; the bridge refuses anything else. */
export async function updateAdminUser(userId: string, patch: AdminUserPatch): Promise<void> {
  const body: AdminUserPatch = {};
  if (patch.displayName !== undefined) body.displayName = patch.displayName;
  if (patch.directoryOptOut !== undefined) body.directoryOptOut = patch.directoryOptOut;
  await api.patch(userPath(userId), body, jwt());
}

export async function changeAdminUserRole(userId: string, role: PlatformRole, action: "grant" | "revoke"): Promise<void> {
  await api.put(`${userPath(userId)}/roles`, { role, action }, jwt());
}
