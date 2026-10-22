/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-preferences.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The settings sections: `/api/preferences` is the `preferences` section and
 * `/api/account/notification-settings` is the `notifications` one. The merge goes through
 * the database's merge function, so two writes to one section both land, and the inbox at
 * `/api/notifications` keeps its own shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { send, sessionToken, startAccountWorld, startBridgeWorld, USER_A } from './support/account-world.mjs';
import { kvStub } from './support/kv-stub.mjs';

const MERGE_RPC = 'rpc/osionos_user_settings_merge';

async function world(t, { rows = {}, kv } = {}) {
	const built = await startAccountWorld(t, {
		rows: {
			settings: [{ user_id: USER_A, section: 'preferences', value: { theme: 'dark', language: 'fr' }, version: 3 }],
			...rows,
		},
		kv,
	});
	return { ...built, token: sessionToken(built.config, USER_A) };
}

describe('GET on a settings section', () => {
	it('answers the object of the section', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/preferences', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { theme: 'dark', language: 'fr' });
	});

	it('answers an empty object when the section was never written', async (t) => {
		const { base, token } = await world(t, { rows: { settings: [] } });
		const response = await send(base, '/api/preferences', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, {});
	});

	it('answers the notifications section on its own path', async (t) => {
		const { base, token } = await world(t, {
			rows: { settings: [{ user_id: USER_A, section: 'notifications', value: { email: false }, version: 1 }] },
		});
		const response = await send(base, '/api/account/notification-settings', { token });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { email: false });
	});

	it('reads the section through the per-user token', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/preferences', { token });
		const read = store.callsTo('osionos_user_settings')[0];
		assert.equal(read.claims?.aud, 'osionos-account');
		assert.equal(read.claims?.role, 'osionos_account_user');
	});
});

describe('PATCH on a settings section', () => {
	it('merges the patch and answers the merged object', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/preferences', { method: 'PATCH', token, body: { theme: 'light' } });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { theme: 'light', language: 'fr' });
		assert.equal(store.callsTo(MERGE_RPC).length, 1);
	});

	it('does not read the section first: the merge is the database\'s', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/preferences', { method: 'PATCH', token, body: { theme: 'light' } });
		assert.equal(store.callsTo('osionos_user_settings').filter((call) => call.method === 'GET').length, 0);
	});

	it('deletes a key whose value is null', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/preferences', { method: 'PATCH', token, body: { language: null } });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { theme: 'dark' });
	});

	it('lands both of two concurrent writes to one section', async (t) => {
		const { base, token, store } = await world(t);
		const [first, second] = await Promise.all([
			send(base, '/api/preferences', { method: 'PATCH', token, body: { alpha: 1 } }),
			send(base, '/api/preferences', { method: 'PATCH', token, body: { beta: 2 } }),
		]);
		assert.equal(first.status, 200);
		assert.equal(second.status, 200);
		assert.equal(store.callsTo(MERGE_RPC).length, 2);
		const stored = store.rows('osionos_user_settings').find((row) => row.section === 'preferences').value;
		assert.equal(stored.alpha, 1);
		assert.equal(stored.beta, 2);
		assert.equal(stored.theme, 'dark');
	});

	it('answers 413 for a body over 16 KB', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/preferences', { method: 'PATCH', token, body: { blob: 'x'.repeat(17_000) } });
		assert.equal(response.status, 413);
		assert.equal(response.body.code, 'payload_too_large');
	});

	it('answers 422 for a body that is not a JSON object', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/preferences', { method: 'PATCH', token, body: ['a'] });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_body');
	});
});

describe('PUT on a settings section', () => {
	it('replaces the section: the object plus a null for every key the client dropped', async (t) => {
		const { base, token, store } = await world(t);
		const response = await send(base, '/api/preferences', { method: 'PUT', token, body: { theme: 'sepia' } });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { theme: 'sepia' });
		const patch = store.callsTo(MERGE_RPC)[0].body.p_patch;
		assert.deepEqual(patch, { theme: 'sepia', language: null });
	});
});

describe('the section paths', () => {
	it('answers 404 for an unknown section path', async (t) => {
		const { base, token } = await world(t);
		const unknown = await send(base, '/api/preferences/reset', { token });
		const extra = await send(base, '/api/account/notification-settings/extra', { token });
		assert.equal(unknown.status, 404);
		assert.equal(unknown.body.code, 'section_not_found');
		assert.equal(extra.status, 404);
		assert.equal(extra.body.code, 'section_not_found');
	});

	it('leaves the notification inbox at /api/notifications to the inbox', async (t) => {
		const { base, config } = await startBridgeWorld(t, {
			rows: {
				notifications: [{ id: 'dddddddd-4444-4444-8444-dddddddddddd', user_id: USER_A, type: 'mention', preview: 'hi', read_at: null, created_at: '2026-10-01T00:00:00.000Z' }],
			},
		});
		const inbox = await send(base, '/api/notifications', { token: sessionToken(config, USER_A) });
		assert.equal(inbox.status, 200);
		assert.equal(inbox.body.ok, true);
		assert.ok(Array.isArray(inbox.body.items));
		assert.equal(inbox.body.items.length, 1);
		assert.equal(inbox.body.items[0].preview, 'hi');
	});
});

describe('the settings rate limit', () => {
	it('answers 429 with retryAfterSeconds on the 121st request of a minute', async (t) => {
		const { base, token } = await world(t, { kv: kvStub() });
		for (let attempt = 0; attempt < 120; attempt += 1) {
			const written = await send(base, '/api/preferences', { method: 'PATCH', token, body: { [`key${attempt}`]: attempt } });
			assert.equal(written.status, 200, `write ${attempt + 1} answers ${written.status}`);
		}
		const limited = await send(base, '/api/preferences', { method: 'PATCH', token, body: { one: 'too many' } });
		assert.equal(limited.status, 429);
		assert.equal(limited.body.code, 'rate_limited');
		assert.equal(limited.body.retryAfterSeconds, 60);
	});
});
