/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity-emit-sites.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The four places that record an activity event (login, export, search, share): each calls the
 * emitter once with the caller as subject and leaves status and body as they were. Share lives
 * in bridge-perms.test.mjs, beside the handler's own setup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configFromEnv, createBridgeHandoff, createBridgeServer, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { send as accountSend, sudoToken, USER_A } from './support/account-world.mjs';
import { startExportWorld } from './support/account-export-world.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import { kvStub } from './support/kv-stub.mjs';

const spy = () => {
	const calls = [];
	return { calls, emit: (...args) => calls.push(args) };
};

describe('search', () => {
	const asOwner = (config) => sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
	const path = `/api/pages/search?workspaceId=${IDS.team}&q=notes`;

	it('emits once for a successful search, with the caller, and leaves the answer alone', async () => {
		const activity = spy();
		const config = harnessConfig();
		config.activity = activity;
		await withBridge(config, createPostgrestMock(teamWorld()).fetchImpl, async (base) => {
			const answer = await send(base, path, asOwner(config));
			assert.equal(answer.status, 200, answer.text);
			assert.ok(Array.isArray(answer.body));
			assert.deepEqual(activity.calls, [[{ userId: IDS.userA }, 'search', 'search', IDS.team]]);
		});
	});

	it('emits nothing when the search fails', async () => {
		const activity = spy();
		const config = harnessConfig();
		config.activity = activity;
		const broken = { status: 500, body: { code: 'XX000', message: 'boom' } };
		const mock = createPostgrestMock(teamWorld(), { failWhen: (call) => (call.params.has('search_doc') ? broken : null) });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, path, asOwner(config));
			assert.ok(answer.status >= 500, answer.text);
			assert.ok(mock.calls.some((call) => call.params.has('search_doc')), 'the failure came from the search read');
			assert.equal(activity.calls.length, 0);
		});
	});
});

describe('export', () => {
	async function world(t) {
		const clock = { at: Date.parse('2026-10-23T12:00:00.000Z') };
		const kv = createTtlKv({ now: () => clock.at });
		const started = await startExportWorld(t, { kv, clock });
		started.config.activity = spy();
		return { ...started, sudo: await sudoToken(started.config, kv, USER_A) };
	}
	const ask = (w, token) => accountSend(w.base, '/api/account/export', { method: 'POST', token, body: { format: 'json' } });

	it('emits once for a queued export, with the caller', async (t) => {
		const w = await world(t);
		const answer = await ask(w, w.sudo);
		assert.equal(answer.status, 202);
		assert.equal(answer.body.status, 'queued');
		assert.deepEqual(w.config.activity.calls, [[w.config.activity.calls[0][0], 'export', 'settings', null]]);
		assert.equal(w.config.activity.calls[0][0].userId, USER_A);
	});

	it('emits nothing when the export is refused', async (t) => {
		const w = await world(t);
		const plain = await ask(w, undefined);
		assert.ok(plain.status >= 400);
		assert.equal(w.config.activity.calls.length, 0);
	});
});

describe('login', () => {
	const GATEWAY = 'http://gateway.local';
	const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

	async function login(gatewayStatus) {
		const config = configFromEnv({
			OSIONOS_APP_URL: 'http://localhost:3001',
			OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
			OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
			OSIONOS_BRIDGE_PERSISTENCE: 'memory',
			OSIONOS_BAAS_URL: '',
			AUTH_GATEWAY_URL: GATEWAY,
		});
		const activity = spy();
		config.activity = activity;
		const kv = kvStub();
		const handoff = await createBridgeHandoff({
			payload: validateBridgePayload({ provider: 'prismatica', subject: randomUUID(), email: 'a@example.com', name: 'A', jti: randomUUID() }),
			config, kv,
		});
		const fetchImpl = async (url) => {
			const route = String(url).replace(GATEWAY, '');
			if (route === '/api/auth/login') return gatewayStatus === 200 ? reply({ access_token: 'gw', refresh_token: 'r', user: { id: randomUUID() } }) : reply({ message: 'no' }, gatewayStatus);
			return reply({ redirectUrl: handoff.redirectUrl });
		};
		const server = createBridgeServer({ config, kv, fetchImpl });
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		try {
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'a@example.com', password: 'correct horse battery' }),
			});
			return { status: response.status, body: await response.json(), activity };
		} finally {
			await new Promise((done) => server.close(done));
		}
	}

	it('emits once for a sign-in, with the signed-in session as subject', async () => {
		const { status, body, activity } = await login(200);
		assert.equal(status, 200);
		assert.deepEqual(activity.calls, [[activity.calls[0][0], 'login', 'settings', null]]);
		assert.equal(activity.calls[0][0].userId, body.session.userId);
	});

	it('emits nothing for a refused sign-in', async () => {
		const { status, activity } = await login(401);
		assert.equal(status, 401);
		assert.equal(activity.calls.length, 0);
	});
});
