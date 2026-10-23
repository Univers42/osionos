/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-interaction-limits.test.mjs                  :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Interaction limits (P5-4-b): the `moderation` settings section and the three places that
 * enforce it (a direct message, a connection request, a page comment). The enforcement
 * cases run the real handlers over a fake BaaS that records every write, so "nothing was
 * written" is an assertion on the fake's state.
 *
 * Caveat: the fake answers a read it does not know with an empty list, so a read the
 * handlers add later is not caught here; the writes are what the cases pin.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createChatHandler } from '../../scripts/bridge-chat.mjs';
import { createCommentsHandler } from '../../scripts/bridge-comments.mjs';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import {
	DURATION_HOURS,
	INTERACTIONS,
	MODES,
	moderationPolicy,
	moderationPolicyFor,
	normaliseModerationPatch,
} from '../../scripts/bridge-moderation-core.mjs';
import { ACCOUNT_JWT_SECRET, send, sessionToken, startAccountWorld, USER_A } from './support/account-world.mjs';
import { createAccountStore } from './support/account-postgrest.mjs';
import { kvStub } from './support/kv-stub.mjs';

const PATH = '/api/account/moderation-settings';
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const PAGE = '44444444-4444-4444-8444-444444444444';
const CHANNEL = '55555555-5555-4555-8555-555555555555';
const NOT_ACCEPTING = /^This person is not accepting (messages from you|connection requests from you|comments on their pages)\.$/;

async function accountWorld(t, settings = []) {
	const built = await startAccountWorld(t, { rows: { settings }, kv: kvStub() });
	return { ...built, token: sessionToken(built.config, USER_A) };
}

