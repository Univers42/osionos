/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-sources.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The six self sources: the caller's own rows, as the read-only databases a `sys:` block
 * shows. This file is the ONE place that knows a source's table, its scope and its
 * columns — the route reads them here and never names a table or a column itself.
 *
 * `columns` is the ordered allowlist: the PostgREST select is built from it and the
 * answer's rows carry exactly these keys. `select=*` is forbidden — a column added to a
 * table later would leak into a dashboard cell the day the bridge was redeployed.
 *
 * `scope` says how the rows are narrowed:
 *   owner      a service-role read, scoped by `<column>=eq.<uid>` in the path;
 *   edge       a service-role read, scoped by `or=(<a>.eq.<uid>,<b>.eq.<uid>)`;
 *   membership a service-role read of the membership table — the membership is the
 *              authority for "my workspaces", the owned rows are only a lookup;
 *   account    an account-role read: the row-level security of the table is the scope.
 *
 * `computed` names the keys a mapper adds on top of the allowlist. They are computed from
 * the row and the verified session, never read from the table.
 *
 * Caveat: the six sources are the caller's own rows and the caller is their only reader.
 * The cap of 200 rows is a row count, not a page: the rest of a large collection is not
 * reachable from a source.
 */

// The readable title of a session row: the method and the creation time.
// Caveat: the stamp is in the BRIDGE's time zone, not the reader's: a person in another
// zone reads a time that is not theirs.
const AUTH_LABELS = {
	password: 'Password',
	email_otp: 'Email code',
	passkey: 'Passkey',
	oauth: 'OAuth',
	handoff: 'Handoff',
	refresh: 'Refresh',
};

function sessionLabel(row) {
	const method = AUTH_LABELS[row?.auth_method] ?? 'Session';
	const stamp = new Date(row?.created_at ?? '');
	if (!Number.isFinite(stamp.getTime())) return method;
	const when = stamp.toLocaleString('en-GB', {
		day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
	});
	return `${method} · ${when}`;
}

/** The session the caller is holding is the current one: its id is the token's jti. */
function sessionCurrent(row, { session }) {
	return String(row?.id ?? '').toLowerCase() === String(session?.raw?.jti ?? '').toLowerCase();
}

/** The other party of an edge: the addressee when the caller asked, the requester otherwise. */
export function connectionPeerId(row, userId) {
	const self = String(userId ?? '').toLowerCase();
	return String(row?.requester_id ?? '').toLowerCase() === self ? row?.addressee_id : row?.requester_id;
}

function connectionDirection(row, { userId }) {
	return String(row?.requester_id ?? '').toLowerCase() === String(userId ?? '').toLowerCase() ? 'outgoing' : 'incoming';
}

/**
 * The card of a peer: the public one, or the reduced one — a peer who left the directory
 * or who blocked the caller. The reduced card is exactly the shape the profile route
 * answers for such a subject: three keys, never a username, never a headline.
 */
export function peerCard(userId, directoryRow, hidden) {
	const id = String(userId ?? '').toLowerCase();
	const name = directoryRow?.display_name ?? null;
	const avatar = typeof directoryRow?.profile?.avatar === 'string' ? directoryRow.profile.avatar : null;
	if (!directoryRow || directoryRow.directory_opt_out === true || hidden.has(id)) {
		return { userId: id, name, avatar };
	}
	return {
		userId: id,
		name,
		username: directoryRow.username ?? null,
		headline: directoryRow.headline || null, // directory view (root-integration/models/...people-directory) has a headline column, so no profile JSONB fallback
		avatar,
		lastSeenAt: directoryRow.last_seen_at ?? null,
	};
}

