/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-request-store.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Storage for page access requests (public.osionos_page_access_requests): the rows the
 * routes in bridge-page-access-requests.mjs read and write. Every call takes the
 * per-request bridge config; nothing is cached across requests.
 *
 * The table's partial unique index is (page_id, requester_id) WHERE status='pending', so a
 * duplicate insert is a 409/23505 upstream. insertRequest reports that as null ("already
 * pending, drop it") and rethrows every other failure: a silent drop of a broken write
 * would tell the requester their request exists when it does not.
 */

import { isUniqueViolation, rest } from './bridge-social-core.mjs';
import { idChunks, inFilter } from './bridge-paging.mjs';
import { sameId } from './bridge-page-read.mjs';

export const REQUEST_TABLE = 'osionos_page_access_requests';
export const REQUEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const REQUEST_SELECT = 'id,workspace_id,page_id,requester_id,note,status,decided_by,decided_at,created_at';
const PAGE_SELECT = 'id,workspace_id,owner_id,visibility,collaborators,title';
const PAGE_IDS_LIMIT = 500;

/** The page row the access decision needs, or null. */
export async function pageRow(config, fetchImpl, pageId) {
	const rows = await rest(config, fetchImpl, `osionos_pages?id=eq.${encodeURIComponent(pageId)}&select=${PAGE_SELECT}&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The caller's LIVE membership row, never the workspace ids frozen into the token. */
export async function memberRow(config, fetchImpl, userId, workspaceId) {
	const rows = await rest(config, fetchImpl, `osionos_workspace_members?user_id=eq.${encodeURIComponent(userId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&select=user_id,role,permissions&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** A page owner still holds the page as the workspace owner does, with no member row of their own. */
export async function ownerMemberRow(config, fetchImpl, userId, workspaceId) {
	const member = await memberRow(config, fetchImpl, userId, workspaceId);
	if (member) return member;
	const rows = await rest(config, fetchImpl, `osionos_workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=owner_id&limit=1`);
	const owner = Array.isArray(rows) ? rows[0]?.owner_id : null;
	return sameId(owner, userId) ? { user_id: userId, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] } : null;
}

/** One request row by id, whatever its status. */
export async function requestRow(config, fetchImpl, requestId) {
	const rows = await rest(config, fetchImpl, `${REQUEST_TABLE}?id=eq.${encodeURIComponent(requestId)}&select=${REQUEST_SELECT}&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** A page's requests for pages the owner holds, pending and not older than the window. */
export async function pendingForPages(config, fetchImpl, pageIds, cutoff, limit) {
	const requests = [];
	for (const chunk of idChunks(pageIds)) {
		const rows = await rest(
			config,
			fetchImpl,
			`${REQUEST_TABLE}?${inFilter('page_id', chunk)}&status=eq.pending&created_at=gte.${encodeURIComponent(cutoff)}&select=${REQUEST_SELECT}&order=created_at.asc&limit=${limit}`,
		);
		if (Array.isArray(rows)) requests.push(...rows);
	}
	return requests
		.sort((left, right) => String(left.created_at ?? '').localeCompare(String(right.created_at ?? '')))
		.slice(0, limit);
}

/** The pages this caller owns in one workspace (a bounded read; see the list route's Caveat). */
export async function ownerPages(config, fetchImpl, userId, workspaceId) {
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_pages?workspace_id=eq.${encodeURIComponent(workspaceId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id,workspace_id,owner_id,visibility,collaborators,title&limit=${PAGE_IDS_LIMIT}`,
	);
	return Array.isArray(rows) ? rows : [];
}

/** How many pending requests this requester already has in this workspace (the silent cap). */
export async function pendingCount(config, fetchImpl, requesterId, workspaceId) {
	const rows = await rest(
		config,
		fetchImpl,
		`${REQUEST_TABLE}?requester_id=eq.${encodeURIComponent(requesterId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.pending&select=id&limit=10`,
	);
	return Array.isArray(rows) ? rows.length : 0;
}

/**
 * N15: expire stale pending rows before the insert. The first patch clears this exact
 * page+requester slot (the partial unique index's key); the second clears the rest of the
 * requester's pending set so a stale row cannot hold a slot elsewhere either.
 */
export async function expireStale(config, fetchImpl, requesterId, pageId, cutoff) {
	const stale = `status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}`;
	await rest(config, fetchImpl, `${REQUEST_TABLE}?page_id=eq.${encodeURIComponent(pageId)}&requester_id=eq.${encodeURIComponent(requesterId)}&${stale}`, {
		method: 'PATCH', body: { status: 'expired' }, prefer: 'return=minimal',
	});
	await rest(config, fetchImpl, `${REQUEST_TABLE}?requester_id=eq.${encodeURIComponent(requesterId)}&${stale}`, {
		method: 'PATCH', body: { status: 'expired' }, prefer: 'return=minimal',
	});
}

/** Insert one pending request; null when the partial unique index already holds the slot. */
export async function insertRequest(config, fetchImpl, row) {
	try {
		const saved = await rest(config, fetchImpl, REQUEST_TABLE, {
			method: 'POST', body: row, prefer: 'return=representation',
		});
		return Array.isArray(saved) ? saved[0] ?? null : null;
	} catch (error) {
		if (isUniqueViolation(error)) return null;
		throw error;
	}
}

/** The filtered PATCH N6 uses: only a still-pending, still-fresh row may be decided. */
export async function decidePending(config, fetchImpl, requestId, cutoff, patch) {
	const rows = await rest(
		config,
		fetchImpl,
		`${REQUEST_TABLE}?id=eq.${encodeURIComponent(requestId)}&status=eq.pending&created_at=gte.${encodeURIComponent(cutoff)}&select=${REQUEST_SELECT}`,
		{ method: 'PATCH', body: patch, prefer: 'return=representation' },
	);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** Put the row back when the grant it announced could not be written. */
export async function restorePending(config, fetchImpl, requestId) {
	await rest(config, fetchImpl, `${REQUEST_TABLE}?id=eq.${encodeURIComponent(requestId)}&status=eq.approved`, {
		method: 'PATCH', body: { status: 'pending', decided_by: null, decided_at: null }, prefer: 'return=minimal',
	});
}

/** One notification row; the caller decides what it may safely carry (N10). */
export async function insertNotification(config, fetchImpl, notification) {
	await rest(config, fetchImpl, 'osionos_notifications', {
		method: 'POST', body: notification, prefer: 'return=minimal',
	});
}
