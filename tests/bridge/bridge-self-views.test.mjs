/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-views.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Saved views on a `sys:` source: /api/account/self-data/views/<source>[/<viewId>].
 *
 * What is proved here: a view is stored under a section the route derives from the
 * source (a body key or a query parameter cannot name one), every write goes through the
 * merge function and never a direct insert, a second view does not replace the first, a
 * delete removes only its own view, one user never reads another's map, and the id and the
 * body are refused unless they are on the allowlists.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountConfig, send, sessionToken, startAccountWorld, USER_A, USER_B } from './support/account-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { SELF_SOURCES } from '../../scripts/bridge-self-sources.mjs';

// my-activity is registered only while the activity flag is on; the flag-off case is tested explicitly.
process.env.OSIONOS_ACTIVITY = '1';

const MERGE = 'rpc/osionos_user_settings_merge';
const VIEW = { name: 'Recent', type: 'table', filters: [{ property: 'title', op: 'contains', value: 'a' }], sorts: [{ property: 'updated_at', direction: 'desc' }], visibleProperties: ['title', 'updated_at'], settings: { showRowNumbers: true } };

async function world(t, { settings = [], fail = null, kv } = {}) {
	const config = accountConfig();
	const built = await startAccountWorld(t, { config, rows: { settings }, fail, kv });
	return { ...built, token: sessionToken(config, USER_A), tokenB: sessionToken(config, USER_B) };
}

const url = (source, id) => `/api/account/self-data/views/${source}${id === undefined ? '' : `/${id}`}`;
const put = (base, token, source, id, body) => send(base, url(source, id), { method: 'PUT', token, body });
const rowOf = (store, user, section) => store.rows('osionos_user_settings').find((row) => row.user_id === user && row.section === section);

