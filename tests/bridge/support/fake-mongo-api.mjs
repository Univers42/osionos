/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fake-mongo-api.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// grobase mongo-api in memory, as the whiteboard store calls it: owner-isolated documents,
// equality filters (null matches a missing field), `sort=field:dir`, limit/offset, and the
// additive grobase surface the whiteboard needs: `fields=` projection and the
// `if_field`/`if_value` compare-and-swap on PATCH (409 when the field moved).
// Ponytail: the owner comes from x-user-id, never from the bearer JWT Kong would verify;
// timestamps tick by 1 ms per write, so updated_at order is the write order.
// `latencyMs` delays every answer, so concurrent requests' reads overlap their writes.

import { randomBytes } from 'node:crypto';

export const MONGO_URL = 'http://mongo.local';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

export function createFakeMongoApi({ latencyMs = 0 } = {}) {
	const collections = new Map();
	const calls = [];
	let tick = Date.parse('2026-10-28T00:00:00.000Z');
	const stamp = () => new Date(tick++).toISOString();
	const docs = (name) => collections.get(name) ?? collections.set(name, []).get(name);
	const project = (doc, fields) => {
		if (!fields) return structuredClone(doc);
		const out = { id: doc.id };
		for (const field of fields.split(',')) if (field in doc) out[field] = structuredClone(doc[field]);
		return out;
	};

	function list(rows, query) {
		const filter = JSON.parse(query.get('filter') ?? '{}');
		let found = rows.filter((doc) => Object.entries(filter).every(([key, value]) => (doc[key] ?? null) === value));
		const [field, direction] = String(query.get('sort') ?? 'created_at:desc').split(':');
		found = [...found].sort((a, b) => (direction === 'asc' ? 1 : -1) * String(a[field]).localeCompare(String(b[field])));
		const limit = Number(query.get('limit') ?? 20);
		const offset = Number(query.get('offset') ?? 0);
		const page = found.slice(offset, offset + limit).map((doc) => project(doc, query.get('fields')));
		return json({ data: page, meta: { total: found.length, limit, offset } });
	}

	function patch(rows, id, query, body) {
		const doc = rows.find((row) => row.id === id);
		if (!doc) return json({ message: 'Document not found' }, 404);
		const field = query.get('if_field');
		if (field && String(doc[field]) !== query.get('if_value')) return json({ message: 'Precondition failed' }, 409);
		Object.assign(doc, body.patch, { updated_at: stamp() });
		return json(project(doc, query.get('fields')));
	}

	async function fetchImpl(url, init = {}) {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		const owner = init.headers?.['x-user-id'];
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ method, path: parsed.pathname, query: parsed.search, bytes: init.body?.length ?? 0 });
		if (latencyMs) await new Promise((done) => setTimeout(done, latencyMs));
		const [, prefix, name, segment, id] = parsed.pathname.split('/');
		if (prefix !== 'collections' || segment !== 'documents' || !owner) return json({ message: 'not found' }, 404);
		const all = docs(name);
		const mine = all.filter((doc) => doc.owner_id === owner);
		if (method === 'GET' && !id) return list(mine, parsed.searchParams);
		if (method === 'POST' && !id) {
			const now = stamp();
			const doc = { ...body.data, id: randomBytes(12).toString('hex'), owner_id: owner, created_at: now, updated_at: now };
			all.push(doc);
			return json(structuredClone(doc), 201);
		}
		if (method === 'PATCH' && id) return patch(mine, id, parsed.searchParams, body);
		return json({ message: 'unsupported' }, 405);
	}

	return { fetchImpl, calls, docs, seed: (name, doc) => docs(name).push({ id: randomBytes(12).toString('hex'), created_at: stamp(), updated_at: stamp(), ...doc }) };
}
