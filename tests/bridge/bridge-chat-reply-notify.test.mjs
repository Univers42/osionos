/**
 * A chat reply must not notify a quoted author who lost the channel (removed
 * from a private channel, or from the workspace): the reply notification is
 * queued only when the quoted author still has channel access, and the check
 * rides the fire-and-forget emit so the POST answer never waits on it.
 *
 * The cases run the real chat handler over an in-memory PostgREST, so the
 * notification is an assertion on the fake's writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createChatHandler } from '../../scripts/bridge-chat.mjs';

const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '22222222-2222-4222-8222-222222222222'; // the quoted author, i.e. the reply author
const REPLIER = '44444444-4444-4444-8444-444444444444'; // the member who replied
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const MINUTE = 60_000;
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

/**
 * An in-memory PostgREST over the tables the chat handler reads and writes: a
 * select naming one of missingColumns is PostgREST's 400 for a column the database
 * does not have yet.
 */
function fakeBaas(tables, { missingColumns = [] } = {}) {
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
			const named = (parsed.searchParams.get('select') ?? '').split(',');
			const missing = missingColumns.find((column) => named.includes(column));
			if (missing) return answer({ code: '42703', message: `column ${table}.${missing} does not exist` }, 400);
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
 * A text channel and the quoted message: who replied to whom, and whether the
 * reply author is still a member (private channel) / workspace member (public).
 */
function world({ isPrivate = true, replyAuthorInChannel = true, replyAuthorInWorkspace = true, content = 'sounds good', env = {} } = {}) {
	const channelId = randomUUID();
	const replyToId = randomUUID();
	const baas = fakeBaas({
		osionos_channels: [{ id: channelId, workspace_id: WORKSPACE, kind: 'text', name: 'the-room', is_private: isPrivate, created_by: REPLIER, topic: null, description: null, avatar: null, created_at: ago(60_000), updated_at: null }],
		osionos_channel_members: [
			{ channel_id: channelId, user_id: REPLIER, role: 'member' },
			...(replyAuthorInChannel ? [{ channel_id: channelId, user_id: AUTHOR, role: 'member' }] : []),
		],
		osionos_workspace_members: [
			{ workspace_id: WORKSPACE, user_id: REPLIER, role: 'member', permissions: [] },
			...(replyAuthorInWorkspace ? [{ workspace_id: WORKSPACE, user_id: AUTHOR, role: 'member', permissions: [] }] : []),
		],
		osionos_people_directory: [
			{ user_id: REPLIER, display_name: 'Cy', profile: {} },
			{ user_id: AUTHOR, display_name: 'Ada', profile: {} },
		],
		osionos_messages: [{
			id: replyToId, channel_id: channelId, author_id: AUTHOR, content: 'the original', created_at: ago(2 * MINUTE),
			deleted_at: null, edited_at: null, thread_root_id: null,
		}],
	}, { missingColumns: env.missingColumns });
	const handler = createChatHandler({
		config: CONFIG,
		verifySession: (token) => ({ userId: token }),
		fetchImpl: baas.fetchImpl,
		env: { OSIONOS_THREAD_ANSWERS: 'on', REALTIME_PUBLISH_URL: 'http://realtime.test', ...env },
	});
	return { baas, handler, channelId, replyToId };
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const postReply = (w, content = 'sounds good') => call(w.handler, `/api/chat/channels/${w.channelId}/messages`, {
	payload: { content, replyTo: w.replyToId },
	as: REPLIER,
});

const notificationRows = (w) => w.baas.writes
	.filter((write) => write.table === 'osionos_notifications')
	.flatMap((write) => (Array.isArray(write.body) ? write.body : [write.body]));
const replyNotifications = (w) => notificationRows(w).filter((notif) => notif.type === 'reply');

describe('a chat reply fan-out', () => {
	it('a. a private channel: the reply author who lost the channel gets no reply notification', async () => {
		const w = world({ isPrivate: true, replyAuthorInChannel: false });
		const result = await postReply(w);
		assert.equal(result.status, 201);
		await settle();
		assert.deepEqual(replyNotifications(w), []);
	});

	it('b. a private channel: the reply author who still has the channel gets exactly one reply notification', async () => {
		const w = world({ isPrivate: true, replyAuthorInChannel: true });
		const result = await postReply(w);
		assert.equal(result.status, 201);
		await settle();
		const replyNotifs = replyNotifications(w);
		assert.equal(replyNotifs.length, 1, 'exactly one reply notification for the quoted author');
		assert.equal(replyNotifs[0].user_id, AUTHOR);
		assert.equal(replyNotifs[0].type, 'reply');
	});

	it('c. a public channel: a reply author who is still a workspace member is notified', async () => {
		const w = world({ isPrivate: false, replyAuthorInChannel: false, replyAuthorInWorkspace: true });
		const result = await postReply(w);
		assert.equal(result.status, 201);
		await settle();
		assert.equal(replyNotifications(w).length, 1);
		assert.equal(replyNotifications(w)[0].user_id, AUTHOR);
	});

	it('d. a public channel: a reply author who left the workspace gets no reply notification', async () => {
		const w = world({ isPrivate: false, replyAuthorInChannel: false, replyAuthorInWorkspace: false });
		const result = await postReply(w);
		assert.equal(result.status, 201);
		await settle();
		assert.deepEqual(replyNotifications(w), []);
	});

	it('e. the reply POST answers without waiting on the quoted author’s access check', async () => {
		const w = world({ isPrivate: true, replyAuthorInChannel: false });
		const result = await postReply(w);
		assert.ok(result.status >= 200 && result.status < 300, `the reply POST answered ${result.status}`);
		await settle();
		assert.deepEqual(replyNotifications(w), []);
	});
});
