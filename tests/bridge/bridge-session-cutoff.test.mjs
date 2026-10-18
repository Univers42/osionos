/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge's one token verifier refuses an osionos_v1 token issued before its user's sessions_valid_after, and
// answers 503 for every token while the cut-off table is not loaded or is stale. Because every route and every
// injected module calls that verifier, the same check is proven through the server for each of them (P12).
// Boundaries are tested at +-1 ms.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createUserSession, startBridgeServer, validateBridgePayload, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { SessionCutoffs, STALE_AFTER_MS, timestampMicros } from '../../scripts/bridge-session-cutoff.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, withBridge } from './support/bridge-harness.mjs';

const T = Date.parse('2026-10-19T12:00:00.000Z');
const PAYLOAD = validateBridgePayload({ provider: 'prismatica', subject: IDS.userA, email: 'a@example.com', name: 'A', jti: 'e7c1d2a0-0000-4000-8000-00000000c8c8' });
const PERSISTED = { workspaceId: IDS.homeA, workspaceName: 'Home', workspaceSlug: 'home' };
const quietLog = { info() {}, warn() {} };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function tokenAt(config, issuedAtMs, subject = IDS.userA) {
	const workspace = subject === IDS.userA ? PERSISTED : { workspaceId: IDS.homeB };
	return createUserSession({ ...PAYLOAD, subject }, config, workspace, issuedAtMs).session.accessToken;
}

function signedToken(config, claims) {
	const encoded = Buffer.from(JSON.stringify({ iss: 'osionos-bridge', aud: 'osionos-app', sub: IDS.userA, workspace_ids: [IDS.homeA], ...claims })).toString('base64url');
	return `osionos_v1.${encoded}.${createHmac('sha256', config.appSessionSecret).update(encoded).digest('base64url')}`;
}

/** A token as the bridge minted it before iat_ms existed: same claims, second precision only. */
const legacyTokenAt = (config, iat) => signedToken(config, { iat, exp: iat + 3600 });

function trackerHolding(entries, clock = { at: T }) {
	const tracker = new SessionCutoffs({ enforced: true, now: () => clock.at, log: quietLog });
	tracker.completeLoad(new Map(entries), tracker.beginLoad());
	return tracker;
}

const configWithCutoff = (validAfter, clock) => ({ ...harnessConfig(), sessionCutoffs: trackerHolding(validAfter === null ? [] : [[IDS.userA, timestampMicros(validAfter)]], clock) });
const verifyAt = (token, config) => verifyAppSessionToken(token, config, T + 60_000);
const statusOf = (run) => { try { run(); return 200; } catch (error) { return error.status; } };

describe('timestampMicros reads what PostgREST returns for a timestamptz', () => {
	const cases = [
		['2026-10-19T12:00:00.123456+00:00', T * 1000 + 123_456],
		['2026-10-19T12:00:00+00:00', T * 1000],
		['2026-10-19T12:00:00.5Z', T * 1000 + 500_000],
		['2026-10-19T14:00:00.000001+02:00', T * 1000 + 1],
		['2026-10-19 14:00:00.25+02', T * 1000 + 250_000],
	];
	for (const [text, expected] of cases) {
		it(`reads ${text}`, () => assert.equal(timestampMicros(text), expected));
	}
	for (const text of ['', 'yesterday', '2026-10-19T12:00:00', '2026-13-45T12:00:00Z', null, 42]) {
		it(`answers null for ${JSON.stringify(text)}`, () => assert.equal(timestampMicros(text), null));
	}
});

describe('tokens carry a millisecond issue time', () => {
	it('mints iat_ms equal to the minting instant, beside the second-precision iat', () => {
		const config = harnessConfig();
		const { raw } = verifyAppSessionToken(tokenAt(config, T + 7), config, T + 8);
		assert.deepEqual([raw.iat_ms, raw.iat], [T + 7, Math.floor((T + 7) / 1000)]);
	});

	for (const bad of ['soon', -1, 1.5, null, T * 1e9]) {
		it(`refuses a token whose iat_ms is ${JSON.stringify(bad)}`, () => {
			const config = harnessConfig();
			const token = signedToken(config, { iat: T / 1000, iat_ms: bad, exp: T / 1000 + 3600 });
			assert.throws(() => verifyAppSessionToken(token, config, T), (error) => error.status === 401 && /issue time/.test(error.message));
		});
	}
});

