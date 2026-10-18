/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-logout.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// POST /api/auth/bridge/logout writes the caller's cut-off through PostgREST and answers 204 only after that write
// succeeded. The server runs on an injected clock, so the written timestamp is exact.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserSession, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, withBridge } from './support/bridge-harness.mjs';
import { createCutoffSource } from './support/cutoff-source.mjs';

const T = Date.parse('2026-10-19T12:00:00.000Z');
const PAYLOAD = validateBridgePayload({ provider: 'prismatica', subject: IDS.userA, email: 'a@example.com', name: 'A', jti: 'e7c1d2a0-0000-4000-8000-00000000c8c8' });
const PERSISTED = { workspaceId: IDS.homeA, workspaceName: 'Home', workspaceSlug: 'home' };
const LOGOUT = '/api/auth/bridge/logout';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const tokenAt = (config, issuedAtMs, subject = IDS.userA) =>
	createUserSession({ ...PAYLOAD, subject }, config, subject === IDS.userA ? PERSISTED : { workspaceId: IDS.homeB }, issuedAtMs).session.accessToken;
const bearer = (config, issuedAtMs, subject) => ({ authorization: `Bearer ${tokenAt(config, issuedAtMs, subject)}` });

/** PostgREST stub: the cut-off table is scripted (POST records the write and answers `writeAnswer`), everything else is the shared mock. */
function backend(rows = []) {
	const source = createCutoffSource(rows);
	const rest = createPostgrestMock();
	const stub = { writes: [], writeAnswer: () => new Response(null, { status: 201 }), source };
	stub.fetchImpl = async (url, init = {}) => {
		if (!String(url).includes('auth_session_cutoffs')) return rest.fetchImpl(url, init);
		if (init.method !== 'POST') return source.fetchImpl(url, init);
		const write = { url: new URL(String(url)), headers: init.headers, body: JSON.parse(init.body) };
		stub.writes.push(write);
		const answer = await stub.writeAnswer();
		if (answer.status < 300) source.rows = [...source.rows.filter((row) => row.user_id !== write.body.user_id), write.body];
		return answer;
	};
	return stub;
}

async function untilFresh(base) {
	for (let attempt = 0; attempt < 300; attempt += 1) {
		if ((await send(base, '/api/auth/bridge/health', {})).body.session_cutoffs === 'fresh') return;
		await sleep(10);
	}
	throw new Error('cut-offs never became fresh');
}

async function withLogout(stub, run) {
	const config = harnessConfig({ sessionCutoffs: 'on' });
	await withBridge(config, stub.fetchImpl, async (base) => { await untilFresh(base); return run(base, config); }, { now: () => T });
}

const logout = (base, headers, body) => send(base, LOGOUT, headers, { method: 'POST', body });

describe('logout writes the cut-off and signs the token out', () => {
	it('answers 204 with an empty body and upserts the injected clock for the token subject', async () => {
		const stub = backend();
		await withLogout(stub, async (base, config) => {
			const result = await logout(base, bearer(config, T - 1000));
			assert.deepEqual([result.status, result.text], [204, '']);
		});
		assert.equal(stub.writes.length, 1);
		const [write] = stub.writes;
		assert.equal(write.url.pathname, '/rest/v1/auth_session_cutoffs');
		assert.equal(write.url.searchParams.get('on_conflict'), 'user_id');
		assert.match(write.headers.Prefer, /resolution=merge-duplicates/);
		assert.deepEqual(write.body, { user_id: IDS.userA, sessions_valid_after: '2026-10-19T12:00:00.000Z' });
	});

	it('refuses a body naming another user with 400 and writes nothing', async () => {
		const stub = backend();
		await withLogout(stub, async (base, config) => {
			const result = await logout(base, bearer(config, T - 1000), JSON.stringify({ user_id: IDS.userB }));
			assert.deepEqual([result.status, result.body.code], [400, 'logout_body_not_allowed']);
		});
		assert.deepEqual(stub.writes, []);
	});

	it('uses the token subject alone: another user is untouched', async () => {
		const stub = backend();
		await withLogout(stub, async (base, config) => {
			await logout(base, bearer(config, T - 1000, IDS.userB));
			assert.equal((await send(base, '/api/favorites', bearer(config, T - 1000, IDS.userA))).status, 200);
		});
		assert.deepEqual(stub.writes.map((write) => write.body.user_id), [IDS.userB]);
	});

	it('refuses the same token the moment logout returns: a second logout is 401 and writes nothing', async () => {
		const stub = backend();
		await withLogout(stub, async (base, config) => {
			const headers = bearer(config, T - 1000);
			assert.equal((await logout(base, headers)).status, 204);
			const again = await logout(base, headers);
			assert.deepEqual([again.status, again.body.code], [401, 'session_revoked']);
			assert.equal((await send(base, '/api/favorites', headers)).status, 401);
			assert.equal((await send(base, '/api/favorites', bearer(config, T + 1))).status, 200);
		});
		assert.equal(stub.writes.length, 1);
	});

	it('keeps the sign-out through the next poll, which reads the written row back', async () => {
		const stub = backend();
		const config = harnessConfig({ sessionCutoffs: 'on' });
		await withBridge(config, stub.fetchImpl, async (base) => {
			await untilFresh(base);
			const headers = bearer(config, T - 1000);
			await logout(base, headers);
			await sleep(60);
			assert.equal((await send(base, '/api/favorites', headers)).status, 401);
		}, { now: () => T, sessionCutoffPoll: { intervalMs: 10 } });
	});
});