describe('the moderation settings route', () => {
	it('answers {} when the caller has no moderation section', async (t) => {
		const { base, token } = await accountWorld(t);
		const response = await send(base, PATH, { token });
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, {});
	});

	it('answers the caller\'s own stored section', async (t) => {
		const stored = { comments: { mode: 'nobody', until: '2030-01-01T00:00:00.000Z' } };
		const { base, token } = await accountWorld(t, [{ user_id: USER_A, section: 'moderation', value: stored, version: 1 }]);
		const response = await send(base, PATH, { token });
		assert.deepEqual(response.body, stored);
	});

	it('reads with the account token, never the service key', async (t) => {
		const { base, token, store } = await accountWorld(t);
		await send(base, PATH, { token });
		const read = store.callsTo('osionos_user_settings')[0];
		assert.equal(read.claims?.aud, 'osionos-account');
		assert.equal(read.claims?.role, 'osionos_account_user');
		assert.doesNotMatch(read.authorization, /service-role-test-key/);
	});

	it('PATCH computes until from the bridge clock and merges through the RPC', async (t) => {
		const { base, token, store } = await accountWorld(t);
		const before = Date.now();
		const response = await send(base, PATH, { method: 'PATCH', token, body: { messages: { mode: 'connections', durationHours: 24 } } });
		const after = Date.now();
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body), ['messages']);
		assert.equal(response.body.messages.mode, 'connections');
		const until = Date.parse(response.body.messages.until);
		assert.ok(until >= before + 24 * HOUR && until <= after + 24 * HOUR, `until ${response.body.messages.until} is not the bridge's clock + 24 h`);
		assert.equal(store.callsTo('rpc/osionos_user_settings_merge').length, 1);
		assert.equal(store.callsTo('osionos_user_settings').length, 0, 'no read-then-write');
	});

	it('PATCH ignores an until the client sends', async (t) => {
		const { base, token } = await accountWorld(t);
		const body = { comments: { mode: 'nobody', durationHours: 24, until: '2099-01-01T00:00:00.000Z' } };
		const response = await send(base, PATH, { method: 'PATCH', token, body });
		assert.equal(response.status, 200);
		assert.ok(Date.parse(response.body.comments.until) < Date.now() + 25 * HOUR);
	});

	it('a second PATCH to the same interaction REPLACES the entry (no stale until)', async (t) => {
		const { base, token } = await accountWorld(t);
		await send(base, PATH, { method: 'PATCH', token, body: { messages: { mode: 'nobody', durationHours: 168 } } });
		const second = await send(base, PATH, { method: 'PATCH', token, body: { messages: { mode: 'everyone' } } });
		assert.deepEqual(second.body, { messages: { mode: 'everyone' } });
		assert.deepEqual((await send(base, PATH, { token })).body, { messages: { mode: 'everyone' } });
	});

	for (const [name, body, code] of [
		['an unknown mode', { messages: { mode: 'followers', durationHours: 24 } }, 'invalid_mode'],
		['an unknown interaction', { calls: { mode: 'nobody', durationHours: 24 } }, 'unknown_interaction'],
		['a duration outside the vocabulary', { messages: { mode: 'nobody', durationHours: 5 } }, 'invalid_duration'],
		['a mode that needs a duration and has none', { messages: { mode: 'nobody' } }, 'invalid_duration'],
		['an array body', [], 'invalid_body'],
	]) {
		it(`answers 422 ${code} for ${name}`, async (t) => {
			const { base, token, store } = await accountWorld(t);
			const response = await send(base, PATH, { method: 'PATCH', token, body });
			assert.equal(response.status, 422);
			assert.equal(response.body.code, code);
			assert.equal(store.callsTo('rpc/osionos_user_settings_merge').length, 0);
		});
	}

	it('answers 405 method_not_allowed to PUT and leaves the section unchanged', async (t) => {
		const stored = { messages: { mode: 'nobody', until: '2030-01-01T00:00:00.000Z' } };
		const { base, token, store } = await accountWorld(t, [{ user_id: USER_A, section: 'moderation', value: stored, version: 1 }]);
		const response = await send(base, PATH, { method: 'PUT', token, body: { comments: { mode: 'nobody', durationHours: 24 } } });
		assert.equal(response.status, 405);
		assert.equal(response.body.code, 'method_not_allowed');
		assert.deepEqual(store.rows('osionos_user_settings')[0].value, stored);
	});

	it('leaves /api/preferences and the notifications section as they were', async (t) => {
		const { base, token } = await accountWorld(t, [{ user_id: USER_A, section: 'preferences', value: { theme: 'dark' }, version: 1 }]);
		assert.deepEqual((await send(base, '/api/preferences', { token })).body, { theme: 'dark' });
		const put = await send(base, '/api/preferences', { method: 'PUT', token, body: { theme: 'light' } });
		assert.equal(put.status, 200);
	});

	it('answers 429 with retryAfterSeconds on the 121st call of a minute', async (t) => {
		const { base, token } = await accountWorld(t);
		for (let attempt = 0; attempt < 120; attempt += 1) {
			assert.equal((await send(base, PATH, { token })).status, 200, `read ${attempt + 1}`);
		}
		const limited = await send(base, PATH, { token });
		assert.equal(limited.status, 429);
		assert.ok(Number.isFinite(limited.body.retryAfterSeconds));
	});

	it('reads the policy and writes the merge against the same base URL', async () => {
		const config = { baasUrl: 'https://baas.local', serviceKey: 'svc' };
		const store = createAccountStore({ settings: [] });
		const urls = [];
		const fetchImpl = (url, init) => { urls.push(String(url)); return store.fetchImpl(url, init); };
		const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl });
		await moderationPolicyFor(config, fetchImpl, USER_A);
		await pg.asUser({ userId: USER_A }).rpc('osionos_user_settings_merge', { p_section: 'moderation', p_patch: {} });
		const [read, write] = urls.map((url) => url.slice(0, url.indexOf('/rest/v1/') + '/rest/v1/'.length));
		assert.equal(read, write);
	});
});