describe('the verifier refuses a token issued before sessions_valid_after (P3)', () => {
	it('401s a token minted 1 ms before the cut-off, with the code the app keys on', () => {
		const config = configWithCutoff('2026-10-19T12:00:00.000+00:00');
		assert.throws(() => verifyAt(tokenAt(config, T - 1), config), (error) => error.status === 401 && error.code === 'session_revoked' && error.message === 'App session was signed out.');
	});

	it('accepts a token minted exactly at the cut-off and 1 ms after it', () => {
		const config = configWithCutoff('2026-10-19T12:00:00.000+00:00');
		assert.deepEqual([T, T + 1].map((at) => statusOf(() => verifyAt(tokenAt(config, at), config))), [200, 200]);
	});

	it('refuses a token minted in the cut-off\'s own millisecond when the cut-off is later in it (microseconds kept, safe side)', () => {
		const config = configWithCutoff('2026-10-19T12:00:00.000400+00:00');
		assert.deepEqual([T, T + 1].map((at) => statusOf(() => verifyAt(tokenAt(config, at), config))), [401, 200]);
	});

	it('accepts every token of a user with no cut-off, and leaves other users alone', () => {
		const config = configWithCutoff('2026-10-19T12:00:00Z');
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1_000_000, IDS.userB), config)), 200);
		const empty = configWithCutoff(null);
		assert.equal(statusOf(() => verifyAt(tokenAt(empty, T - 1_000_000), empty)), 200);
	});

	it('matches the user id case-insensitively', () => {
		const config = configWithCutoff('2026-10-19T12:00:00Z');
		const upper = signedToken(config, { sub: IDS.userA.toUpperCase(), iat: T / 1000 - 5, iat_ms: T - 5000, exp: T / 1000 + 3600 });
		assert.equal(statusOf(() => verifyAt(upper, config)), 401);
	});

	it('does nothing without a tracker, and when enforcement is off', () => {
		const bare = harnessConfig();
		const off = { ...bare, sessionCutoffs: new SessionCutoffs({ enforced: false, offReason: 'test', log: quietLog }) };
		for (const config of [bare, off]) assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1_000_000), config)), 200);
	});
});

describe('a token minted before iat_ms existed counts as issued at the start of its iat second', () => {
	it('accepts it when its second starts exactly at the cut-off', () => {
		const config = configWithCutoff('2026-10-19T12:00:00Z');
		assert.equal(statusOf(() => verifyAt(legacyTokenAt(config, T / 1000), config)), 200);
	});

	it('refuses it when the cut-off falls 1 ms into its second, and accepts the next second', () => {
		const config = configWithCutoff('2026-10-19T12:00:00.001Z');
		assert.deepEqual([T / 1000, T / 1000 + 1].map((at) => statusOf(() => verifyAt(legacyTokenAt(config, at), config))), [401, 200]);
	});

	it('refuses one from the second before', () => {
		const config = configWithCutoff('2026-10-19T12:00:00Z');
		assert.equal(statusOf(() => verifyAt(legacyTokenAt(config, T / 1000 - 1), config)), 401);
	});
});

describe('P4 and P5: while the table is not loaded or is stale, EVERY token answers 503', () => {
	function unavailable(config, at) {
		try {
			verifyAt(tokenAt(config, at), config);
			return null;
		} catch (error) {
			return error;
		}
	}

	it('answers 503 session_cutoffs_unavailable with a 5 s retry hint before the first load', () => {
		const tracker = new SessionCutoffs({ enforced: true, now: () => T, log: quietLog });
		const config = { ...harnessConfig(), sessionCutoffs: tracker };
		const error = unavailable(config, T - 1000);
		assert.deepEqual([error?.status, error?.code, error?.retryAfterSeconds], [503, 'session_cutoffs_unavailable', 5]);
	});

	it('answers 503 for old and brand-new tokens alike once the last load is older than 60 s', () => {
		const clock = { at: T };
		const config = configWithCutoff('2026-10-19T11:00:00Z', clock);
		assert.equal(unavailable(config, T - 1000), null);
		clock.at = T + STALE_AFTER_MS + 1;
		const verifyLater = (at) => { try { verifyAppSessionToken(tokenAt(config, at), config, T + 60_000); return 200; } catch (error) { return error.status; } };
		assert.deepEqual([T - 1000, T + STALE_AFTER_MS, T + STALE_AFTER_MS + 1].map(verifyLater), [503, 503, 503]);
	});

	it('still lets an invalid token fail on its own terms', () => {
		const tracker = new SessionCutoffs({ enforced: true, now: () => T, log: quietLog });
		const config = { ...harnessConfig(), sessionCutoffs: tracker };
		assert.equal(statusOf(() => verifyAt('osionos_v1.forged.sig', config)), 401);
	});
});

