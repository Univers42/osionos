/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   follow-postgrest.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// A PostgREST stand-in for the follow graph: the follows table with the database's own
// block trigger, the blocks, the people directory and a few plain tables. Every request is
// logged so a test can count them (the no-N+1 proof) or show one never happened.
//
// Caveat: only the filters the follow routes emit are understood (eq, in, the two-column
// keyset `or`). Anything else throws, so a new query shape fails loudly instead of
// matching nothing. It models no RLS and no column types.

const reply = (rows, status = 200) => new Response(rows === null ? null : JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
const same = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

export const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };

function unquoteList(expr) {
	return expr.slice(4, -1).split(',').map((item) => item.replace(/^"(.*)"$/, '$1'));
}

function matches(row, params) {
	for (const [key, expr] of params) {
		if (['select', 'order', 'limit', 'on_conflict', 'or'].includes(key)) continue;
		if (expr.startsWith('eq.')) { if (!same(row[key], expr.slice(3))) return false; continue; }
		if (expr.startsWith('in.(')) { if (!unquoteList(expr).some((item) => same(row[key], item))) return false; continue; }
		throw new Error(`follow store: unsupported filter ${key}=${expr}`);
	}
	return true;
}

/** `or=(created_at.lt."T",and(created_at.eq."T",<other>.lt."I"))` → [T, I], or null. */
function keysetCursor(params) {
	const expr = params.get('or');
	if (!expr || !expr.startsWith('(created_at.lt.')) return null;
	const first = /created_at\.lt\."([^"]*)"/.exec(expr);
	const second = /_id\.lt\."([^"]*)"\)\)$/.exec(expr);
	if (!first || !second) throw new Error(`follow store: unsupported or=${expr}`);
	return [first[1], second[1]];
}

function blocksOf(blocks, params) {
	const expr = params.get('or');
	const who = /blocked_id\.eq\.([^,)]+)/.exec(expr)?.[1];
	return blocks.filter((row) => same(row.blocker_id, who) || same(row.blocked_id, who));
}

function listFollows(follows, params) {
	const other = params.has('followee_id') && !params.has('follower_id') ? 'follower_id' : 'followee_id';
	let rows = follows.filter((row) => matches(row, params));
	const cursor = keysetCursor(params);
	if (params.get('order')) {
		rows = [...rows].sort((a, b) => (a.created_at === b.created_at ? String(b[other]).localeCompare(String(a[other])) : String(b.created_at).localeCompare(String(a.created_at))));
	}
	if (cursor) rows = rows.filter((row) => row.created_at < cursor[0] || (row.created_at === cursor[0] && String(row[other]) < cursor[1]));
	return params.has('limit') ? rows.slice(0, Number(params.get('limit'))) : rows;
}

/**
 * world: { users: [{user_id, display_name, profile}], follows: [{follower_id, followee_id,
 * created_at}], blocks: [{blocker_id, blocked_id}], tables: { name: rows[] }, raceBlocked: Set }.
 * `raceBlocked` holds followee ids the TRIGGER refuses while the blocks table still shows
 * nothing: the block that lands between the bridge's check and its insert.
 */
export function createFollowStore(world = {}) {
	const store = {
		users: world.users ?? [],
		follows: [...(world.follows ?? [])],
		blocks: [...(world.blocks ?? [])],
		tables: world.tables ?? {},
		raceBlocked: world.raceBlocked ?? new Set(),
		calls: [],
	};
	const blockedPair = (a, b) => store.blocks.some((row) => (same(row.blocker_id, a) && same(row.blocked_id, b)) || (same(row.blocker_id, b) && same(row.blocked_id, a)));

	function insertFollow(body, prefer) {
		if (store.raceBlocked.has(body.followee_id) || blockedPair(body.follower_id, body.followee_id)) {
			return reply({ code: '23514', details: null, hint: null, message: 'follow_blocked' }, 400);
		}
		const existing = store.follows.some((row) => same(row.follower_id, body.follower_id) && same(row.followee_id, body.followee_id));
		if (existing && !prefer.includes('ignore-duplicates')) return reply({ code: '23505', message: 'duplicate key' }, 409);
		if (!existing) store.follows.push({ created_at: new Date().toISOString(), ...body });
		return new Response(null, { status: 201 });
	}

	function counts(body) {
		return [{
			follower_count: store.follows.filter((row) => same(row.followee_id, body.p_user)).length,
			following_count: store.follows.filter((row) => same(row.follower_id, body.p_user)).length,
			viewer_follows: store.follows.some((row) => same(row.follower_id, body.p_viewer) && same(row.followee_id, body.p_user)),
		}];
	}

	store.fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const name = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const body = init.body ? JSON.parse(init.body) : undefined;
		const prefer = String(init.headers?.Prefer ?? '');
		store.calls.push({ method, name, params: parsed.searchParams, body });
		if (name === 'rpc/osionos_follow_counts') return reply(counts(body));
		if (name === 'osionos_follows') {
			if (method === 'POST') return insertFollow(body, prefer);
			if (method === 'DELETE') {
				store.follows = store.follows.filter((row) => !matches(row, parsed.searchParams));
				return new Response(null, { status: 204 });
			}
			return reply(listFollows(store.follows, parsed.searchParams));
		}
		if (name === 'osionos_user_blocks') return reply(blocksOf(store.blocks, parsed.searchParams));
		if (name === 'osionos_people_directory') return reply(store.users.filter((row) => matches(row, parsed.searchParams)));
		const rows = store.tables[name] ?? [];
		if (method === 'GET') return reply(rows.filter((row) => matches(row, parsed.searchParams)).slice(0, Number(parsed.searchParams.get('limit') ?? 1000)));
		if (method === 'POST') { rows.push(body); store.tables[name] = rows; return new Response(null, { status: 201 }); }
		return new Response(null, { status: 204 });
	};
	store.callsTo = (name, method) => store.calls.filter((call) => call.name === name && (!method || call.method === method));
	return store;
}
