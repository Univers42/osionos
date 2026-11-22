/**
 * osio auto-post, bridge half (osio-bot ruling OB1, OB2, OB5, OB11, OB12): the
 * per-channel opt-in a channel admin sets, the flag that hides all of it, the
 * unchanged post route in an opted-in channel, and the textless "osio is
 * answering" typing event. The real chat handler runs over an in-memory
 * PostgREST, so "nothing was written" is an assertion on the fake's state.
 *
 * Caveat: the fake models eq / neq / in / is.null / gt / gte / lt / lte / or
 * filters (ranges compare ISO strings) and answers a PATCH
 * naming a missingColumns entry with PostgREST's PGRST204 400; a filter the
 * handlers add later passes every row here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createChatHandler } from '../../scripts/bridge-chat.mjs';
import { AI_BOT_AUTHOR } from '../../scripts/bridge-chat-ai.mjs';

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const ON = { OSIONOS_THREAD_ANSWERS: 'on', OSIONOS_AI_AUTOPOST: 'on' };
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function matches(row, key, value) {
	if (['select', 'limit', 'order', 'on_conflict'].includes(key)) return true;
	if (key === 'or') {
		return value.slice(1, -1).split(',').some((clause) => {
			const [column, op, ...rest] = clause.split('.');
			return matches(row, column, `${op}.${rest.join('.')}`);
		});
	}
	const cell = row[key];
	const bare = (raw) => raw.replace(/^"|"$/g, '');
	const list = (raw) => raw.split(',').map(bare);
	const ranges = { 'gt.': (a, b) => a > b, 'gte.': (a, b) => a >= b, 'lt.': (a, b) => a < b, 'lte.': (a, b) => a <= b };
	for (const [op, holds] of Object.entries(ranges)) {
		if (value.startsWith(op)) return cell != null && holds(String(cell), bare(value.slice(op.length)));
	}
	if (value.startsWith('eq.')) return String(cell) === value.slice(3);
	if (value.startsWith('neq.')) return String(cell) !== value.slice(4);
	if (value === 'is.null') return cell == null;
	if (value.startsWith('in.(')) return list(value.slice(4, -1)).includes(String(cell));
	if (value.startsWith('not.in.(')) return !list(value.slice(8, -1)).includes(String(cell));
	return true;
}

function fakeBaas(tables, { missingColumns = [] } = {}) {
	const writes = [];
	const frames = [];
	const answer = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (!parsed.pathname.startsWith('/rest/v1/')) {
			frames.push(JSON.parse(init.body ?? 'null'));
			return answer({});
		}
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const rows = (tables[table] ??= []);
		const selected = () => rows.filter((row) => [...parsed.searchParams.entries()].every(([k, v]) => matches(row, k, v)));
		if (method === 'GET') return answer(selected());
		const body = init.body ? JSON.parse(init.body) : null;
		const missing = missingColumns.find((column) => body && Object.hasOwn(body, column));
		if (missing) return answer({ code: 'PGRST204', message: `Could not find the '${missing}' column of '${table}' in the schema cache` }, 400);
		writes.push({ table, method, body });
		if (method === 'PATCH') {
			const changed = selected();
			for (const row of changed) Object.assign(row, body);
			return answer(changed);
		}
		const inserted = (Array.isArray(body) ? body : [body]).map((item) => ({ id: randomUUID(), created_at: new Date().toISOString(), deleted_at: null, edited_at: null, ...item }));
		rows.push(...inserted);
		return answer(inserted, 201);
	};
	return { fetchImpl, writes, frames, tables };
}

/** A text channel, its admin, a plain workspace member and an asker whose thread run answered. */
function world({ channel = {}, env = ON, answer = 'Friday, as @Bob said.', missingColumns } = {}) {
	const asker = randomUUID();
	const channelId = randomUUID();
	const triggerId = randomUUID();
	const runId = randomUUID();
	const answerId = randomUUID();
	const baas = fakeBaas({
		osionos_channels: [{ id: channelId, workspace_id: WORKSPACE, kind: 'text', name: 'general', is_private: false, created_at: ago(60_000), ...channel }],
		osionos_channel_members: [{ channel_id: channelId, user_id: ADMIN, role: 'admin' }],
		osionos_workspace_members: [asker, MEMBER, ADMIN].map((user_id) => ({ workspace_id: WORKSPACE, user_id, role: 'member', permissions: [] })),
		osionos_people_directory: [[asker, 'Ada'], [MEMBER, 'Bob'], [ADMIN, 'Cy']].map(([user_id, display_name]) => ({ user_id, display_name, profile: {} })),
		osionos_messages: [{ id: triggerId, channel_id: channelId, author_id: asker, content: '@ai when do we ship?', created_at: ago(120_000), deleted_at: null, edited_at: null, thread_root_id: null }],
		ai_runs: [{
			id: runId, owner_id: asker, status: 'succeeded', finish_reason: 'stop', created_at: ago(60_000), ended_at: ago(30_000),
			surface: 'channel', surface_ref: { channelId, messageId: triggerId }, answer_message_id: answerId,
		}],
		ai_messages: [{ id: answerId, run_id: runId, role: 'assistant', parts: [{ type: 'text', text: answer }] }],
	}, { missingColumns });
	const handler = createChatHandler({
		config: CONFIG,
		verifySession: (token) => ({ userId: token }),
		fetchImpl: baas.fetchImpl,
		env: { REALTIME_PUBLISH_URL: 'http://realtime.test', ...env },
	});
	return { baas, handler, asker, channelId, runId };
}

