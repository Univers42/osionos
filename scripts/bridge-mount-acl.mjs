/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mount-acl.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Who may do what to a grobase mount linked to a workspace (osionos_workspace_databases).
// Every member of a linking workspace reads it; only an editor, admin or owner writes it.
// The data plane separates tenants, not users, so this check is the only per-user
// isolation mount data has.

const WRITE_ROLES = new Set(['owner', 'admin', 'editor']);
const READ_OPS = new Set(['list', 'get', 'aggregate']);

/** 'read' for list/get/aggregate, 'write' for every other query-router op. */
export function mountOpAccess(op) {
	return READ_OPS.has(op) ? 'read' : 'write';
}

/**
 * workspace id (lowercase) → the caller's role in it. A members row decides; a workspace
 * the token lists without a row keeps the role the token was minted with (its home
 * workspace is 'owner'), and one listed with no role claim is a viewer.
 */
export function workspaceRoles(authContext, memberRows) {
	const roles = new Map();
	const claims = authContext.roles ?? {};
	for (const id of authContext.workspaceIds) roles.set(String(id).toLowerCase(), String(claims[id] ?? 'viewer'));
	for (const row of memberRows) roles.set(String(row.workspace_id).toLowerCase(), String(row.role));
	return roles;
}

/** Among the link rows of one mount, the first that grants `access`, or null. */
export function grantingMount(linkRows, roles, access) {
	if (access === 'read') return linkRows[0] ?? null;
	return linkRows.find((row) => WRITE_ROLES.has(roles.get(String(row.workspace_id).toLowerCase()))) ?? null;
}
