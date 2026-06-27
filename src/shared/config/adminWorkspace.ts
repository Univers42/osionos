/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   adminWorkspace.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The dedicated, confidential admin workspace — the single shared home for the
 * platform's UI-shell templates, so SEVERAL administrators all author the same
 * set. Seeded by osionos-admin-migration.sql; admins are auto-provisioned as
 * members at login (bridge). These must match the bridge-side constants.
 */
export const ADMIN_WORKSPACE_ID = "0a4d1c2e-0000-4000-8000-000000000ad1";
export const ADMIN_WORKSPACE_SLUG = "osionos-admin";

/** Find the admin workspace among a user's workspaces (by slug, else fixed id). */
export function isAdminWorkspace(ws: { _id?: string; slug?: string } | null | undefined): boolean {
  return Boolean(ws && (ws.slug === ADMIN_WORKSPACE_SLUG || ws._id === ADMIN_WORKSPACE_ID));
}
