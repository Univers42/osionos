/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-access-generation.mjs                        :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Access generations: the invalidation half of the collab access cache.
 *
 * Every in-process writer of something an access verdict reads (workspace members, share
 * rules, teams, page rows' access columns, workspace owner, session cutoffs) calls
 * `bumpAccess` once its write has settled. A cache entry carries the generations it was
 * read under and is dead the moment any of them moves. `bumpAccessAfter` is the shape the
 * writers use: it wraps the write's promise, so a write that threw after landing part of
 * its rows still invalidates.
 *
 * Why the bump follows the write: an entry's ticket is taken before its reads. A bump
 * before the write could land between the ticket and a read of the old rows and leave a
 * stale allow under a current ticket; a bump after cannot (a ticket taken later reads rows
 * that are already written).
 *
 * Scope: a workspace id kills every entry of that workspace (a page move, a trash or a
 * rule change can reach any descendant), a user id kills every entry of that user, and no
 * scope at all kills everything. An unknown scope therefore errs toward over-invalidating.
 *
 * Caveat: process-local. A second bridge replica, or a writer outside this process (a
 * database job, a migration, a hand-run SQL), moves no generation here; those writes are
 * bounded by the cache TTL alone (bridge-collab-auth-cache.mjs). The counters are capped
 * at MAX_TRACKED ids; past it they are cleared and the epoch moves, which invalidates
 * everything once rather than losing a bump.
 */

const MAX_TRACKED = 10_000;

// Columns of osionos_pages an access verdict reads. `properties` is selected with the row
// but no decision reads it, so a properties-only edit does not invalidate.
const ACCESS_COLUMNS = ['owner_id', 'workspace_id', 'visibility', 'collaborators', 'parent_page_id', 'archived_at'];

const state = { epoch: 0, workspaces: new Map(), users: new Map() };

const keyOf = (id) => String(id).toLowerCase();
const idsOf = (value) => [value].flat().filter((id) => typeof id === 'string' && id !== '');

function bumpCounter(counters, id) {
	const key = keyOf(id);
	if (!counters.has(key) && counters.size >= MAX_TRACKED) {
		counters.clear();
		state.epoch += 1;
	}
	counters.set(key, (counters.get(key) ?? 0) + 1);
}

/** Invalidate the entries of the named workspaces and users; with neither, every entry. */
export function bumpAccess({ workspaceId, userId } = {}) {
	const workspaces = idsOf(workspaceId);
	const users = idsOf(userId);
	if (workspaces.length === 0 && users.length === 0) {
		state.epoch += 1;
		return;
	}
	for (const id of workspaces) bumpCounter(state.workspaces, id);
	for (const id of users) bumpCounter(state.users, id);
}

/** Bump once `write` settles, whatever it settled as. A falsy `scope` bumps nothing. */
export function bumpAccessAfter(write, scope = {}) {
	return Promise.resolve(write).finally(() => {
		if (scope) bumpAccess(scope);
	});
}

/** True when a page-row write carries a column an access verdict reads. */
export const touchesPageAccess = (columns) => ACCESS_COLUMNS.some((column) => Object.hasOwn(columns, column));

/** The generations a verdict is about to be read under. */
export function accessTicket(userId, workspaceId) {
	const user = keyOf(userId);
	const workspace = keyOf(workspaceId);
	return { epoch: state.epoch, user, workspace, userGeneration: state.users.get(user) ?? 0, workspaceGeneration: state.workspaces.get(workspace) ?? 0 };
}

/** The generations of a user-independent read (the page parent map): a user bump never kills it. */
export function accessTicketWorkspace(workspaceId) {
	const workspace = keyOf(workspaceId);
	return { epoch: state.epoch, user: '', workspace, userGeneration: 0, workspaceGeneration: state.workspaces.get(workspace) ?? 0 };
}

/** False once any generation the ticket was read under has moved. */
export function ticketIsCurrent(ticket) {
	return ticket.epoch === state.epoch
		&& ticket.userGeneration === (state.users.get(ticket.user) ?? 0)
		&& ticket.workspaceGeneration === (state.workspaces.get(ticket.workspace) ?? 0);
}
