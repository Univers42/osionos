/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-follows.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



/**
 * The follow graph of `/api/social/*`: follow, unfollow, the counts, and the two lists.
 *
 * A follow is asymmetric and idempotent. The database trigger on `osionos_follows` is the
 * authority on blocks (it refuses in both directions with SQLSTATE 23514 `follow_blocked`);
 * the bridge checks first only to answer without a write, and maps the trigger's refusal
 * to the same 403 when a block lands between the check and the insert.
 *
 * A list costs four requests at most, whatever its size: the page of edges, the blocks,
 * the identities of the page and the viewer's own follows among it.
 *
 * Caveat: a block thins a page after it is cut, so a page can hold fewer than `limit`
 * people while `nextCursor` still points on; clients page until the cursor is null.
 */

import {
	UUID_REGEX,
	blockedViewerBy,
	httpError,
	identitySummaries,
	readJsonBody,
	requireUuid,
	rest,
	sendJson,
} from './bridge-social-core.mjs';
import { hiddenAmong, hiddenFrom } from './bridge-hidden-from.mjs';
import { decodeCursor, inFilter, keyset, pageOf } from './bridge-paging.mjs';
import { onlineAmong } from './bridge-presence.mjs';

const LIST_MAX = 50;
const ID_PATH = '([^/]+)';
const FOLLOW_DELETE = new RegExp(`^/api/social/follow/${ID_PATH}$`, 'i');
const COUNTS = new RegExp(`^/api/social/follow-counts/${ID_PATH}$`, 'i');
const LISTS = new RegExp(`^/api/social/(followers|following)/${ID_PATH}$`, 'i');
// The edge column that names the person listed, and the one that names the list's owner.
const LIST_COLUMNS = { followers: ['follower_id', 'followee_id'], following: ['followee_id', 'follower_id'] };

const followBlocked = () => Object.assign(httpError('You cannot follow this person.', 403), { code: 'follow_blocked' });