describe('saved views on a sys: source', () => {
	it('answers an empty map when nothing is saved', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, url('my-pages'), { token });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { ok: true, source: 'my-pages', views: {} });
	});

	it('stores a view under the section derived from the source, through the merge function', async (t) => {
		const { base, store, token } = await world(t);
		const response = await put(base, token, 'my-pages', 'recent', VIEW);
		assert.equal(response.status, 200);
		assert.deepEqual(response.body.views, { recent: VIEW });
		assert.deepEqual(rowOf(store, USER_A, 'sys-views-my-pages')?.value, { recent: VIEW });
		const merges = store.callsTo(MERGE);
		assert.equal(merges.length, 1, 'one write, one merge call');
		assert.equal(merges[0].body.p_section, 'sys-views-my-pages');
		assert.equal(merges[0].claims.role, 'osionos_account_user', 'the caller runs the merge as itself');
		const direct = store.calls.filter((call) => call.table === 'osionos_user_settings' && call.method !== 'GET');
		assert.deepEqual(direct, [], 'no direct insert or update of the settings table');
	});

	it('names the section from the source alone and fits the table CHECK for every source', async (t) => {
		const { base, store, token } = await world(t);
		for (const source of SELF_SOURCES) {
			await put(base, token, source.id, 'v1', VIEW);
			assert.match(store.callsTo(MERGE).at(-1).body.p_section, /^[a-z][a-z0-9_-]{0,31}$/);
			assert.equal(store.callsTo(MERGE).at(-1).body.p_section, `sys-views-${source.id}`);
		}
		const response = await send(base, `${url('my-pages', 'v2')}?section=preferences`, { method: 'PUT', token, body: VIEW });
		assert.equal(response.status, 200);
		assert.equal(store.callsTo(MERGE).at(-1).body.p_section, 'sys-views-my-pages', 'a query parameter names no section');
		const named = await put(base, token, 'my-pages', 'v3', { ...VIEW, section: 'preferences' });
		assert.equal(named.status, 422, 'a body key naming a section is refused');
	});

	it('keeps the first view when a second is saved, and a delete removes only its own', async (t) => {
		const { base, token } = await world(t);
		await put(base, token, 'my-pages', 'one', VIEW);
		const two = await put(base, token, 'my-pages', 'two', { ...VIEW, name: 'Two' });
		assert.deepEqual(Object.keys(two.body.views).sort(), ['one', 'two']);
		const removed = await send(base, url('my-pages', 'one'), { method: 'DELETE', token });
		assert.equal(removed.status, 200);
		assert.deepEqual(Object.keys(removed.body.views), ['two']);
		const again = await send(base, url('my-pages'), { token });
		assert.deepEqual(Object.keys(again.body.views), ['two']);
	});

	it('does not show one user\'s views to another', async (t) => {
		const { base, token, tokenB } = await world(t);
		await put(base, token, 'my-pages', 'mine', VIEW);
		const other = await send(base, url('my-pages'), { token: tokenB });
		assert.deepEqual(other.body.views, {});
		const theirs = await put(base, tokenB, 'my-pages', 'theirs', VIEW);
		assert.deepEqual(Object.keys(theirs.body.views), ['theirs']);
		const mine = await send(base, url('my-pages'), { token });
		assert.deepEqual(Object.keys(mine.body.views), ['mine']);
	});

	it('reads the map with the caller\'s own claims, never the service key', async (t) => {
		const { base, store, token } = await world(t);
		await send(base, url('my-tasks'), { token });
		const read = store.callsTo('osionos_user_settings').at(-1);
		assert.equal(read.claims.role, 'osionos_account_user');
		assert.equal(read.params.get('section'), 'eq.sys-views-my-tasks');
		assert.doesNotMatch(read.authorization, /service-role-test-key/);
	});

	it('round-trips a real view unchanged', async (t) => {
		const { base, token } = await world(t);
		await put(base, token, 'my-pages', 'my-pages-recent', VIEW);
		const { body } = await send(base, url('my-pages'), { token });
		const rebuilt = { ...body.views['my-pages-recent'], id: 'my-pages-recent', databaseId: 'sys:my-pages' };
		const { id, databaseId, ...stored } = rebuilt;
		assert.deepEqual(stored, VIEW);
		assert.equal(databaseId, 'sys:my-pages');
		assert.equal(id, 'my-pages-recent');
	});

	it('refuses a body that is not a plain object, is too big or has a bad type or array', async (t) => {
		const { base, token } = await world(t);
		const cases = [
			['an array', [1]],
			['a string', 'x'],
			['null', null],
			['8 KB and one byte', { name: 'x'.repeat(8 * 1024) }],
			['an unknown type', { ...VIEW, type: 'carousel' }],
			['65 filters', { ...VIEW, filters: Array.from({ length: 65 }, () => ({})) }],
			['65 sorts', { ...VIEW, sorts: Array.from({ length: 65 }, () => ({})) }],
			['65 visible properties', { ...VIEW, visibleProperties: Array.from({ length: 65 }, () => 'a') }],
			['filters that are not an array', { ...VIEW, filters: {} }],
			['a bad conjunction', { ...VIEW, filterConjunction: 'xor' }],
			['a name over 200 characters', { ...VIEW, name: 'n'.repeat(201) }],
			['settings that are not an object', { ...VIEW, settings: [] }],
		];
		for (const [label, body] of cases) {
			const response = await put(base, token, 'my-pages', 'ok', body);
			assert.equal(response.status, 422, label);
			assert.equal(response.body.code, 'invalid_view', label);
		}
	});

	it('refuses a bad view id, including the keys that poison an object', async (t) => {
		const { base, store, token } = await world(t);
		for (const id of ['__proto__', 'constructor', 'prototype', '_x', '-x', 'a'.repeat(65), 'a.b', 'a%20b']) {
			const response = await put(base, token, 'my-pages', id, VIEW);
			assert.equal(response.status, 422, id);
			assert.equal(response.body.code, 'invalid_view_id', id);
		}
		assert.equal(store.callsTo(MERGE).length, 0, 'nothing was written');
		const ok = await put(base, token, 'my-pages', 'my-pages-default', VIEW);
		assert.equal(ok.status, 200);
	});

	it('refuses a key outside the allowlist, id, databaseId and an unknown settings key', async (t) => {
		const { base, store, token } = await world(t);
		const cases = {
			'an unlisted key': { ...VIEW, rows: [{ title: 'secret' }] },
			'an id': { ...VIEW, id: 'x' },
			'a databaseId': { ...VIEW, databaseId: 'sys:my-tasks' },
			'a settings key outside ViewSettings': { ...VIEW, settings: { showRowNumbers: true, evil: 1 } },
			'a __proto__ key': JSON.parse('{"name":"x","__proto__":{"a":1}}'),
		};
		for (const [label, body] of Object.entries(cases)) {
			const response = await put(base, token, 'my-pages', 'ok', body);
			assert.equal(response.status, 422, label);
			assert.equal(response.body.code, 'invalid_view', label);
		}
		assert.equal(store.callsTo(MERGE).length, 0);
	});

	it('answers 404 for an unknown source, 401 without a session, 405 for other methods', async (t) => {
		const { base, token } = await world(t);
		const unknown = await send(base, url('my-nothing'), { token });
		assert.equal(unknown.status, 404);
		assert.equal(unknown.body.code, 'unknown_self_source');
		assert.equal((await put(base, token, 'nope', 'v', VIEW)).status, 404);
		assert.equal((await send(base, url('my-pages'))).status, 401);
		assert.equal((await send(base, url('my-pages', 'v'), { method: 'PUT', body: VIEW })).status, 401);
		assert.equal((await send(base, url('my-pages'), { method: 'POST', token, body: {} })).status, 405);
		assert.equal((await send(base, url('my-pages', 'v'), { token })).status, 405, 'GET on a view id is not a route');
		assert.equal((await send(base, url('my-pages'), { method: 'PUT', token, body: VIEW })).status, 405, 'PUT on the map is not a route');
	});

	it('answers 413 view_too_large when the database refuses the value, and 503 when the store fails', async (t) => {
		const big = await world(t, { fail: (call) => (call.table === MERGE ? { status: 400, body: { code: '23514', message: 'check' } } : null) });
		const refused = await put(big.base, big.token, 'my-pages', 'v', VIEW);
		assert.equal(refused.status, 413);
		assert.equal(refused.body.code, 'view_too_large');
		const down = await world(t, { fail: (call) => (call.table === 'osionos_user_settings' ? { status: 500, body: {} } : null) });
		const read = await send(down.base, url('my-pages'), { token: down.token });
		assert.equal(read.status, 503, 'a store failure is never an empty map');
		assert.equal(read.body.code, 'self_views_unavailable');
	});

	it('answers 429 on the 61st call of the minute', async (t) => {
		const { base, token } = await world(t, { kv: kvStub() });
		for (let call = 1; call <= 60; call += 1) {
			assert.equal((await send(base, url('my-pages'), { token })).status, 200, `call ${call} is inside the window`);
		}
		const refused = await send(base, url('my-pages'), { token });
		assert.equal(refused.status, 429);
		assert.equal(refused.body.code, 'rate_limited');
	});
});

describe('the section a source saves into', () => {
	// The root CHECK on osionos_user_settings.section (osionos-account-profiles-migration.sql):
	// a source id that breaks it would answer the 23514 as "view_too_large" on every save.
	it('fits the section CHECK for every sys: source', () => {
		for (const source of SELF_SOURCES) assert.match(`sys-views-${source.id}`, /^[a-z][a-z0-9_-]{0,31}$/, source.id);
	});
});