function jsonRequest(method, payload, userId) {
	return {
		method,
		headers: { authorization: `Bearer ${userId}` },
		async *[Symbol.asyncIterator]() { if (payload !== undefined) yield JSON.stringify(payload); },
	};
}

async function call(handler, path, { payload, method = 'POST', as } = {}) {
	const captured = {};
	const response = { writeHead: (status) => { captured.status = status; }, setHeader() {}, end: (text) => { captured.body = text ? JSON.parse(text) : null; } };
	await handler(new URL(`http://bridge.test${path}`), jsonRequest(method, payload, as), response, CONFIG);
	return captured;
}

const setAutopost = (w, enabled, as = ADMIN) => call(w.handler, `/api/chat/channels/${w.channelId}/ai-autopost`, { method: 'PUT', payload: { enabled }, as });
const listed = async (w, as = MEMBER) => (await call(w.handler, '/api/chat/channels', { method: 'GET', as })).body.channels.find((c) => c.id === w.channelId);
const typing = (w, payload, as) => call(w.handler, `/api/chat/channels/${w.channelId}/typing`, { payload, as });

describe('the auto-post flag (OB11)', () => {
	it('hides the opt-in unless OSIONOS_AI_AUTOPOST and OSIONOS_THREAD_ANSWERS are exactly "on"', async () => {
		const envs = [{}, { OSIONOS_AI_AUTOPOST: 'on' }, { OSIONOS_THREAD_ANSWERS: 'on' }, { ...ON, OSIONOS_AI_AUTOPOST: 'On' }, { ...ON, OSIONOS_AI_AUTOPOST: 'true' }];
		for (const env of envs) {
			const w = world({ env, channel: { ai_autopost: true } });
			const result = await setAutopost(w, true);
			assert.deepEqual([result.status, result.body.message], [404, 'Chat route not found.'], JSON.stringify(env));
			assert.deepEqual(w.baas.writes, []);
			assert.equal(Object.hasOwn(await listed(w), 'aiAutopost'), false, 'the list shape is unchanged with the flag off');
		}
	});
});

