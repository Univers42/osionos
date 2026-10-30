/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-attachment-delete.test.mjs             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #177: deleting a chat message deletes the files uploaded with it. Before, the
// message was soft-deleted but its attachment rows stayed, so the file was still
// in the channel's media gallery and still served to every member.
// The second block pins the access control the issue asks for: only the members
// of a private channel upload to it or read what was sent there.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createChatHandler } from '../../scripts/bridge-chat.mjs';

const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const OTHER = '44444444-4444-4444-8444-444444444444';
const CHANNEL = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const KEPT_MESSAGE = '66666666-6666-4666-8666-666666666666';
const ATTACHMENT = '77777777-7777-4777-8777-777777777777';
const KEY = `${'a'.repeat(64)}.png`;

const attachment = (id, messageId) => ({
	id, message_id: messageId, channel_id: CHANNEL, owner_id: AUTHOR, type: 'image', bucket: 'chat',
	object_key: KEY, sha256: 'a'.repeat(64), display_name: 'plan.png', size: 10, content_type: 'image/png',
});
const message = (id) => ({ id, channel_id: CHANNEL, author_id: AUTHOR, content: 'see attached', deleted_at: null, attachments: [] });

/** PostgREST with eq filters and DELETE, plus the storage router; records every storage object call. */
function fakeBaas(tables, { storageStatus = 200 } = {}) {
	const storageCalls = [];
	const answer = (data, status = 200) => ({
		ok: status < 400, status, text: async () => JSON.stringify(data),
		arrayBuffer: async () => new TextEncoder().encode('stored bytes').buffer, headers: new Headers({ 'content-type': 'image/png' }),
	});
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		if (parsed.pathname.startsWith('/storage/v1/object/')) {
			storageCalls.push({ method, path: parsed.pathname, owner: init.headers?.['x-user-id'] });
			return answer({}, storageStatus);
		}
		if (!parsed.pathname.startsWith('/rest/v1/')) return answer({});
		const rows = (tables[parsed.pathname.replace('/rest/v1/', '')] ??= []);
		const filters = [...parsed.searchParams.entries()].filter(([, value]) => value.startsWith('eq.'));
		const hit = (row) => filters.every(([key, value]) => String(row[key]) === value.slice(3));
		const found = rows.filter(hit);
		if (method === 'PATCH') for (const row of found) Object.assign(row, JSON.parse(init.body));
		if (method === 'DELETE') for (const row of found) rows.splice(rows.indexOf(row), 1);
		return answer(found);
	};
	return { fetchImpl, storageCalls, tables };
}

function world(options, { isPrivate = false } = {}) {
	const baas = fakeBaas({
		osionos_channels: [{ id: CHANNEL, workspace_id: CHANNEL, kind: 'text', name: 'room', is_private: isPrivate, created_by: AUTHOR }],
		osionos_channel_members: [{ channel_id: CHANNEL, user_id: AUTHOR, role: 'member' }],
		osionos_messages: [message(MESSAGE), message(KEPT_MESSAGE)],
		osionos_message_attachments: [attachment(ATTACHMENT, MESSAGE)],
	}, options ?? {});
	const handler = createChatHandler({
		config: CONFIG,
		verifySession: (token) => ({ userId: token }),
		fetchImpl: baas.fetchImpl,
		env: { REALTIME_PUBLISH_URL: 'http://realtime.test', STORAGE_ROUTER_URL: 'http://storage.test/storage/v1' },
	});
	return { baas, handler };
}

async function call(handler, path, { method, as, raw = false }) {
	const captured = {};
	const response = {
		writeHead: (status, headers) => { captured.status = status; captured.headers = headers; },
		setHeader() {},
		end: (text) => { captured.body = text && !raw ? JSON.parse(text) : text ?? null; },
	};
	const request = { method, headers: { authorization: `Bearer ${as}` }, async *[Symbol.asyncIterator]() {} };
	await handler(new URL(`http://bridge.test${path}`), request, response, CONFIG);
	return captured;
}

const deleteMessage = (w, as = AUTHOR) => call(w.handler, `/api/chat/messages/${MESSAGE}`, { method: 'DELETE', as });
const attachmentRows = (w) => w.baas.tables.osionos_message_attachments;

describe('deleting a message deletes its uploaded files', () => {
	it('drops the attachment row and the stored object, and the file is no longer served', async () => {
		const w = world();
		assert.equal((await deleteMessage(w)).status, 200);
		assert.deepEqual(attachmentRows(w), []);
		assert.deepEqual(w.baas.storageCalls, [{ method: 'DELETE', path: `/storage/v1/object/chat/${KEY}`, owner: AUTHOR }]);
		const served = await call(w.handler, `/api/chat/uploads/${ATTACHMENT}`, { method: 'GET', as: AUTHOR });
		assert.equal(served.status, 404);
	});

	it('keeps the stored object while another message of the same owner still carries the same bytes', async () => {
		const w = world();
		attachmentRows(w).push(attachment('88888888-8888-4888-8888-888888888888', KEPT_MESSAGE));
		assert.equal((await deleteMessage(w)).status, 200);
		assert.deepEqual(attachmentRows(w).map((row) => row.message_id), [KEPT_MESSAGE]);
		assert.deepEqual(w.baas.storageCalls, []);
	});

	it('clears the attachments the deleted message row carried', async () => {
		const w = world();
		w.baas.tables.osionos_messages[0].attachments = [{ id: ATTACHMENT, url: `/api/chat/uploads/${ATTACHMENT}` }];
		await deleteMessage(w);
		assert.deepEqual(w.baas.tables.osionos_messages[0].attachments, []);
	});

	it('still deletes the message when the storage router refuses; the row is gone, so nothing serves the file', async () => {
		const w = world({ storageStatus: 500 });
		assert.equal((await deleteMessage(w)).status, 200);
		assert.notEqual(w.baas.tables.osionos_messages[0].deleted_at, null);
		assert.deepEqual(attachmentRows(w), []);
	});

	it('a member who is not the author deletes nothing', async () => {
		const w = world();
		assert.equal((await deleteMessage(w, OTHER)).status, 403);
		assert.equal(attachmentRows(w).length, 1);
		assert.deepEqual(w.baas.storageCalls, []);
	});
});

describe('only the members of a private channel reach its files', () => {
	const privateWorld = () => world(undefined, { isPrivate: true });
	const upload = (w, as) => call(w.handler, `/api/chat/uploads?channelId=${CHANNEL}&name=plan.png&type=image`, { method: 'POST', as });

	it('a non-member cannot upload to it, and nothing reaches storage', async () => {
		const w = privateWorld();
		assert.equal((await upload(w, OTHER)).status, 403);
		assert.deepEqual(w.baas.storageCalls, []);
		assert.equal(attachmentRows(w).length, 1);
	});

	it('a non-member cannot read a file sent there; a member gets it with the no-sniff headers', async () => {
		const w = privateWorld();
		const path = `/api/chat/uploads/${ATTACHMENT}`;
		assert.equal((await call(w.handler, path, { method: 'GET', as: OTHER })).status, 403);
		const served = await call(w.handler, path, { method: 'GET', as: AUTHOR, raw: true });
		assert.equal(served.status, 200);
		assert.equal(served.headers['x-content-type-options'], 'nosniff');
		assert.match(served.headers['content-security-policy'], /sandbox/);
	});
});
