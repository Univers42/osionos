/**
 * #174: the notification inbox could be listed and marked read, never deleted, and a
 * live notification reached the app without the id of its stored row, so the app
 * could neither mark it read nor delete it.
 *
 * The cases run the real notify handler and emitNotifications over an in-memory
 * osionos_notifications table; the realtime publish is captured at the same fetch.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifyHandler } from '../../scripts/bridge-notify.mjs';
import { UUID_REGEX, emitNotifications } from '../../scripts/bridge-social-core.mjs';
import { callRoute } from './support/route-call.mjs';

const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const ENV = { REALTIME_PUBLISH_URL: 'http://realtime.test' };
const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const id = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

const reply = (rows) => ({ ok: true, status: 200, text: async () => (rows === '' ? '' : JSON.stringify(rows)) });

/** One PostgREST filter: `eq.`, `is.null` and `in.(…)`, the ones these routes send. */
function holds(row, key, value) {
	if (['select', 'order', 'limit'].includes(key)) return true;
	if (value === 'is.null') return row[key] == null;
	if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
	const list = /^in\.\((.*)\)$/.exec(value);
	if (list) return list[1].split(',').map((item) => item.replace(/^"|"$/g, '')).includes(String(row[key]));
	throw new Error(`undeclared filter ${key}=${value}`);
}

function world(rows) {
	const published = [];
	const fetchImpl = async (input, init = {}) => {
		const url = new URL(input);
		if (url.pathname === '/v1/publish') {
			published.push(JSON.parse(init.body));
			return reply({});
		}
		const table = url.pathname.replace('/rest/v1/', '');
		if (table === 'osionos_bridge_identities') return reply([{ user_id: ME, notify_token: 'tok-me' }]);
		assert.equal(table, 'osionos_notifications');
		const matching = (row) => [...url.searchParams].every(([key, value]) => holds(row, key, value));
		const method = init.method ?? 'GET';
		if (method === 'POST') {
			rows.push(...JSON.parse(init.body));
			return reply('');
		}
		if (method === 'DELETE') {
			const kept = rows.filter((row) => !matching(row));
			rows.splice(0, rows.length, ...kept);
			return reply('');
		}
		return reply(rows.filter(matching));
	};
	const handler = createNotifyHandler({ config: CONFIG, verifySession: (token) => ({ userId: token }), fetchImpl, env: ENV });
	return { rows, published, fetchImpl, call: (method, path) => callRoute(handler, { method, path, headers: { authorization: `Bearer ${ME}` } }) };
}

const seeded = () => [
	{ id: id(1), user_id: ME, type: 'mention', preview: 'hi', read_at: null },
	{ id: id(2), user_id: ME, type: 'dm', preview: 'yo', read_at: '2026-10-29T10:00:00.000Z' },
	{ id: id(3), user_id: PEER, type: 'dm', preview: 'theirs', read_at: null },
];

describe('deleting from the notification inbox', () => {
	it('DELETE /api/notifications/:id removes that one notification of the caller', async () => {
		const { rows, call } = world(seeded());
		const answer = await call('DELETE', `/api/notifications/${id(1)}`);
		assert.equal(answer.status, 200);
		assert.deepEqual(rows.map((row) => row.id), [id(2), id(3)]);
	});

	it('never deletes another user\'s notification by its id', async () => {
		const { rows, call } = world(seeded());
		const answer = await call('DELETE', `/api/notifications/${id(3)}`);
		assert.equal(answer.status, 200);
		assert.deepEqual(rows.map((row) => row.id), [id(1), id(2), id(3)]);
	});

	it('refuses an id that is not a UUID before reaching the table', async () => {
		const { rows, call } = world(seeded());
		const answer = await call('DELETE', '/api/notifications/1%20or%201=1');
		assert.equal(answer.status, 400);
		assert.equal(rows.length, 3);
	});

	it('DELETE /api/notifications clears the caller\'s inbox and nobody else\'s', async () => {
		const { rows, call } = world(seeded());
		const answer = await call('DELETE', '/api/notifications');
		assert.equal(answer.status, 200);
		assert.deepEqual(rows.map((row) => row.id), [id(3)]);
	});
});

describe('a live notification', () => {
	it('carries the id of the row it stored, so the app can mark it read or delete it', async () => {
		const { rows, published, fetchImpl } = world([]);
		await emitNotifications({ fetchImpl, env: ENV }, CONFIG, [{ recipientId: ME, type: 'mention', actorId: PEER, actorName: 'Peer', preview: 'hello' }]);
		assert.equal(rows.length, 1);
		assert.match(rows[0].id, UUID_REGEX);
		assert.equal(published.length, 1);
		assert.equal(published[0].event_type, 'notification_created');
		assert.equal(published[0].payload.id, rows[0].id);
	});
});
