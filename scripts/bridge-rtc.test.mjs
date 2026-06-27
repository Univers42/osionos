/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-rtc.test.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * LIVE standalone test for bridge-rtc.mjs — runs INSIDE the osionos-bridge
 * container (needs LIVEKIT_* env + in-network reachability of livekit/kong),
 * NOT part of the offline `tests/bridge` suite:
 *
 *   docker cp apps/osionos/app/scripts/bridge-rtc.mjs       track-binocle-osionos-bridge-1:/tmp/rtc/
 *   docker cp apps/osionos/app/scripts/bridge-rtc.test.mjs  track-binocle-osionos-bridge-1:/tmp/rtc/
 *   docker exec track-binocle-osionos-bridge-1 node /tmp/rtc/bridge-rtc.test.mjs
 *
 * Proves: (1) HS256 token mints + verifies, (2) LiveKit ACCEPTS the JWT —
 * twirp RoomService/ListRooms succeeds with an admin grant and rejects a
 * tampered signature, (3) the ABAC hook allows an agency member and denies a
 * stranger, (4) the full POST /api/rtc/token handler works end-to-end with a
 * real app-session bearer token.
 *
 * Fixture overrides: RTC_TEST_WORKSPACE_ID / RTC_TEST_MEMBER_ID (defaults are
 * the seeded agency org + its owner, tools/seeds/.agency-people.env).
 */

import { createServer } from 'node:http';
import { authorizeRtcJoin, createRtcTokenHandler, mintLivekitToken, rtcConfigFromEnv, verifyLivekitToken } from '/tmp/rtc/bridge-rtc.mjs';
import { configFromEnv, signAppSessionToken, verifyAppSessionToken } from '/app/scripts/bridge-api.mjs';

const WORKSPACE_ID = process.env.RTC_TEST_WORKSPACE_ID ?? 'b1a0c1e5-0000-4000-a000-000000000001';
const MEMBER_ID = process.env.RTC_TEST_MEMBER_ID ?? 'faf9aeda-e21e-42ab-80be-9ce0fd8662a1';
const STRANGER_ID = '0b7e1c9a-1111-4eee-8aaa-deadbeef0042';

const rtc = rtcConfigFromEnv();
const config = configFromEnv();
let failures = 0;

function check(label, condition, detail = '') {
	const status = condition ? 'PASS' : 'FAIL';
	if (!condition) failures += 1;
	console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function listRooms(jwt) {
	const response = await fetch(`${rtc.url}/twirp/livekit.RoomService/ListRooms`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
		body: '{}',
	});
	return { status: response.status, body: await response.json().catch(() => null) };
}

// 1. Token mints and round-trips through verifyLivekitToken.
const { token } = mintLivekitToken({
	apiKey: rtc.apiKey,
	apiSecret: rtc.apiSecret,
	identity: MEMBER_ID,
	name: 'Helena Voss',
	room: 'rtc-test-room',
	ttlSeconds: 600,
});
const decoded = verifyLivekitToken(token, rtc.apiSecret);
check('token mints + verifies (HS256)', decoded.iss === rtc.apiKey && decoded.sub === MEMBER_ID
	&& decoded.video?.room === 'rtc-test-room' && decoded.video?.roomJoin === true
	&& decoded.exp - decoded.iat === 600, `sub=${decoded.sub} room=${decoded.video?.room}`);

// 2. LiveKit accepts the JWT: admin roomList grant → twirp ListRooms 200.
const admin = mintLivekitToken({ apiKey: rtc.apiKey, apiSecret: rtc.apiSecret, identity: 'rtc-test-admin', grants: { roomList: true }, ttlSeconds: 300 });
const accepted = await listRooms(admin.token);
check('LiveKit accepts admin JWT (ListRooms 200)', accepted.status === 200 && accepted.body !== null, `status=${accepted.status} body=${JSON.stringify(accepted.body)}`);
const forged = await listRooms(`${admin.token.slice(0, -4)}AAAA`);
check('LiveKit rejects a tampered signature', forged.status === 401, `status=${forged.status}`);

// 3. ABAC hook: agency member allowed, stranger denied (osionos_workspace_members).
const membership = await authorizeRtcJoin({ userId: MEMBER_ID, channelId: 'general', workspaceId: WORKSPACE_ID, config });
check('ABAC allows agency workspace member', membership.workspaceId === WORKSPACE_ID && Boolean(membership.role), `role=${membership.role}`);
const denied = await authorizeRtcJoin({ userId: STRANGER_ID, channelId: 'general', workspaceId: WORKSPACE_ID, config }).then(() => null, (error) => error);
check('ABAC denies non-member (403)', denied?.status === 403, denied?.message ?? 'no error raised');

// 4. Full handler: POST /api/rtc/token with a real app-session bearer token.
const handler = createRtcTokenHandler({ config, verifySession: verifyAppSessionToken, rtc });
const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? '/', 'http://127.0.0.1');
	if (!(await handler(url, request, response))) {
		response.writeHead(404).end();
	}
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const session = signAppSessionToken({
	payload: { subject: MEMBER_ID, provider: 'prismatica' },
	workspace: { _id: WORKSPACE_ID },
	config,
});

async function postToken(body, bearer) {
	const response = await fetch(`http://127.0.0.1:${port}/api/rtc/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
		body: JSON.stringify(body),
	});
	return { status: response.status, body: await response.json().catch(() => null) };
}

const granted = await postToken({ channelId: 'general', room: 'agency-standup', displayName: 'Helena Voss' }, session.token);
const grantedPayload = granted.status === 200 ? verifyLivekitToken(granted.body.token, rtc.apiSecret) : null;
check('POST /api/rtc/token issues a joinable token', granted.status === 200 && granted.body?.ok === true
	&& grantedPayload?.sub === MEMBER_ID && grantedPayload?.video?.room === 'agency-standup'
	&& typeof granted.body?.url === 'string', `status=${granted.status} url=${granted.body?.url}`);
const unauthorized = await postToken({ channelId: 'general', room: 'agency-standup' }, undefined);
check('POST /api/rtc/token without bearer → 401', unauthorized.status === 401, `status=${unauthorized.status}`);
const strangerSession = signAppSessionToken({
	payload: { subject: STRANGER_ID, provider: 'prismatica' },
	workspace: { _id: WORKSPACE_ID },
	config,
});
const forbidden = await postToken({ channelId: 'general', room: 'agency-standup' }, strangerSession.token);
check('POST /api/rtc/token for non-member → 403', forbidden.status === 403, `status=${forbidden.status}`);

server.close();
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
