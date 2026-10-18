/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cutoff-source.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A scriptable stand-in for PostgREST's auth_session_cutoffs, strict about the query shape the poller
// may send: a request with a parameter outside the keyset-paging contract throws instead of matching.
// Caveat: `user_id` order is plain string order, which equals Postgres' uuid order only for the
// lower-case uuids these tests use.

const ALLOWED = new Set(['select', 'order', 'limit', 'user_id']);

export function uuidAt(index) {
	return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

export function cutoffRow(index, validAfter = '2026-10-19T12:00:00+00:00') {
	return { user_id: uuidAt(index), sessions_valid_after: validAfter };
}

const cutoffResponse = (rows, headers = {}) => new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

/**
 * `maxRows` imitates PostgREST's db-max-rows. `respondWith(fn)` replaces the answer (fn may return a
 * Response or throw); `hold()` makes the next requests wait, answering from the rows as they were
 * when the request arrived, and returns the release function.
 */
export function createCutoffSource(initialRows = [], { maxRows = Infinity } = {}) {
	const source = { rows: initialRows.map((row) => ({ ...row })), calls: [], override: null, gate: null };
	source.respondWith = (answer) => { source.override = answer; };
	source.hold = () => {
		let release;
		source.gate = new Promise((done) => { release = () => { source.gate = null; done(); }; });
		return release;
	};
	source.fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.pathname !== '/rest/v1/auth_session_cutoffs') throw new Error(`cutoff stub: unexpected path ${parsed.pathname}`);
		for (const key of parsed.searchParams.keys()) if (!ALLOWED.has(key)) throw new Error(`cutoff stub: unsupported parameter ${key}`);
		if (parsed.searchParams.get('order') !== 'user_id.asc') throw new Error('cutoff stub: only order=user_id.asc is supported');
		const call = { url: String(url), params: parsed.searchParams, prefer: init.headers?.Prefer, headers: init.headers };
		source.calls.push(call);
		const snapshot = source.rows.map((row) => ({ ...row }));
		if (source.gate) await source.gate;
		if (source.override) return source.override(call);
		const cursor = parsed.searchParams.get('user_id');
		if (cursor && !cursor.startsWith('gt.')) throw new Error(`cutoff stub: unsupported filter ${cursor}`);
		const sorted = snapshot.sort((left, right) => (left.user_id < right.user_id ? -1 : 1));
		const after = cursor ? sorted.filter((row) => row.user_id > cursor.slice(3)) : sorted;
		const page = after.slice(0, Math.min(Number(parsed.searchParams.get('limit') ?? Infinity), maxRows));
		const total = sorted.length;
		const range = page.length === 0 ? `*/${total}` : `0-${page.length - 1}/${total}`;
		return cutoffResponse(page, call.prefer === 'count=exact' ? { 'content-range': range } : {});
	};
	return source;
}

export { cutoffResponse };