async function untilState(base, wanted) {
	for (let attempt = 0; attempt < 300; attempt += 1) {
		const health = await send(base, '/api/auth/bridge/health', {});
		if (health.body.session_cutoffs === wanted) return health;
		await sleep(10);
	}
	throw new Error(`health never reported session_cutoffs=${wanted}`);
}

describe('the server: health, error bodies and the boot line', () => {
	const cutoffAt = Date.now() - 60_000;
	const world = () => createPostgrestMock({ auth_session_cutoffs: [{ user_id: IDS.userA, sessions_valid_after: new Date(cutoffAt).toISOString() }] });
	const bearer = (config, at) => ({ authorization: `Bearer ${tokenAt(config, at)}` });

	it('reports loading with a null age, answers 503 + Retry-After 5, then reports fresh and enforces', async () => {
		const config = harnessConfig({ sessionCutoffs: 'on' });
		const mock = world();
		let open;
		const gate = new Promise((done) => { open = done; });
		const gated = async (url, init) => { if (String(url).includes('auth_session_cutoffs')) await gate; return mock.fetchImpl(url, init); };
		await withBridge(config, gated, async (base) => {
			const loading = await send(base, '/api/auth/bridge/health', {});
			assert.deepEqual([loading.status, loading.body.session_cutoffs, loading.body.session_cutoffs_age_ms], [200, 'loading', null]);
			const refused = await fetch(`${base}/api/favorites`, { headers: bearer(config, cutoffAt + 1) });
			assert.deepEqual([refused.status, refused.headers.get('retry-after')], [503, '5']);
			assert.deepEqual(await refused.json(), { ok: false, code: 'session_cutoffs_unavailable', message: 'The session revocation check is not ready; try again shortly.' });
			open();
			const fresh = await untilState(base, 'fresh');
			assert.equal(typeof fresh.body.session_cutoffs_age_ms, 'number');
			const revoked = await fetch(`${base}/api/favorites`, { headers: bearer(config, cutoffAt - 1) });
			assert.deepEqual([revoked.status, await revoked.json()], [401, { ok: false, code: 'session_revoked', message: 'App session was signed out.' }]);
			assert.equal((await send(base, '/api/favorites', bearer(config, cutoffAt + 1))).status, 200);
		});
	});

	it('leaves the body of an error without a code exactly as it was', async () => {
		const config = harnessConfig({ sessionCutoffs: 'on' });
		await withBridge(config, world().fetchImpl, async (base) => {
			await untilState(base, 'fresh');
			const missing = await send(base, '/api/favorites', {});
			assert.deepEqual(missing.body, { ok: false, message: 'App session bearer token is required.' });
		});
	});

	it('reports off, with a null age and no polling, when OSIONOS_SESSION_CUTOFFS=off', async () => {
		const config = harnessConfig({ sessionCutoffs: 'off' });
		const mock = world();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const health = await send(base, '/api/auth/bridge/health', {});
			assert.deepEqual([health.body.session_cutoffs, health.body.session_cutoffs_age_ms], ['off', null]);
			assert.equal((await send(base, '/api/favorites', bearer(config, cutoffAt - 1))).status, 200);
		});
		assert.equal(mock.calls.filter((call) => call.table === 'auth_session_cutoffs').length, 0);
	});

	it('is off when there is no service key or no BaaS URL', async () => {
		for (const missing of [{ serviceKey: '' }, { baasUrl: '' }]) {
			const config = { ...harnessConfig({ sessionCutoffs: 'on' }), ...missing };
			await withBridge(config, world().fetchImpl, async (base) => {
				assert.equal((await send(base, '/api/auth/bridge/health', {})).body.session_cutoffs, 'off');
			});
		}
	});

	it('logs one boot line when started with enforcement off, naming the reason', (t) => {
		const reasons = [[{ sessionCutoffs: 'off' }, /OFF \(OSIONOS_SESSION_CUTOFFS=off\)/], [{ sessionCutoffs: 'on', serviceKey: '' }, /OFF \(no service key or BaaS URL\)/]];
		for (const [options, expected] of reasons) {
			const warn = t.mock.method(console, 'warn', () => {});
			const config = { ...harnessConfig(options), ...(options.serviceKey === '' ? { serviceKey: '' } : {}), port: 0 };
			const server = startBridgeServer(config);
			server.close();
			assert.equal(warn.mock.callCount(), 1);
			assert.match(warn.mock.calls[0].arguments[0], expected);
			warn.mock.restore();
		}
	});

	it('says what an enforcing bridge does until its first load', () => {
		const tracker = new SessionCutoffs({ enforced: true, log: quietLog });
		assert.match(tracker.bootLine(), /enforcing; every token request answers 503 until the first load/);
	});
});

