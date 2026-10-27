/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-whiteboard.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The whiteboard routes end to end through the bridge, over an in-memory mongo-api: hydrawn's
// contract shapes, the token and origin they demand, the rev compare-and-swap, the owner wall,
// and the limits of the devil verdict (C598-C612).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { BOARDS } from '../../scripts/bridge-whiteboard-store.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { MONGO_URL, createFakeMongoApi } from './support/fake-mongo-api.mjs';

const ORIGIN = 'https://whiteboard.example.test';
const V1 = '/api/whiteboard/v1/boards';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
const config = harnessConfig();

const element = (id, isDeleted = false) => ({ id, type: 'rectangle', isDeleted, x: 1, y: 2 });
const scene = (elements, extra = {}) => JSON.stringify({ type: 'osidraw', version: 1, elements, ...extra });

/** A running bridge with the whiteboard on (or off), and a client for one fresh user. */
async function withWhiteboard(run, { origin = ORIGIN, latencyMs = 0 } = {}) {
	const mongo = createFakeMongoApi({ latencyMs });
	const postgrest = createPostgrestMock();
	const fetchImpl = (url, init) => (String(url).startsWith(MONGO_URL) ? mongo.fetchImpl(url, init) : postgrest.fetchImpl(url, init));
	const env = { ...process.env, OSIONOS_WHITEBOARD_ORIGIN: origin, OSIONOS_MONGO_API_URL: MONGO_URL };
	return withBridge(config, fetchImpl, (base) => run({ base, mongo, user: () => userClient(base) }), { env });
}

