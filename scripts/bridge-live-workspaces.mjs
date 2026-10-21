/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-live-workspaces.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The LIVE membership rule (C98) — the ONE function that decides which
 * workspaces a caller may read.
 *
 * A workspace counts only if it is
 *   (a) the caller's OWN private workspace — the one the token signs with the
 *       role 'owner' — or
 *   (b) found in `osionos_workspace_members` AT QUERY TIME.
 *
 * The member list the TOKEN carries is never trusted: it was minted at login
 * and lives for an hour, so a removed member would keep reading the
 * workspace's private pages (and a demoted member would keep the old role)
 * until the token expired. The live rows are read by the caller, in the same
 * statement that needs them, and never cached.
 *
 * Pure: no I/O, no clock, never throws. The bridge (scripts/bridge-api.mjs)
 * and the AI service (services/osionos-ai/src/retrieval/acl.ts) both import
 * it, so the two can never disagree about who may read what.
 */

/** The shape of a uuid: an id that is not one can never be a workspace id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The lower-case uuid, or null when the value is not one. */
function uuidOrNull(value) {
	return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * The token's private workspace: the one it signs with the role 'owner'.
 *
 * A token that carries no owner falls back to its first workspace, which is
 * what the AI service's own auth does (services/osionos-ai/src/auth.ts).
 *
 * @param {{ workspaceIds?: readonly string[], roles?: Record<string, string> }} verified
 * @returns {string} the uuid, or '' when the token carries none
 */
export function privateWorkspaceOf(verified) {
	const ids = Array.isArray(verified?.workspaceIds) ? verified.workspaceIds : [];
	const roles = verified?.roles && typeof verified.roles === 'object' ? verified.roles : {};
	const owner = ids.find((id) => String(roles[id] ?? '').toLowerCase() === 'owner');
	return uuidOrNull(owner ?? ids[0]) ?? '';
}

/**
 * The workspaces the caller may read.
 *
 * @param {object} options
 * @param {string} options.privateWorkspaceId the token's own private workspace
 * @param {readonly (string | { workspace_id?: unknown })[]} [options.memberWorkspaces] the LIVE member rows
 * @param {readonly string[] | null} [options.scope] the token's scope, intersected when given (C115)
 * @returns {string[]} the workspace ids, lower-case, in a stable order
 */
export function liveReadableWorkspaces({ privateWorkspaceId, memberWorkspaces, scope = null }) {
	const out = new Set();
	const own = uuidOrNull(privateWorkspaceId);
	if (own) out.add(own);
	for (const entry of Array.isArray(memberWorkspaces) ? memberWorkspaces : []) {
		const id = uuidOrNull(typeof entry === 'string' ? entry : entry?.workspace_id);
		if (id) out.add(id);
	}
	if (!Array.isArray(scope)) return [...out];
	const allowed = new Set(scope.map(uuidOrNull).filter((id) => id !== null));
	return [...out].filter((id) => allowed.has(id));
}