describe('logout refuses before it writes', () => {
	it('a token already revoked gets 401 session_revoked and nothing is written', async () => {
		const stub = backend([{ user_id: IDS.userA, sessions_valid_after: new Date(T - 500).toISOString() }]);
		await withLogout(stub, async (base, config) => {
			const result = await logout(base, bearer(config, T - 1000));
			assert.deepEqual([result.status, result.body.code], [401, 'session_revoked']);
		});
		assert.deepEqual(stub.writes, []);
	});

	it('a missing or forged bearer gets 401 and nothing is written', async () => {
		const stub = backend();
		await withLogout(stub, async (base) => {
			assert.equal((await logout(base, {})).status, 401);
			assert.equal((await logout(base, { authorization: 'Bearer osionos_v1.forged.sig' })).status, 401);
		});
		assert.deepEqual(stub.writes, []);
	});

	it('answers 503 session_cutoffs_unavailable before the first load, without writing', async () => {
		const stub = backend();
		stub.source.hold();
		const config = harnessConfig({ sessionCutoffs: 'on' });
		await withBridge(config, stub.fetchImpl, async (base) => {
			const result = await logout(base, bearer(config, T - 1000));
			assert.deepEqual([result.status, result.body.code], [503, 'session_cutoffs_unavailable']);
		}, { now: () => T });
		assert.deepEqual(stub.writes, []);
	});
});

describe('logout reports what the BaaS did', () => {
	it('answers 503 session_cutoffs_unavailable with Retry-After 5 when PostgREST fails, and does not sign the token out', async () => {
		const stub = backend();
		stub.writeAnswer = () => new Response('{"message":"boom"}', { status: 500, headers: { 'content-type': 'application/json' } });
		await withLogout(stub, async (base, config) => {
			const headers = bearer(config, T - 1000);
			const response = await fetch(`${base}${LOGOUT}`, { method: 'POST', headers });
			assert.deepEqual([response.status, response.headers.get('retry-after'), (await response.json()).code], [503, '5', 'session_cutoffs_unavailable']);
			assert.equal((await send(base, '/api/favorites', headers)).status, 200);
		});
	});

	it('answers 503 when the BaaS is unreachable', async () => {
		const stub = backend();
		stub.writeAnswer = () => { throw new Error('connect ECONNREFUSED'); };
		await withLogout(stub, async (base, config) => {
			const result = await logout(base, bearer(config, T - 1000));
			assert.deepEqual([result.status, result.body.code], [503, 'session_cutoffs_unavailable']);
		});
	});

	it('answers 409 user_not_found on a foreign-key violation', async () => {
		const stub = backend();
		stub.writeAnswer = () => new Response('{"code":"23503","message":"violates foreign key constraint"}', { status: 409, headers: { 'content-type': 'application/json' } });
		await withLogout(stub, async (base, config) => {
			const result = await logout(base, bearer(config, T - 1000));
			assert.deepEqual([result.status, result.body.code], [409, 'user_not_found']);
		});
	});

	it('answers 503 for a 409 that is not a foreign-key violation', async () => {
		const stub = backend();
		stub.writeAnswer = () => new Response('{"code":"23505"}', { status: 409, headers: { 'content-type': 'application/json' } });
		await withLogout(stub, async (base, config) => {
			assert.equal((await logout(base, bearer(config, T - 1000))).status, 503);
		});
	});

	it('does not answer before the write resolves', async () => {
		const stub = backend();
		let release;
		const gate = new Promise((done) => { release = done; });
		stub.writeAnswer = async () => { await gate; return new Response(null, { status: 201 }); };
		await withLogout(stub, async (base, config) => {
			let settled = false;
			const pending = logout(base, bearer(config, T - 1000)).then((result) => { settled = true; return result; });
			await sleep(100);
			assert.equal(settled, false);
			release();
			assert.equal((await pending).status, 204);
		});
	});
});

describe('logout speaks CORS like the other bridge routes', () => {
	it('answers the preflight and carries the allowed origin on the 204 and on an error', async () => {
		const stub = backend();
		await withLogout(stub, async (base, config) => {
			const preflight = await fetch(`${base}${LOGOUT}`, { method: 'OPTIONS', headers: { origin: config.allowedOrigin } });
			assert.equal(preflight.status, 204);
			assert.equal(preflight.headers.get('access-control-allow-origin'), config.allowedOrigin);
			const done = await fetch(`${base}${LOGOUT}`, { method: 'POST', headers: bearer(config, T - 1000) });
			assert.deepEqual([done.status, done.headers.get('access-control-allow-origin'), done.headers.get('access-control-allow-credentials')], [204, config.allowedOrigin, 'true']);
			const refused = await fetch(`${base}${LOGOUT}`, { method: 'POST' });
			assert.deepEqual([refused.status, refused.headers.get('access-control-allow-origin')], [401, config.allowedOrigin]);
		});
	});
});