// P12: one route of every module that receives verifySession (bridge-api.mjs createBridgeServer), and bridge-api's own.
const ENV_FOR_ROUTES = {
	OSIONOS_RUNNER_URL: 'http://runner.invalid',
	OSIONOS_IDE_TOKEN_SECRET: 'ide-token-secret-that-is-long-enough-for-the-minimum-bytes-0123456789',
	OSIONOS_PUBLISH_ENABLED: '1',
};
const ROUTES = [
	['agent', 'POST', '/api/agent/chat', false],
	['runner', 'POST', '/api/ide/run', false],
	['ideToken', 'POST', '/api/ide/token', false],
	['connector', 'POST', '/api/connector/notion/validate', true],
	['oauth', 'POST', '/api/connector/oauth/validate', true],
	['perms', 'GET', '/api/perms/workspaces', true],
	['rtc', 'POST', '/api/rtc/token', true],
	['chat', 'GET', '/api/chat/channels', true],
	['notify', 'GET', '/api/notifications', true],
	['push', 'POST', '/api/push/subscribe', true],
	['media', 'POST', '/api/media/uploads', true],
	['tasks', 'GET', '/api/tasks', true],
	['comments', 'GET', '/api/comments', true],
	['publicPages', 'POST', `/api/pages/${IDS.privateA}/publish`, true],
	['community', 'GET', '/api/communities', true],
	['profile', 'GET', '/api/people', true],
	['feed', 'GET', `/api/feed/${IDS.privateA}/likes`, true],
	['social', 'GET', '/api/connections', true],
	['collab', 'GET', '/api/collaboration', true],
	['realtimeToken', 'POST', '/api/realtime/token', true],
	['bridge-api favorites', 'GET', '/api/favorites', true],
	['bridge-api workspace list', 'GET', '/api/workspaces', true],
	['bridge-api page read', 'GET', `/api/pages/${IDS.privateA}`, true],
	['bridge-api workspace validate', 'POST', '/api/auth/workspace/validate', true, { workspaceId: IDS.homeA, permission: 'read' }],
];

describe('P12: a revoked token gets 401 through every module that receives verifySession', () => {
	const saved = {};
	beforeEach(() => { for (const [key, value] of Object.entries(ENV_FOR_ROUTES)) { saved[key] = process.env[key]; process.env[key] = value; } });
	afterEach(() => { for (const key of Object.keys(ENV_FOR_ROUTES)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });

	it('covers all twenty injected modules', () => {
		const named = ROUTES.map(([name]) => name).filter((name) => !name.startsWith('bridge-api'));
		assert.equal(named.length, 20);
	});

	it('answers 401 for a token issued before the cut-off on every route, and does not for one issued after', async () => {
		const config = harnessConfig({ sessionCutoffs: 'on' });
		const cutoffAt = Date.now() - 60_000;
		const mock = createPostgrestMock({ auth_session_cutoffs: [{ user_id: IDS.userA, sessions_valid_after: new Date(cutoffAt).toISOString() }] });
		const verdicts = [];
		await withBridge(config, mock.fetchImpl, async (base) => {
			await untilState(base, 'fresh');
			for (const [name, method, path, hasControl, body = {}] of ROUTES) {
				const request = (at) => send(base, path, { authorization: `Bearer ${tokenAt(config, at)}` }, { method, body: method === 'POST' ? JSON.stringify(body) : undefined });
				const revoked = await request(cutoffAt - 1);
				verdicts.push([name, revoked.status]);
				if (hasControl) assert.notEqual((await request(cutoffAt + 1)).status, 401, `${name}: a token issued after the cut-off must not be refused`);
			}
		});
		assert.deepEqual(verdicts.filter(([, status]) => status !== 401), []);
	});
});