async function userClient(base) {
	const userId = randomUUID();
	const session = sessionHeaders(config, userId, randomUUID());
	const minted = await send(base, '/api/whiteboard/token', session, { method: 'POST' });
	assert.equal(minted.status, 200, minted.text);
	const headers = { authorization: `Bearer ${minted.body.token}`, origin: ORIGIN };
	const call = (path, { headers: extra = {}, ...init } = {}) => send(base, path, { ...headers, ...extra }, init);
	const create = async (title = 'Plan') => {
		const created = await call(V1, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
		assert.equal(created.status, 201, created.text);
		return created.body;
	};
	const put = (slug, body, rev, query = '') => call(`${V1}/${slug}${query}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': `"${rev}"` }, body });
	return { userId, session, token: minted.body.token, call, create, put };
}

describe('whiteboard routes', () => {
	it('are absent while no whiteboard origin is configured', async () => {
		await withWhiteboard(async ({ base }) => {
			const session = sessionHeaders(config, IDS.userA, IDS.homeA);
			assert.equal((await send(base, V1, session)).status, 404);
			assert.equal((await send(base, '/api/whiteboard/token', session, { method: 'POST' })).status, 404);
		}, { origin: '' });
	});

	it('create an empty board, save it by rev, and read it back without tombstones', async () => {
		await withWhiteboard(async ({ user }) => {
			const client = await user();
			const board = await client.create('My plan');
			assert.match(board.slug, /^[a-z0-9]{12}$/);
			assert.deepEqual({ ...board, createdAt: '', updatedAt: '' }, { slug: board.slug, title: 'My plan', elementCount: 0, bounds: null, rev: 0, createdAt: '', updatedAt: '', thumbnailAt: null });
			const empty = await client.call(`${V1}/${board.slug}`);
			assert.deepEqual(empty.body.scene, { type: 'osidraw', version: 1, elements: [] });
			const saved = await client.put(board.slug, scene([element('a'), element('b', true)], { title: 'Renamed', evil: { $where: '1' } }), 0);
			assert.equal(saved.status, 200, saved.text);
			assert.equal(saved.body.rev, 1);
			assert.equal(saved.body.title, 'Renamed');
			assert.equal(saved.body.elementCount, 1);
			assert.equal(saved.body.scene.evil, undefined);
			const read = await client.call(`${V1}/${board.slug}`);
			assert.deepEqual(read.body.scene.elements.map((entry) => entry.id), ['a']);
			const withTombstones = await client.call(`${V1}/${board.slug}?include=tombstones`);
			assert.deepEqual(withTombstones.body.scene.elements.map((entry) => entry.id), ['a', 'b']);
			const listed = await client.call(V1);
			assert.deepEqual(listed.body.boards.map((entry) => [entry.slug, entry.rev]), [[board.slug, 1]]);
			assert.equal(listed.body.nextCursor, null);
		});
	});

	it('refuse a save without If-Match or from a stale rev, and let one of 20 racing saves win', async () => {
		await withWhiteboard(async ({ user }) => {
			const client = await user();
			const { slug } = await client.create();
			const bare = await client.call(`${V1}/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: scene([]) });
			assert.equal(bare.status, 428);
			assert.equal(bare.body.error.code, 'precondition_required');
			assert.equal((await client.put(slug, scene([]), 5)).status, 409);
			const raced = await Promise.all(Array.from({ length: 20 }, (_, index) => client.put(slug, scene([element(`e${index}`)]), 0)));
			assert.deepEqual(raced.map((result) => result.status).sort(), [200, ...Array(19).fill(409)]);
		}, { latencyMs: 20 });
	});

	it('keep each user to their own boards', async () => {
		await withWhiteboard(async ({ user }) => {
			const owner = await user();
			const other = await user();
			const { slug } = await owner.create();
			assert.equal((await other.call(`${V1}/${slug}`)).status, 404);
			assert.equal((await other.put(slug, scene([]), 0)).status, 404);
			assert.equal((await other.call(`${V1}/${slug}`, { method: 'DELETE' })).status, 404);
			assert.deepEqual((await other.call(V1)).body.boards, []);
		});
	});

	it('answer only the whiteboard origin, and only its token', async () => {
		await withWhiteboard(async ({ base, user }) => {
			const client = await user();
			const preflight = (origin) => send(base, V1, { origin, 'access-control-request-method': 'PUT' }, { method: 'OPTIONS' });
			const allowed = await preflight(ORIGIN);
			assert.equal(allowed.status, 204);
			const foreignPreflight = await fetch(`${base}${V1}`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
			assert.equal(foreignPreflight.status, 403);
			assert.equal(foreignPreflight.headers.get('access-control-allow-origin'), null);
			const foreign = await fetch(`${base}${V1}`, { headers: { authorization: `Bearer ${client.token}`, origin: 'https://evil.example' } });
			assert.equal(foreign.headers.get('access-control-allow-origin'), null);
			assert.equal(foreign.headers.get('access-control-allow-credentials'), null);
			assert.equal((await send(base, V1, { ...client.session, origin: ORIGIN })).status, 401);
			assert.equal((await send(base, '/api/realtime/token', { authorization: `Bearer ${client.token}` }, { method: 'POST', body: '{"kind":"objectdb"}' })).status, 401);
		});
	});

	it('reject bad slugs and limits, and refuse a save that wipes most of a board unless forced', async () => {
		await withWhiteboard(async ({ user }) => {
			const client = await user();
			assert.equal((await client.call(`${V1}/NOT_A_SLUG`)).status, 400);
			assert.equal((await client.call(`${V1}?limit=abc`)).status, 400);
			assert.equal((await client.call(`${V1}?cursor=-1`)).status, 400);
			const { slug } = await client.create();
			const full = Array.from({ length: 25 }, (_, index) => element(`e${index}`));
			assert.equal((await client.put(slug, scene(full), 0)).status, 200);
			const wiped = await client.put(slug, scene(full.slice(0, 2)), 1);
			assert.equal(wiped.status, 422);
			assert.equal(wiped.body.error.code, 'shrink_refused');
			assert.equal((await client.put(slug, scene(full.slice(0, 2)), 1, '?force=1')).status, 200);
		});
	});

	it('cap a scene at 8 MB and an account at 200 boards', async () => {
		await withWhiteboard(async ({ mongo, user }) => {
			const client = await user();
			const { slug } = await client.create();
			const huge = scene([{ ...element('big'), text: 'x'.repeat(8 * 1024 * 1024) }]);
			const tooLarge = await client.put(slug, huge, 0);
			assert.equal(tooLarge.status, 413);
			assert.equal(tooLarge.body.error.code, 'payload_too_large');
			for (let index = 1; index < 200; index += 1) mongo.seed(BOARDS, { owner_id: client.userId, slug: `seeded${String(index).padStart(4, '0')}`, deleted_at: null });
			const capped = await client.call(V1, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"one more"}' });
			assert.equal(capped.status, 403);
			assert.equal(capped.body.error.code, 'board_limit');
		});
	});

	it('page the gallery by cursor and drop a deleted board from it', async () => {
		await withWhiteboard(async ({ user }) => {
			const client = await user();
			const slugs = [];
			for (let index = 0; index < 3; index += 1) slugs.push((await client.create(`B${index}`)).slug);
			const first = await client.call(`${V1}?limit=2`);
			assert.deepEqual(first.body.boards.map((board) => board.slug), [slugs[2], slugs[1]]);
			const second = await client.call(`${V1}?limit=2&cursor=${first.body.nextCursor}`);
			assert.deepEqual(second.body.boards.map((board) => board.slug), [slugs[0]]);
			assert.equal(second.body.nextCursor, null);
			assert.equal((await client.call(`${V1}/${slugs[1]}`, { method: 'DELETE' })).status, 204);
			assert.equal((await client.call(`${V1}/${slugs[1]}`)).status, 404);
			assert.deepEqual((await client.call(V1)).body.boards.map((board) => board.slug), [slugs[2], slugs[0]]);
		});
	});

	it('store a PNG thumbnail and hand it back, refusing anything else', async () => {
		await withWhiteboard(async ({ base, user }) => {
			const client = await user();
			const { slug } = await client.create();
			const path = `${V1}/${slug}/thumbnail`;
			const putPicture = (body, type = 'image/png') => fetch(`${base}${path}`, { method: 'PUT', headers: { authorization: `Bearer ${client.token}`, 'content-type': type }, body });
			assert.equal((await putPicture(Buffer.from('<svg/>'), 'image/svg+xml')).status, 415);
			assert.equal((await putPicture(Buffer.from('not a png at all'))).status, 415);
			assert.equal((await putPicture(Buffer.concat([PNG, Buffer.alloc(512 * 1024)]))).status, 413);
			assert.equal((await putPicture(PNG)).status, 204);
			const picture = await fetch(`${base}${path}?v=1`, { headers: { authorization: `Bearer ${client.token}` } });
			assert.equal(picture.status, 200);
			assert.equal(picture.headers.get('content-type'), 'image/png');
			assert.deepEqual(Buffer.from(await picture.arrayBuffer()), PNG);
			assert.ok((await client.call(V1)).body.boards[0].thumbnailAt);
		});
	});
});
