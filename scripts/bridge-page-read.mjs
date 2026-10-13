/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-read.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Page READ and SHARING authorization on raw osionos_pages rows — the server half of
 * the client's canReadPage / canChangePageVisibility (src/shared/lib/auth/pageAccess.ts).
 * Callers still run the workspace gate first (requireWorkspaceAccess /
 * ownerOrWorkspaceAccess); this decides what a member of that workspace may see.
 * Pure: no I/O, never throws on a malformed row. Null or unknown visibility is
 * 'private' (as pageRowToEntry shows it); there is deliberately no "ownerless page is
 * readable" legacy branch, so such a page is readable by nobody (SEC1 ruling U1(b)).
 */

const PAGE_VISIBILITIES = new Set(['private', 'shared', 'public']);
const SHARING_KEYS = ['visibility', 'collaborators', 'workspaceId'];

export function pageVisibility(value) {
	return PAGE_VISIBILITIES.has(value) ? value : 'private';
}

// The one owner/collaborator id match. UUIDs are case-insensitive: Postgres stores
// lower-case, a token may carry upper-case.
export function sameId(left, right) {
	return typeof left === 'string' && typeof right === 'string' && left !== '' && left.toLowerCase() === right.toLowerCase();
}

function isPageOwner(row, userId) {
	return sameId(row?.owner_id, userId);
}

function isPageCollaborator(row, userId) {
	const collaborators = Array.isArray(row?.collaborators) ? row.collaborators : [];
	return collaborators.some((entry) => entry !== null && typeof entry === 'object' && entry.role != null && sameId(entry.userId, userId));
}

/** Readable without workspace membership (the marketplace): public, owned, or shared with the caller. */
export function canReadAsNonMember(row, userId) {
	return pageVisibility(row?.visibility) === 'public' || isPageOwner(row, userId) || isPageCollaborator(row, userId);
}

/** Readable by a member of the row's workspace: shared with the workspace, or readable without membership. */
export function canReadPageRow(row, userId) {
	return pageVisibility(row?.visibility) === 'shared' || canReadAsNonMember(row, userId);
}

/**
 * Readable on a surface that spans workspaces (feed, profile gallery, graph): the caller
 * belongs to the row's workspace AND canReadPageRow allows it, so a page shared with one
 * workspace never reaches someone outside it. `memberWorkspaceIds`: the caller's workspaces.
 */
export function canReadPageRowAsMember(row, userId, memberWorkspaceIds) {
	return [...memberWorkspaceIds].some((workspaceId) => sameId(workspaceId, row?.workspace_id)) && canReadPageRow(row, userId);
}

/** The rows of a PostgREST result the caller may read; [] for a non-array result. */
export function readablePageRows(rows, userId) {
	return Array.isArray(rows) ? rows.filter((row) => canReadPageRow(row, userId)) : [];
}

/** Only a page's (non-null) owner changes who may read it: visibility, collaborators, workspace. */
export function canChangePageSharing(row, userId) {
	return isPageOwner(row, userId);
}

function collaboratorGrants(value) {
	return (Array.isArray(value) ? value : [])
		.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.userId === 'string')
		.map((entry) => `${entry.userId.toLowerCase()}:${typeof entry.role === 'string' ? entry.role : ''}`)
		.sort()
		.join(',');
}

const SHARING_UNCHANGED = {
	visibility: (payload, row) => pageVisibility(payload.visibility) === pageVisibility(row?.visibility),
	collaborators: (payload, row) => collaboratorGrants(payload.collaborators) === collaboratorGrants(row?.collaborators),
	workspaceId: (payload, row) => sameId(payload.workspaceId, row?.workspace_id),
};

/**
 * A non-owner's page PATCH minus its sharing keys, plus the keys it tried to CHANGE.
 * Never a 403: the outbox resends workspaceId + visibility on every edit and treats 403
 * as "page gone" (src/store/sync/pageOutbox.ts), which would drop every non-owner edit.
 */
export function withoutForeignSharingChanges(payload, row, userId) {
	if (canChangePageSharing(row, userId)) return { payload, ignored: [] };
	const kept = { ...payload };
	const ignored = [];
	for (const key of SHARING_KEYS) {
		if (!Object.hasOwn(payload, key)) continue;
		delete kept[key];
		if (!SHARING_UNCHANGED[key](payload, row)) ignored.push(key);
	}
	return { payload: kept, ignored };
}