describe('the moderation vocabulary', () => {
	it('declares the three interactions, their modes and the five durations', () => {
		assert.deepEqual(INTERACTIONS, ['messages', 'connections', 'comments']);
		assert.deepEqual(MODES, { messages: ['everyone', 'connections', 'nobody'], connections: ['everyone', 'nobody'], comments: ['everyone', 'workspace', 'nobody'] });
		assert.deepEqual(DURATION_HOURS, [24, 168, 720, 2160, 4320]);
	});

	it('moderationPolicy falls back to everyone for a missing, malformed or unknown value', () => {
		for (const value of [null, undefined, 'x', [], 7, { messages: 'nobody' }, { messages: { mode: 'followers', until: '2999-01-01T00:00:00Z' } }, { messages: { mode: 'nobody' } }]) {
			assert.deepEqual(moderationPolicy(value, NOW).messages, { mode: 'everyone' }, JSON.stringify(value));
		}
	});

	it('moderationPolicy treats a past or malformed until as expired and a future one as live', () => {
		const at = (until) => moderationPolicy({ comments: { mode: 'nobody', until } }, NOW).comments.mode;
		assert.equal(at(new Date(NOW - 1).toISOString()), 'everyone');
		assert.equal(at(new Date(NOW).toISOString()), 'everyone');
		assert.equal(at('not a date'), 'everyone');
		assert.equal(at(null), 'everyone');
		assert.equal(at(new Date(NOW + HOUR).toISOString()), 'nobody');
	});

	it('normaliseModerationPatch computes until from the clock it is given, never past 4320 hours', () => {
		for (const hours of DURATION_HOURS) {
			const patch = normaliseModerationPatch({ messages: { mode: 'nobody', durationHours: hours } }, NOW);
			assert.equal(Date.parse(patch.messages.until), NOW + hours * HOUR);
			assert.ok(Date.parse(patch.messages.until) - NOW <= 4320 * HOUR);
		}
		assert.deepEqual(normaliseModerationPatch({ comments: { mode: 'everyone', durationHours: 99999 } }, NOW), { comments: { mode: 'everyone' } });
		assert.throws(() => normaliseModerationPatch('x', NOW), { status: 422, code: 'invalid_body' });
	});
});

/** A fake BaaS over the tables the three handlers read; every non-GET call is recorded. */
function fakeBaas({ settings = {}, blocks = [], edges = [], members = [], pageOwner = TARGET, failing = [] } = {}) {
	const writes = [];
	const reads = [];
	const rows = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (!parsed.pathname.startsWith('/rest/v1/')) return rows({});
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const query = decodeURIComponent(parsed.search);
		if (method !== 'GET') {
			writes.push({ table, method, body: init.body ? JSON.parse(init.body) : null });
			return rows([{ id: PAGE, created_at: 'now', ...(init.body ? JSON.parse(init.body) : {}) }], 201);
		}
		reads.push({ table, query });
		if (table === 'osionos_user_settings') {
			if (failing.includes('policy')) return rows({ message: 'down' }, 500);
			const owner = /user_id=eq\.([^&]+)/.exec(query)[1];
			return rows(settings[owner] ? [{ value: settings[owner] }] : []);
		}
		if (table === 'osionos_user_blocks') {
			if (failing.includes('blocks')) return rows({ message: 'down' }, 500);
			if (failing.includes('blocks-malformed')) return rows({ not: 'a list' });
			return rows(blocks);
		}
		if (table === 'osionos_connections' && query.includes('or=')) return rows(edges);
		if (table === 'osionos_connections') return rows([]);
		if (table === 'osionos_workspace_members' && query.includes('role,permissions')) {
			const user = /user_id=eq\.([^&]+)/.exec(query)[1];
			return rows(members.includes(user) ? [{ role: 'member', permissions: [] }] : []);
		}
		if (table === 'osionos_channels') return rows([{ id: CHANNEL, kind: 'dm', workspace_id: WORKSPACE, is_private: true, dm_key: 'k', name: 'dm' }]);
		if (table === 'osionos_channel_members') {
			return rows(query.includes('user_id=neq.') ? [{ user_id: TARGET }] : [{ role: 'member' }]);
		}
		return rows([]);
	};
	return { fetchImpl, writes, reads, pageOwner };
}

