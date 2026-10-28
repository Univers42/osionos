/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-whiteboard-store.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The whiteboard's storage: grobase mongo-api, through Kong, as the user (storageHeaders).
 *
 * mongo-api isolates by owner from the token's `sub`, so a user only ever reads and writes
 * their own boards; this module adds what it does not know: the two collection names, fixed
 * here and never read from a request (C604), filters built with JSON.stringify (C605), and the
 * board's `rev` as the compare-and-swap of every scene write (`if_field=rev`, C611).
 *
 * A board is one document in hydrawn_boards; its scene is kept as the JSON text the client
 * sent, so no key inside a drawing ever reaches Mongo as a field name. Its picture is a
 * second document in hydrawn_thumbnails, made with the board, so the list never carries it.
 */

import { httpError } from './bridge-social-core.mjs';
import { readBaasJson } from './bridge-baas-body.mjs';
import { storageHeaders } from './bridge-storage-core.mjs';

export const BOARDS = 'hydrawn_boards';
export const THUMBNAILS = 'hydrawn_thumbnails';
const SUMMARY_FIELDS = 'slug,title,element_count,entry_count,bounds,rev,thumbnail_at,created_at,updated_at';
// Caveat: sized for an 8 MB scene over the Funnel hop to b2b, not measured on it; a slower
// link times a large save out (502) and the autosaver retries it.
const MONGO_TIMEOUT_MS = 30_000;

export function mongoBase(env = process.env) {
	const kong = `${String(env.OSIONOS_BAAS_URL ?? env.PUBLIC_BAAS_URL ?? 'http://localhost:8000').replace(/\/$/, '')}/mongo/v1`;
	return (env.OSIONOS_MONGO_API_URL ?? kong).replace(/\/$/, '');
}

// mongo-api's 409 is the CAS refusal, its 413 the body limit, its 404 an absent document; any
// other failure is ours to report, never the user's to fix.
function statusFor(upstream) {
	if (upstream === 409 || upstream === 413 || upstream === 404) return upstream;
	return 502;
}

/** One mongo-api call as `userId`; `path` starts at the collection name. */
async function call(deps, userId, path, { method = 'GET', query = {}, body } = {}) {
	const url = new URL(`${deps.base}/collections/${path}`);
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
	const headers = storageHeaders(userId, deps.env, { accept: 'application/json' });
	if (body !== undefined) headers['content-type'] = 'application/json';
	const response = await deps.fetchImpl(url, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(MONGO_TIMEOUT_MS),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw httpError(`Whiteboard storage answered ${response.status}: ${text.slice(0, 160)}`, statusFor(response.status));
	}
	return readBaasJson(response, { service: 'mongo-api', empty: null, fail: (message) => httpError(message, 502) });
}

const liveFilter = (extra = {}) => JSON.stringify({ ...extra, deleted_at: null });

export function createWhiteboardStore({ fetchImpl = fetch, env = process.env } = {}) {
	const deps = { fetchImpl, env, base: mongoBase(env) };
	const documents = (collection, id = '') => `${collection}/documents${id ? `/${encodeURIComponent(id)}` : ''}`;

	async function findOne(userId, collection, filter, fields) {
		const query = { filter, limit: 1 };
		if (fields) query.fields = fields;
		const page = await call(deps, userId, documents(collection), { query });
		return page?.data?.[0] ?? null;
	}

	return {
		/** A page of the user's live boards, newest edit first, without their scenes. */
		async list(userId, { limit, offset }) {
			const page = await call(deps, userId, documents(BOARDS), {
				query: { filter: liveFilter(), sort: 'updated_at:desc', limit, offset, fields: SUMMARY_FIELDS },
			});
			return { rows: page?.data ?? [], total: Number(page?.meta?.total ?? 0) };
		},

		async countLive(userId) {
			const page = await call(deps, userId, documents(BOARDS), { query: { filter: liveFilter(), limit: 1, fields: 'slug' } });
			return Number(page?.meta?.total ?? 0);
		},

		/** The live board `slug`, with its scene text when `withScene`; null when there is none. */
		findBoard(userId, slug, { withScene = false } = {}) {
			return findOne(userId, BOARDS, liveFilter({ slug }), withScene ? `${SUMMARY_FIELDS},scene` : SUMMARY_FIELDS);
		},

		async createBoard(userId, board) {
			const created = await call(deps, userId, documents(BOARDS), { method: 'POST', body: { data: { ...board, deleted_at: null } } });
			await this.createThumbnail(userId, board.slug, null);
			return created;
		},

		createThumbnail(userId, slug, png) {
			return call(deps, userId, documents(THUMBNAILS), { method: 'POST', body: { data: { slug, png } } });
		},

		/** Writes `patch` only while the board is still at `rev`; 409 when it moved on. */
		patchBoardAt(userId, id, rev, patch) {
			const query = { if_field: 'rev', if_value: rev, fields: SUMMARY_FIELDS };
			return call(deps, userId, documents(BOARDS, id), { method: 'PATCH', query, body: { patch } });
		},

		patchBoard(userId, id, patch) {
			return call(deps, userId, documents(BOARDS, id), { method: 'PATCH', query: { fields: SUMMARY_FIELDS }, body: { patch } });
		},

		findThumbnail(userId, slug) {
			return findOne(userId, THUMBNAILS, JSON.stringify({ slug }), 'slug,png');
		},

		patchThumbnail(userId, id, png) {
			return call(deps, userId, documents(THUMBNAILS, id), { method: 'PATCH', query: { fields: 'slug' }, body: { patch: { png } } });
		},
	};
}
