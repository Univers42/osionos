/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-admin-rights.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the identity flag implies, written at sign-in and refresh: the admin-workspace membership
 * (its template pages ride the token) and the `user_roles` admin grant the users console re-reads
 * (osionos#296). Both writes are best-effort and never fail a sign-in or a refresh.
 *
 * Each write is followed by a re-read of the flag (osionos#343, D343-10). A sign-in or refresh
 * reads the flag, then writes over two or more calls; a demotion that clears the flag and deletes
 * the rows in between would see its delete undone by the late upsert, and a surviving grant is a
 * durable admin. The demotion clears the flag BEFORE it deletes, so a write that lands after the
 * delete is followed by a re-read that sees false: the writer deletes its own row and answers
 * "not admin" for the token being minted. An env-listed sign-in skips the re-read: it is admin by
 * the address whatever the row says (resolveAdminFlag), and the demotion refuses such a target.
 *
 * `deps.rest(path, options)` is a service-role PostgREST call.
 *
 * Caveat: a re-read that fails twice keeps the row and warns: a flaky link must not strip a real
 * admin. The retry adds up to one more fetch timeout to a sign-in or refresh on a dead link.
 * A demotion racing that sign-in can then leave a grant behind; its read-back answers 503
 * demote_incomplete when it sees it, and a row written after the read-back stays until a re-run.
 * Caveat: an undo delete that fails also leaves the row (warned); the token is still minted
 * without admin, because the flag read false.
 */

import { bumpAccessAfter } from './bridge-access-generation.mjs';

/** The dedicated admin workspace (seeded by osionos-admin-migration.sql). */
export const ADMIN_WORKSPACE_ID = '0a4d1c2e-0000-4000-8000-000000000ad1';

const warn = (message) => console.warn(`[osionos-bridge] admin rights: ${message}`);

/** The account's flag on either key a demotion clears: a row keyed by user_id or by subject. */
export function flaggedRowsQuery(userId) {
	return `osionos_bridge_identities?or=(user_id.eq.${userId},subject.eq.${userId})&is_admin=eq.true&select=is_admin,user_id`;
}

/** The id of a platform role by name (`client.get(path)` is a PostgREST read); null when the seeded row is missing. */
export async function readRoleId(client, name) {
	const rows = await client.get(`roles?name=eq.${name}&select=id&limit=1`);
	return Array.isArray(rows) ? rows[0]?.id ?? null : null;
}

/** Every `user_roles` row of one user for one role, expired ones included. */
export const grantRows = (userId, roleId) => `user_roles?user_id=eq.${userId}&role_id=eq.${roleId}`;

export const adminMembershipRows = (userId) => `osionos_workspace_members?workspace_id=eq.${ADMIN_WORKSPACE_ID}&user_id=eq.${userId}`;

/** `del(path)` is the caller's service-role DELETE; the bump follows it whatever it settles as. */
export function deleteAdminMembership(del, userId) {
	return bumpAccessAfter(del(adminMembershipRows(userId)), { workspaceId: ADMIN_WORKSPACE_ID, userId });
}

const restDelete = (rest) => (path) => rest(path, { method: 'DELETE', prefer: 'return=minimal' });

async function writeMembership(userId, { rest }) {
	const scope = { workspaceId: ADMIN_WORKSPACE_ID, userId };
	try {
		await bumpAccessAfter(rest('osionos_workspace_members', {
			method: 'POST',
			body: { workspace_id: ADMIN_WORKSPACE_ID, user_id: userId, role: 'admin', permissions: ['read', 'update', 'admin'] },
			prefer: 'resolution=merge-duplicates,return=minimal',
		}), scope);
	} catch {
		warn('writing the admin-workspace membership failed');
	}
	// A write that timed out may still have landed: the undo is owed either way.
	return () => deleteAdminMembership(restDelete(rest), userId);
}

async function writeGrant(userId, { rest }) {
	let roleId = null;
	try {
		roleId = await readRoleId({ get: rest }, 'admin');
		if (!roleId) return null;
		// `expires_at: null` renews an expired grant.
		await rest('user_roles?on_conflict=user_id,role_id', {
			method: 'POST',
			body: { user_id: userId, role_id: roleId, expires_at: null },
			prefer: 'resolution=merge-duplicates,return=minimal',
		});
	} catch {
		warn('writing the admin grant failed');
		if (!roleId) return null;
	}
	return () => restDelete(rest)(grantRows(userId, roleId));
}

/**
 * False only when the flag reads cleared. A failed read is tried once more at once: a cold link's
 * first call is the one that fails, and each kept row is a grant a racing demotion has to find.
 * Two failures are "still admin" (see the header Caveat).
 */
async function flagHolds(userId, { rest }) {
	const read = () => rest(flaggedRowsQuery(userId));
	let rows;
	try {
		rows = await read().catch(read);
	} catch {
		warn('admin_flag_recheck_failed: the flag re-read after the write failed twice; the row is kept');
		return true;
	}
	return Array.isArray(rows) && rows.some((row) => row?.is_admin === true);
}

async function undoAll(undos) {
	for (const undo of undos) {
		try {
			await undo();
		} catch {
			warn('deleting a row written for a cleared flag failed; the row is left');
		}
	}
}

/**
 * Runs the writes, then re-reads the flag. True: the account is still admin for the token being
 * minted. False: the flag was cleared meanwhile and the rows the writes left are deleted.
 * `deps` null means this bridge has no service role: nothing is written and the claim stands.
 */
async function ensureWith(userId, deps, writers) {
	if (!deps) return true;
	const undos = [];
	for (const write of writers) {
		const undo = await write(userId, deps);
		if (undo) undos.push(undo);
	}
	if (deps.envListed === true || await flagHolds(userId, deps)) return true;
	await undoAll(undos);
	return false;
}

/** Sign-in: the membership, then the grant. */
export function ensureAdminRights(userId, deps) {
	return ensureWith(userId, deps, [writeMembership, writeGrant]);
}

/** Refresh: the grant only (osionos#296); the membership is the sign-in's. */
export function ensureAdminRoleGrant(userId, deps) {
	return ensureWith(userId, deps, [writeGrant]);
}