describe('the channel opt-in (OB2)', () => {
	it('lists a channel as auto-posting only when its column is true', async () => {
		assert.equal((await listed(world({ channel: { ai_autopost: true } }))).aiAutopost, true);
		assert.equal((await listed(world({ channel: { ai_autopost: false } }))).aiAutopost, false);
		assert.equal((await listed(world())).aiAutopost, false, 'a missing column reads as false');
		assert.equal((await listed(world({ channel: { ai_autopost: true, kind: 'voice' } }))).aiAutopost, false, 'only text channels');
	});

	it('is set by a channel admin, and by nobody else', async () => {
		const w = world();
		const byMember = await setAutopost(w, true, MEMBER);
		assert.equal(byMember.status, 403);
		assert.equal((await setAutopost(w, true, w.asker)).status, 403);
		assert.deepEqual(w.baas.writes, []);
		const byAdmin = await setAutopost(w, true);
		assert.equal(byAdmin.status, 200);
		assert.equal(byAdmin.body.channel.aiAutopost, true);
		assert.deepEqual(w.baas.writes.map((write) => [write.table, write.method, write.body.ai_autopost]), [['osionos_channels', 'PATCH', true]]);
		assert.equal((await setAutopost(w, false)).body.channel.aiAutopost, false);
		assert.equal(w.baas.tables.osionos_channels[0].ai_autopost, false);
	});

	it('refuses a non-boolean value and a channel that is not text, writing nothing', async () => {
		for (const enabled of ['true', 1, null, undefined]) {
			const w = world();
			assert.equal((await setAutopost(w, enabled)).status, 422, String(enabled));
			assert.deepEqual(w.baas.writes, []);
		}
		for (const kind of ['dm', 'voice', 'video', 'group']) {
			const w = world({ channel: { kind } });
			w.baas.tables.osionos_channel_members[0].role = 'owner';
			const result = await setAutopost(w, true);
			assert.deepEqual([result.status, result.body.code], [422, 'autopost_text_only'], kind);
			assert.deepEqual(w.baas.writes, []);
		}
	});

	it('answers 503 autopost_unavailable on a database without the column (deploy order)', async () => {
		const w = world({ missingColumns: ['ai_autopost'] });
		const result = await setAutopost(w, true);
		assert.deepEqual([result.status, result.body.code], [503, 'autopost_unavailable']);
	});
});

describe('an auto-posted answer (OB1, OB5)', () => {
	it('goes through the same post route, as the AI, with no mention and no notification', async () => {
		const w = world({ channel: { ai_autopost: true } });
		const result = await call(w.handler, `/api/chat/channels/${w.channelId}/ai-answers`, { payload: { runId: w.runId }, as: w.asker });
		assert.equal(result.status, 201);
		const row = w.baas.tables.osionos_messages.find((message) => message.author_id === AI_BOT_AUTHOR);
		assert.deepEqual([row.ai_requested_by, row.ai_run_id], [w.asker, w.runId]);
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(w.baas.writes.map((write) => write.table), ['osionos_messages'], 'no mention row, no notification for "@Bob"');
		assert.deepEqual(w.baas.frames.at(-1).payload.mentions, []);
	});
});

describe('"osio is answering" (OB12)', () => {
	it('publishes a textless ai typing event in an auto-post channel', async () => {
		const w = world({ channel: { ai_autopost: true } });
		const result = await typing(w, { ai: true, text: 'partial answer' }, w.asker);
		assert.equal(result.status, 200);
		const frame = w.baas.frames.at(-1);
		assert.equal(frame.event_type, 'typing');
		assert.deepEqual(frame.payload, { channelId: w.channelId, ai: true });
		assert.deepEqual(w.baas.writes, [], 'no pending bot row');
	});

	it('stays the plain typing event off the flag, off the channel opt-in, or without a body', async () => {
		for (const [env, channel, payload] of [[{}, { ai_autopost: true }, { ai: true }], [ON, { ai_autopost: false }, { ai: true }], [ON, { ai_autopost: true }, undefined]]) {
			const w = world({ env, channel });
			assert.equal((await typing(w, payload, w.asker)).status, 200);
			assert.deepEqual(w.baas.frames.at(-1).payload, { channelId: w.channelId, userId: w.asker });
		}
	});
});
