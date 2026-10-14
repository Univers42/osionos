/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-rtc-room.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { IDS, createPostgrestMock, harnessConfig } from './support/bridge-harness.mjs';
import { createRtcTokenHandler } from '../../scripts/bridge-rtc.mjs';

const VICTIM_ROOM_CHANNEL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OWN_CHANNEL = IDS.privateA;
const OTHER_CHANNEL = IDS.sharedA;
const MISSING_CHANNEL = IDS.memoA;
const FAIL_CHANNEL = IDS.sharedMemoA;

const OWN_USER = IDS.userA;
const OWN_WS = IDS.team;
const OTHER_WS = IDS.homeB;

const config = harnessConfig();

const { fetchImpl } = createPostgrestMock(
	{
		osionos_channels: [
			{ id: OWN_CHANNEL, workspace_id: OWN_WS },
			{ id: OTHER_CHANNEL, workspace_id: OTHER_WS },
		],
		osionos_workspace_members: [
			{ workspace_id: OWN_WS, user_id: OWN_USER, role: 'member', permissions: ['read'] },
		],
	},
	{
		failWhen: (call) => {
			if (call.table === 'osionos_channels' && String(call.params).includes(FAIL_CHANNEL)) {
				return { status: 500, body: { message: 'boom' } };
			}
			return null;
		},
	},
);

const verifySession = (token) => {
	if (token !== 'good-token') throw Object.assign(new Error('unauthorized'), { status: 401 });
	return { userId: OWN_USER, workspaceIds: [OWN_WS] };
};

const rtc = { apiKey: 'k', apiSecret: 's'.repeat(32), clientUrl: 'ws://x', tokenTtlSeconds: 60 };

const handler = createRtcTokenHandler({ config, verifySession, rtc, fetchImpl });

let server;
let port;

before(async () => {
	server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		const handled = await handler(url, req, res);
		if (!handled) { res.writeHead(404); res.end(); }
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	port = server.address().port;
});

after(() => { server?.close(); });

async function postToken(body) {
	const res = await fetch(`http://127.0.0.1:${port}/api/rtc/token`, {
		method: 'POST',
		headers: { authorization: 'Bearer good-token', 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : null };
}

function decodeJwt(token) {
	return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
}

describe('RTC token room is derived only from the checked channel', () => {
	it('T1 own workspace, channelId general, room victim -> 200 and video.room channel-general', async () => {
		const { status, body } = await postToken({ channelId: 'general', room: `channel-${VICTIM_ROOM_CHANNEL}`, workspaceId: OWN_WS });
		assert.equal(status, 200);
		assert.equal(body?.ok, true);
		const claims = decodeJwt(body.token);
		assert.equal(claims.video.room, 'channel-general');
	});

	it('T2 channelId UUID another workspace, member only own -> 403', async () => {
		const { status, body } = await postToken({ channelId: OTHER_CHANNEL, workspaceId: OWN_WS });
		assert.equal(status, 403);
		assert.ok(!body?.token);
	});

	it('T3 channelId UUID no row -> 404, no token', async () => {
		const { status, body } = await postToken({ channelId: MISSING_CHANNEL, workspaceId: OWN_WS });
		assert.equal(status, 404);
		assert.ok(!body?.token);
	});

	it('T4 channelId UUID lookup 500 -> non-200, no token', async () => {
		const { status, body } = await postToken({ channelId: FAIL_CHANNEL, workspaceId: OWN_WS });
		assert.notEqual(status, 200);
		assert.ok(!body?.token);
	});

	it('T6 a UUID spelled with spaces cannot be sanitised into another channel\'s room -> 422, no token', async () => {
		const disguised = OTHER_CHANNEL.replaceAll('-', ' ');
		const { status, body } = await postToken({ channelId: disguised, workspaceId: OWN_WS });
		assert.equal(status, 422);
		assert.ok(!body?.token);
	});

	it('T5 channelId UUID own workspace -> 200, video.room channel-<uuid>', async () => {
		const { status, body } = await postToken({ channelId: OWN_CHANNEL, workspaceId: OWN_WS });
		assert.equal(status, 200);
		assert.equal(body?.ok, true);
		const claims = decodeJwt(body.token);
		assert.equal(claims.video.room, `channel-${OWN_CHANNEL}`);
	});
});