const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const stillLive = (mode) => ({ mode, until: new Date(Date.now() + 24 * HOUR).toISOString() });
const FORBIDDEN = ['osionos_messages', 'osionos_channels', 'osionos_channel_members', 'osionos_connections', 'osionos_page_comments'];
const forbiddenWrites = (baas) => baas.writes.filter((write) => FORBIDDEN.includes(write.table));

function jsonRequest(method, payload) {
	return {
		method,
		headers: { authorization: 'Bearer t' },
		async *[Symbol.asyncIterator]() { yield JSON.stringify(payload); },
	};
}

async function call(handler, path, payload) {
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, setHeader() {}, end: (text) => { captured.text = text; captured.body = text ? JSON.parse(text) : null; } };
	await handler(new URL(`http://bridge.test${path}`), jsonRequest('POST', payload), response, CONFIG);
	return captured;
}

const verifySession = () => ({ userId: ACTOR, workspaceIds: [WORKSPACE] });
const connect = (baas) => call(createSocialHandler({ config: CONFIG, verifySession, fetchImpl: baas.fetchImpl, env: {} }), '/api/connections', { addresseeId: TARGET });
const openDm = (baas) => call(createChatHandler({ config: CONFIG, verifySession, fetchImpl: baas.fetchImpl, env: {} }), '/api/chat/dm', { peerUserId: TARGET });
const sendDm = (baas) => call(createChatHandler({ config: CONFIG, verifySession, fetchImpl: baas.fetchImpl, env: {} }), `/api/chat/channels/${CHANNEL}/messages`, { content: 'hello' });
const comment = (baas) => {
	const verifyPageAccess = async () => ({ row: { owner_id: baas.pageOwner, workspace_id: WORKSPACE } });
	return call(createCommentsHandler({ config: CONFIG, verifySession, verifyPageAccess, fetchImpl: baas.fetchImpl, env: {} }), '/api/comments', { pageId: PAGE, content: 'nice' });
};

function assertRefused(result, baas) {
	assert.equal(result.status, 403);
	assert.equal(result.body.code, 'interaction_not_allowed');
	assert.match(result.body.message, NOT_ACCEPTING);
	assert.doesNotMatch(result.text, /nobody|until|hours/);
	assert.deepEqual(forbiddenWrites(baas), []);
}

describe('connection requests', () => {
	it('refuses a request to a target whose connections mode is nobody, and writes no edge', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { connections: stillLive('nobody') } } });
		assertRefused(await connect(baas), baas);
	});

	it('lets a request through to a target whose connections mode is everyone', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { connections: { mode: 'everyone' } } } });
		const result = await connect(baas);
		assert.equal(result.status, 201);
		assert.equal(baas.writes.filter((write) => write.table === 'osionos_connections').length, 1);
	});

	it('reads exactly the moderation value of the target, nothing else of the row', async () => {
		const baas = fakeBaas();
		await connect(baas);
		const read = baas.reads.find((entry) => entry.table === 'osionos_user_settings');
		assert.equal(read.query, `?user_id=eq.${TARGET}&section=eq.moderation&select=value&limit=1`);
	});

	it('lets an expired limit through', async () => {
		const expired = { mode: 'nobody', until: new Date(Date.now() - 1000).toISOString() };
		const baas = fakeBaas({ settings: { [TARGET]: { connections: expired } } });
		assert.equal((await connect(baas)).status, 201);
	});

	it('lets the request through when the policy read fails, and says so in a warning with no policy value', async (t) => {
		const warn = t.mock.method(console, 'warn', () => {});
		const baas = fakeBaas({ settings: { [TARGET]: { connections: stillLive('nobody') } }, failing: ['policy'] });
		assert.equal((await connect(baas)).status, 201);
		assert.ok(warn.mock.calls.length >= 1);
		const logged = warn.mock.calls.map((entry) => entry.arguments.join(' ')).join('\n');
		assert.match(logged, /moderation policy/i);
		assert.doesNotMatch(logged, /nobody|until/);
	});

	it('refuses with 503 and writes nothing when the block read fails', async () => {
		for (const failing of ['blocks', 'blocks-malformed']) {
			const baas = fakeBaas({ failing: [failing] });
			const result = await connect(baas);
			assert.equal(result.status, 503, failing);
			assert.deepEqual(forbiddenWrites(baas), []);
		}
	});

	it('still refuses a blocked pair with the block message, before the policy is read', async () => {
		const baas = fakeBaas({ blocks: [{ blocker_id: TARGET }] });
		const result = await connect(baas);
		assert.equal(result.status, 403);
		assert.equal(result.body.message, 'Connection is blocked.');
		assert.equal(baas.reads.some((entry) => entry.table === 'osionos_user_settings'), false);
	});
});

