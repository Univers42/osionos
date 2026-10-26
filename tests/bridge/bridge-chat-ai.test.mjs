/**
 * "@AI" answers posted to a text channel (C429, bridge half): the asker posts
 * the one stored answer of their own thread run, as the AI bot. The cases run
 * the real chat handler over an in-memory PostgREST, so "nothing was written"
 * is an assertion on the fake's state.
 *
 * Caveat: the fake models eq / neq / in / is.null / or filters and ignores the
 * rest (wfts search, ranges), so a filter the handlers add later passes every
 * row here; the writes and the refusals are what the cases pin.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createChatHandler } from '../../scripts/bridge-chat.mjs';
import { AI_BOT_AUTHOR } from '../../scripts/bridge-chat-ai.mjs';
import { handleReportRoutes } from '../../scripts/bridge-reports.mjs';

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const ANSWER = 'The team chose Friday for the release.';
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const MINUTE = 60_000;
const TERM = readFileSync(new URL('../../scripts/moderation-lists/en.txt', import.meta.url), 'utf8')
	.split('\n').map((line) => line.trim()).find((term) => /^[a-z]{4,}$/.test(term));

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
	const list = (raw) => raw.split(',').map((item) => item.replace(/^"|"$/g, ''));
	if (value.startsWith('eq.')) return String(cell) === value.slice(3);
	if (value.startsWith('neq.')) return String(cell) !== value.slice(4);
	if (value === 'is.null') return cell == null;
	if (value.startsWith('in.(')) return list(value.slice(4, -1)).includes(String(cell));
	if (value.startsWith('not.in.(')) return !list(value.slice(8, -1)).includes(String(cell));
	return true;
}

/** An in-memory PostgREST over the tables the chat, AI-answer and report routes touch. */
function fakeBaas(tables) {
	const writes = [];
	const frames = [];
	const reads = [];
	const answer = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (!parsed.pathname.startsWith('/rest/v1/')) {
			frames.push(JSON.parse(init.body ?? 'null'));
			return answer({});
		}
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const params = [...parsed.searchParams.entries()];
		const rows = (tables[table] ??= []);
		const selected = () => rows.filter((row) => params.every(([key, value]) => matches(row, key, value)));
		if (method === 'GET') {
			reads.push({ table, query: decodeURIComponent(parsed.search) });
			const order = parsed.searchParams.get('order');
			const found = selected();
			if (order === 'created_at.desc') found.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
			if (order === 'created_at.asc') found.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
			return answer(found);
		}
		const body = init.body ? JSON.parse(init.body) : null;
		writes.push({ table, method, body });
		if (method === 'PATCH') {
			const changed = selected();
			for (const row of changed) Object.assign(row, body);
			return answer(changed);
		}
		const inserted = [];
		for (const item of Array.isArray(body) ? body : [body]) {
			if (table === 'osionos_messages' && item.ai_run_id && rows.some((row) => row.ai_run_id === item.ai_run_id)) {
				return answer({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_messages_ai_run_id_key"' }, 409);
			}
			const row = { id: randomUUID(), created_at: new Date().toISOString(), deleted_at: null, edited_at: null, ...item };
			rows.push(row);
			inserted.push(row);
		}
		return answer(inserted, 201);
	};
	return { fetchImpl, writes, frames, reads, tables };
}

/**
 * A text channel where the asker said "@ai" and their thread run answered. Each
 * world has its own asker: the bridge's message bucket is per user and per process.
 */
function world({ channel = {}, run = {}, trigger = {}, env = {}, answerParts } = {}) {
	const asker = randomUUID();
	const channelId = randomUUID();
	const triggerId = randomUUID();
	const runId = randomUUID();
	const answerId = randomUUID();
	const baas = fakeBaas({
		osionos_channels: [{ id: channelId, workspace_id: WORKSPACE, kind: 'text', name: 'general', is_private: false, ...channel }],
		osionos_channel_members: [{ channel_id: channelId, user_id: ADMIN, role: 'admin' }],
		osionos_workspace_members: [asker, MEMBER, ADMIN].map((user_id) => ({ workspace_id: WORKSPACE, user_id, role: 'member', permissions: [] })),
		osionos_people_directory: [[asker, 'Ada'], [MEMBER, 'Bob'], [ADMIN, 'Cy']].map(([user_id, display_name]) => ({ user_id, display_name, profile: {} })),
		osionos_messages: [{
			id: triggerId, channel_id: channelId, author_id: asker, content: '@ai what did we decide?',
			created_at: ago(2 * MINUTE), deleted_at: null, edited_at: null, thread_root_id: null, ...trigger,
		}],
		ai_runs: [{
			id: runId, owner_id: asker, status: 'succeeded', finish_reason: 'stop', created_at: ago(MINUTE), ended_at: ago(MINUTE / 2),
			surface: 'channel', surface_ref: { channelId, messageId: triggerId }, answer_message_id: answerId, ...run,
		}],
		ai_messages: [{ id: answerId, run_id: runId, role: 'assistant', parts: answerParts ?? [{ type: 'text', text: ANSWER }] }],
	});
	const handler = createChatHandler({
		config: CONFIG,
		verifySession: (token) => ({ userId: token }),
		fetchImpl: baas.fetchImpl,
		env: { OSIONOS_THREAD_ANSWERS: 'on', REALTIME_PUBLISH_URL: 'http://realtime.test', ...env },
	});
	return { baas, handler, asker, channelId, triggerId, runId };
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

const post = (w, payload = { runId: w.runId }, as = w.asker) => call(w.handler, `/api/chat/channels/${w.channelId}/ai-answers`, { payload, as });
const messageWrites = (w) => w.baas.writes.filter((write) => write.table === 'osionos_messages');
const posted = (w) => w.baas.tables.osionos_messages.find((row) => row.author_id === AI_BOT_AUTHOR);

describe('posting an @AI answer', () => {
	it('is the chat 404 with the flag off, and writes nothing (C450)', async () => {
		const w = world({ env: { OSIONOS_THREAD_ANSWERS: undefined } });
		const result = await post(w);
		assert.equal(result.status, 404);
		assert.equal(result.body.message, 'Chat route not found.');
		assert.deepEqual(w.baas.writes, []);
	});

	it('posts the run\'s stored answer as the AI, never the client\'s text (C432, C436, C445, C451)', async () => {
		const w = world();
		const result = await post(w, { runId: w.runId, content: 'something else entirely' });
		assert.equal(result.status, 201);
		const row = posted(w);
		assert.equal(row.content, ANSWER);
		assert.equal(row.ai_run_id, w.runId);
		assert.equal(row.ai_requested_by, w.asker);
		assert.equal(row.reply_to_id, w.triggerId);
		assert.equal(row.thread_root_id, w.triggerId);
		assert.equal(result.body.message.authorName, 'AI');
		assert.equal(result.body.message.isAi, true);
		const frame = w.baas.frames.at(-1);
		assert.equal(frame.payload.authorName, 'AI');
		assert.deepEqual(frame.payload.aiRequestedBy, { id: w.asker, name: 'Ada' });
		assert.deepEqual(w.baas.writes.map((write) => write.table), ['osionos_messages'], 'no mention, no notification (C438)');
	});

	it('refuses someone else\'s run, an ordinary run and another channel\'s run (C430)', async () => {
		const other = randomUUID();
		for (const run of [{ owner_id: MEMBER }, { surface: null, surface_ref: null }, { surface_ref: { channelId: other, messageId: randomUUID() } }]) {
			const w = world({ run });
			const result = await post(w);
			assert.deepEqual([result.status, result.body.code], [404, 'not_found'], JSON.stringify(run));
			assert.deepEqual(messageWrites(w), []);
		}
	});

	it('refuses a run that did not end well and recently (C431)', async () => {
		const cases = [
			[{ status: 'failed' }, 'answer_not_ready'],
			[{ status: 'cancelled' }, 'answer_not_ready'],
			[{ status: 'running', ended_at: null }, 'answer_not_ready'],
			[{ finish_reason: 'awaiting_approval' }, 'answer_not_ready'],
			[{ ended_at: ago(31 * MINUTE) }, 'answer_stale'],
		];
		for (const [run, code] of cases) {
			const w = world({ run });
			const result = await post(w);
			assert.deepEqual([result.status, result.body.code], [409, code], JSON.stringify(run));
			assert.deepEqual(messageWrites(w), []);
		}
	});

	it('refuses a run whose answer is not its own one assistant message (C432)', async () => {
		for (const options of [{ run: { answer_message_id: null } }, { answerParts: [] }, { run: { answer_message_id: randomUUID() } }]) {
			const w = world(options);
			const result = await post(w);
			assert.deepEqual([result.status, result.body.code], [409, 'answer_not_ready'], JSON.stringify(options));
			assert.deepEqual(messageWrites(w), []);
		}
	});

	it('refuses when the trigger was deleted or edited after the run, or the asker left (C443)', async () => {
		for (const trigger of [{ deleted_at: ago(10_000) }, { edited_at: ago(10_000) }]) {
			const w = world({ trigger });
			const result = await post(w);
			assert.deepEqual([result.status, result.body.code], [409, 'trigger_changed'], JSON.stringify(trigger));
			assert.deepEqual(messageWrites(w), []);
		}
		const edited = world({ trigger: { edited_at: ago(5 * MINUTE) } });
		assert.equal((await post(edited)).status, 201, 'an edit BEFORE the run is the text the run read');
		const left = world({ channel: { is_private: true } });
		assert.equal((await post(left)).status, 403);
		assert.deepEqual(messageWrites(left), []);
	});

	it('applies the channel rules in full, with no "post anyway" (C444)', async () => {
		const w = world({ answerParts: [{ type: 'text', text: `what a ${TERM} you are` }], env: { OSIONOS_MODERATION_ACTIONS: 'log' } });
		const result = await post(w, { runId: w.runId, acknowledgeWarning: true });
		assert.deepEqual([result.status, result.body.code], [409, 'answer_blocked']);
		assert.deepEqual(messageWrites(w), []);
	});

	it('posts a run once, also when two posts race (C445)', async () => {
		const w = world();
		const results = await Promise.all([post(w), post(w)]);
		assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
		assert.equal(results.find((result) => result.status === 409).body.code, 'already_posted');
		assert.equal((await post(w)).body.code, 'already_posted');
		assert.equal(w.baas.tables.osionos_messages.filter((row) => row.author_id === AI_BOT_AUTHOR).length, 1);
	});

	it('refuses a dm, voice or video channel even to its member (C452)', async () => {
		for (const kind of ['dm', 'voice', 'video']) {
			const w = world({ channel: { kind } });
			w.baas.tables.osionos_channel_members.push({ channel_id: w.channelId, user_id: w.asker, role: 'member' });
			const result = await post(w);
			assert.deepEqual([result.status, result.body.code], [404, 'not_found'], kind);
			assert.deepEqual(messageWrites(w), []);
		}
	});
});

describe('a posted @AI answer', () => {
	async function postedWorld() {
		const w = world();
		assert.equal((await post(w)).status, 201);
		return { ...w, answerId: posted(w).id };
	}

	it('reads as "AI" in the list, the thread, the search and a reply quote (C436)', async () => {
		const w = await postedWorld();
		const list = await call(w.handler, `/api/chat/channels/${w.channelId}/messages`, { method: 'GET', as: MEMBER });
		const fromList = list.body.messages.find((message) => message.id === w.answerId);
		assert.deepEqual([fromList.authorName, fromList.isAi, fromList.aiRequestedBy], ['AI', true, w.asker]);
		const thread = await call(w.handler, `/api/chat/threads/${w.triggerId}`, { method: 'GET', as: MEMBER });
		assert.equal(thread.body.messages.find((message) => message.id === w.answerId).authorName, 'AI');
		const search = await call(w.handler, `/api/chat/search?q=friday&channelId=${w.channelId}`, { method: 'GET', as: MEMBER });
		assert.equal(search.body.hits.find((hit) => hit.messageId === w.answerId).authorName, 'AI');
		const reply = await call(w.handler, `/api/chat/channels/${w.channelId}/messages`, { payload: { content: 'thanks', replyTo: w.answerId }, as: MEMBER });
		assert.equal(reply.status, 201);
		assert.equal(reply.body.message.replyTo.authorName, 'AI');
	});

	it('notifies nobody when a person replies to it or writes "@ai" (C438)', async () => {
		const w = await postedWorld();
		await call(w.handler, `/api/chat/channels/${w.channelId}/messages`, { payload: { content: '@ai @assistant nice', replyTo: w.answerId }, as: MEMBER });
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(w.baas.writes.filter((write) => write.table === 'osionos_notifications' || write.table.startsWith('osionos_message_mentions')), []);
		assert.ok(!w.baas.reads.some((read) => read.table === 'osionos_bridge_identities'), 'the AI handles are never looked up as people');
	});

	it('is deleted by its requester or a channel admin, by nobody else, and edited by nobody (C437)', async () => {
		const byMember = await postedWorld();
		assert.equal((await call(byMember.handler, `/api/chat/messages/${byMember.answerId}`, { method: 'DELETE', as: MEMBER })).status, 403);
		assert.equal((await call(byMember.handler, `/api/chat/messages/${byMember.answerId}`, { method: 'PATCH', payload: { content: 'edited' }, as: byMember.asker })).status, 403);
		assert.equal(posted(byMember).deleted_at, null);
		for (const who of ['asker', 'admin']) {
			const w = await postedWorld();
			const as = who === 'asker' ? w.asker : ADMIN;
			assert.equal((await call(w.handler, `/api/chat/messages/${w.answerId}`, { method: 'DELETE', as })).status, 200, who);
			assert.notEqual(posted(w).deleted_at, null);
			assert.equal(w.baas.frames.at(-1).payload.authorId, AI_BOT_AUTHOR);
		}
	});

	it('is reported with no subject person: its requester did not write it (C439)', async () => {
		const w = await postedWorld();
		const captured = {};
		const response = { writeHead: (status) => { captured.status = status; }, setHeader() {}, end: (text) => { captured.body = JSON.parse(text); } };
		await handleReportRoutes(
			{ fetchImpl: w.baas.fetchImpl, env: {} },
			{ userId: MEMBER },
			jsonRequest('POST', { subjectKind: 'message', subjectId: w.answerId, category: 'other' }, MEMBER),
			response,
			CONFIG,
		);
		assert.equal(captured.status, 201);
		const report = w.baas.writes.find((write) => write.table === 'osionos_user_reports');
		assert.equal(report.body.subject_user_id, null);
	});
});