async function follow(deps, session, request, response, config) {
	const followeeId = requireUuid((await readJsonBody(request)).followeeId, 'followeeId').toLowerCase();
	if (followeeId === session.userId) throw httpError('You cannot follow yourself.', 422);
	const known = await rest(config, deps.fetchImpl, `osionos_people_directory?user_id=eq.${followeeId}&select=user_id&limit=1`);
	if (!Array.isArray(known) || known.length === 0) throw httpError('User not found.', 404);
	if ((await blockedViewerBy(config, deps.fetchImpl, session.userId)).has(followeeId)) throw followBlocked();
	try {
		await rest(config, deps.fetchImpl, 'osionos_follows?on_conflict=follower_id,followee_id', {
			method: 'POST',
			body: { follower_id: session.userId, followee_id: followeeId },
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	} catch (error) {
		if (/follow_blocked/.test(error?.message ?? '')) throw followBlocked();
		throw error;
	}
	return sendJson(response, 200, { ok: true, following: true }, config);
}

async function unfollow(deps, session, followeeId, response, config) {
	await rest(config, deps.fetchImpl, `osionos_follows?follower_id=eq.${session.userId}&followee_id=eq.${followeeId.toLowerCase()}`, {
		method: 'DELETE',
		prefer: 'return=minimal',
	});
	return sendJson(response, 200, { ok: true, following: false }, config);
}

const countsBody = (row) => ({
	ok: true,
	followerCount: Number(row.follower_count ?? 0),
	followingCount: Number(row.following_count ?? 0),
	viewerFollows: row.viewer_follows === true,
});

// A hidden subject answers through the same body builder as an id nobody holds (no row at all),
// so the two cannot differ by a byte.
async function counts(deps, session, userId, response, config) {
	if (await hiddenFrom(config, deps.fetchImpl, userId, session.userId)) return sendJson(response, 200, countsBody({}), config);
	const answer = await rest(config, deps.fetchImpl, 'rpc/osionos_follow_counts', {
		method: 'POST',
		body: { p_user: userId.toLowerCase(), p_viewer: session.userId },
	});
	return sendJson(response, 200, countsBody((Array.isArray(answer) ? answer[0] : answer) ?? {}), config);
}

async function viewerFollowsAmong(deps, session, ids, config) {
	if (ids.length === 0) return new Set();
	const rows = await rest(config, deps.fetchImpl, `osionos_follows?follower_id=eq.${session.userId}&${inFilter('followee_id', ids)}&select=followee_id`);
	return new Set((Array.isArray(rows) ? rows : []).map((row) => row.followee_id));
}

async function readEdges(deps, kind, ownerId, url, config) {
	const [listed, owner] = LIST_COLUMNS[kind];
	const rawCursor = url.searchParams.get('cursor');
	const order = [['created_at', 'desc'], [listed, 'desc']];
	const { query, take } = keyset({
		order,
		cursor: rawCursor ? decodeCursor(rawCursor, 2) : null,
		limit: url.searchParams.get('limit'),
		maxLimit: LIST_MAX,
	});
	const rows = await rest(config, deps.fetchImpl, `osionos_follows?${owner}=eq.${ownerId}&select=${listed},created_at&${query}`);
	return pageOf(Array.isArray(rows) ? rows : [], order, take);
}

async function describePeople(deps, session, ids, config) {
	const [people, followed] = await Promise.all([
		identitySummaries(config, deps.fetchImpl, ids),
		viewerFollowsAmong(deps, session, ids, config),
	]);
	const online = await onlineAmong(deps.kv, ids, { now: deps.now(), viewerId: session.userId });
	return ids.map((id) => ({
		id,
		name: people.get(id)?.name ?? 'Member',
		avatar: people.get(id)?.avatar ?? null,
		headline: people.get(id)?.headline ?? null,
		online: online.has(id),
		following: followed.has(id),
	}));
}

// A hidden owner answers like an owner with no edges. The page is read before the owner is
// judged so the rule costs one lookup for the owner and everyone listed, not two.
// Caveat: followerCount/followingCount (the counts route) include the edges of people
// dropped here, so a count can exceed the rows a viewer can ever page through; it never
// falls below them.
async function list(deps, session, kind, ownerId, url, response, config) {
	const owned = ownerId.toLowerCase();
	const page = await readEdges(deps, kind, owned, url, config);
	const listedIds = page.items.map((row) => row[LIST_COLUMNS[kind][0]]);
	const hidden = await hiddenAmong(config, deps.fetchImpl, session.userId, [owned, ...listedIds]);
	if (hidden.has(owned)) return sendJson(response, 200, { ok: true, items: [], nextCursor: null }, config);
	const ids = listedIds.filter((id) => !hidden.has(String(id).toLowerCase()));
	return sendJson(response, 200, { ok: true, items: await describePeople(deps, session, ids, config), nextCursor: page.nextCursor }, config);
}

/** Answers true when the path is a follow route and false when it is not. */
export async function handleFollowRoute(deps, session, request, url, response, config) {
	const method = (request.method || 'GET').toUpperCase();
	const path = url.pathname;
	if (path === '/api/social/follow' && method === 'POST') return await follow(deps, session, request, response, config);
	// A path whose id is not a UUID is no route of this module: it falls through to the 404.
	const removal = FOLLOW_DELETE.exec(path);
	if (removal && UUID_REGEX.test(removal[1]) && method === 'DELETE') return await unfollow(deps, session, removal[1], response, config);
	const total = COUNTS.exec(path);
	if (total && UUID_REGEX.test(total[1]) && method === 'GET') return await counts(deps, session, total[1], response, config);
	const listing = LISTS.exec(path);
	if (listing && UUID_REGEX.test(listing[2]) && method === 'GET') return await list(deps, session, listing[1].toLowerCase(), listing[2], url, response, config);
	return false;
}