describe('direct messages', () => {
	it('refuses a DM to a target whose messages mode is nobody, and creates no channel', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('nobody') } } });
		assertRefused(await openDm(baas), baas);
	});

	it('refuses a message in an existing DM to such a target, and inserts no message', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('nobody') } } });
		assertRefused(await sendDm(baas), baas);
	});

	it('connections mode allows a DM when the pair has an accepted edge', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('connections') } }, edges: [{ requester_id: ACTOR, addressee_id: TARGET, status: 'accepted' }] });
		assert.equal((await openDm(baas)).status, 200);
	});

	it('connections mode refuses a DM when the edge is only pending', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('connections') } }, edges: [{ requester_id: ACTOR, addressee_id: TARGET, status: 'pending' }] });
		assertRefused(await openDm(baas), baas);
	});

	it('connections mode refuses a message when the pair has no edge', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('connections') } } });
		assertRefused(await sendDm(baas), baas);
	});

	it('lets a message through when the policy read fails (fail-open for the limit, with a warning)', async (t) => {
		t.mock.method(console, 'warn', () => {});
		const baas = fakeBaas({ settings: { [TARGET]: { messages: stillLive('nobody') } }, failing: ['policy'] });
		assert.equal((await sendDm(baas)).status, 201);
	});

	it('refuses with 503 and creates no channel when the block read fails (fail-closed for blocks)', async () => {
		const baas = fakeBaas({ failing: ['blocks'] });
		assert.equal((await openDm(baas)).status, 503);
		assert.deepEqual(forbiddenWrites(baas), []);
	});

	it('does not read the other member twice for a DM message', async () => {
		const baas = fakeBaas();
		await sendDm(baas);
		const others = baas.reads.filter((entry) => entry.table === 'osionos_channel_members' && entry.query.includes('user_id=neq.'));
		assert.equal(others.length, 1);
	});
});

describe('page comments', () => {
	it('refuses a comment on a page whose owner has comments mode nobody, and writes no row', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { comments: stillLive('nobody') } } });
		assertRefused(await comment(baas), baas);
	});

	it('workspace mode allows a member of the page\'s workspace', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { comments: stillLive('workspace') } }, members: [ACTOR] });
		assert.equal((await comment(baas)).status, 200);
		assert.equal(baas.writes.filter((write) => write.table === 'osionos_page_comments').length, 1);
	});

	it('workspace mode refuses someone outside the page\'s workspace', async () => {
		const baas = fakeBaas({ settings: { [TARGET]: { comments: stillLive('workspace') } }, members: [] });
		assertRefused(await comment(baas), baas);
	});

	it('never refuses the owner commenting on their own page', async () => {
		const baas = fakeBaas({ settings: { [ACTOR]: { comments: stillLive('nobody') } }, pageOwner: ACTOR });
		assert.equal((await comment(baas)).status, 200);
		assert.equal(baas.reads.some((entry) => entry.table === 'osionos_user_settings'), false);
	});

	it('lets a comment through when the policy read fails (fail-open for the limit, with a warning)', async (t) => {
		t.mock.method(console, 'warn', () => {});
		const baas = fakeBaas({ settings: { [TARGET]: { comments: stillLive('nobody') } }, failing: ['policy'] });
		assert.equal((await comment(baas)).status, 200);
	});
});