/** Milliseconds of a row's created_at, for ordering; missing values sort last. */
function connectionCreatedAtMs(row) {
	const ms = Date.parse(row?.created_at);
	return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** One row per person: collapse bidirectional edges between the same peer, keeping the most recent edge's status and date. */
export function dedupeEdgesByPeer(rows, userId) {
	const input = Array.isArray(rows) ? rows : [];
	const kept = [];
	const indexByPeer = new Map();
	for (const row of input) {
		const peer = String(connectionPeerId(row, userId) ?? '').toLowerCase();
		if (peer === '') continue;
		const existing = indexByPeer.get(peer);
		if (existing === undefined) {
			indexByPeer.set(peer, kept.length);
			kept.push(row);
		} else if (connectionCreatedAtMs(row) > connectionCreatedAtMs(kept[existing])) {
			kept[existing] = row;
		}
	}
	return kept.sort((left, right) => connectionCreatedAtMs(right) - connectionCreatedAtMs(left));
}

// Aliases: the same collapse under the names a caller might reach for.
export const dedupeConnectionsByPeer = dedupeEdgesByPeer;
export const dedupeConnectionEdges = dedupeEdgesByPeer;
export const dedupeEdges = dedupeEdgesByPeer;
export const dedupeBidirectionalEdges = dedupeEdgesByPeer;
export const oneRowPerPerson = dedupeEdgesByPeer;

export const SELF_SOURCES = [
	{
		id: 'my-pages',
		label: 'My pages',
		table: 'osionos_pages',
		scope: { kind: 'owner', column: 'owner_id' },
		order: 'updated_at.desc',
		columns: [
			'id', 'title', 'icon', 'cover', 'surface', 'visibility', 'database_id', 'parent_page_id',
			'created_at', 'updated_at', 'archived_at',
		],
	},
	{
		id: 'my-tasks',
		label: 'My tasks',
		table: 'osionos_tasks',
		scope: { kind: 'owner', column: 'owner_id' },
		order: 'updated_at.desc',
		columns: ['page_id', 'block_id', 'workspace_id', 'content', 'checked', 'due_at', 'updated_at'],
	},
	{
		id: 'my-published',
		label: 'Published pages',
		table: 'osionos_published_pages',
		scope: { kind: 'account' },
		order: 'published_at.desc',
		columns: ['token', 'page_id', 'title', 'icon', 'published_at'],
	},
	{
		id: 'my-connections',
		label: 'Connections',
		table: 'osionos_connections',
		scope: { kind: 'edge', columns: ['requester_id', 'addressee_id'] },
		order: 'created_at.desc',
		columns: ['id', 'requester_id', 'addressee_id', 'status', 'source', 'created_at', 'responded_at'],
		computed: {
			direction: connectionDirection,
			peer: (row, context) => context.peerOf(row),
		},
		related: {
			table: 'osionos_people_directory',
			columns: ['user_id', 'display_name', 'username', 'profile', 'last_seen_at', 'directory_opt_out', 'headline'],
			idColumn: 'user_id',
			chunk: 50,
		},
	},
	{
		id: 'my-workspaces',
		label: 'My workspaces',
		table: 'osionos_workspace_members',
		scope: { kind: 'membership', column: 'user_id' },
		order: 'created_at.desc',
		columns: ['workspace_id', 'role', 'permissions', 'id', 'name', 'slug', 'created_at', 'updated_at'],
		readColumns: ['workspace_id', 'role', 'permissions'],
		related: {
			table: 'osionos_workspaces',
			columns: ['id', 'name', 'slug', 'created_at', 'updated_at'],
			idColumn: 'id',
			ownerColumn: 'owner_id',
			chunk: 50,
		},
	},
	{
		id: 'my-sessions',
		label: 'My sessions',
		table: 'osionos_sessions',
		scope: { kind: 'account' },
		order: 'created_at.desc',
		columns: ['id', 'created_at', 'expires_at', 'last_seen_at', 'auth_method', 'user_agent'],
		computed: { current: sessionCurrent, label: sessionLabel },
		filters: [
			{ column: 'revoked_at', op: 'is.null' },
			{ column: 'expires_at', op: 'gt.now' },
		],
	},
];

/** The source of an id, or null: the id is never taken from the request as anything else. */
export function selfSourceById(id) {
	if (typeof id !== 'string') return null;
	return SELF_SOURCES.find((source) => source.id === id) ?? null;
}
