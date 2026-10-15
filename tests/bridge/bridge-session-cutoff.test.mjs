/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A password reset writes public.auth_session_cutoffs.sessions_valid_after; the bridge's one
// token verifier then refuses every osionos_v1 token issued before it, on every route,
// including the ones served by injected modules. Boundaries are tested at ±1 ms.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createUserSession, validateBridgePayload, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createSessionCutoffCache, refreshSessionCutoff, timestampMicros } from '../../scripts/bridge-session-cutoff.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, withBridge } from './support/bridge-harness.mjs';

const T = Date.parse('2026-10-15T12:00:00.000Z');
const PAYLOAD = validateBridgePayload({ provider: 'prismatica', subject: IDS.userA, email: 'a@example.com', name: 'A', jti: 'e7c1d2a0-0000-4000-8000-00000000c8c8' });

function tokenAt(config, issuedAtMs) {
	return createUserSession(PAYLOAD, config, { workspaceId: IDS.homeA, workspaceName: 'Home', workspaceSlug: 'home' }, issuedAtMs).session.accessToken;
}

/** A token as the bridge minted it before iat_ms existed: same claims, second precision only. */
function legacyTokenAt(config, issuedAtSeconds) {
	const claims = {
		iss: 'osionos-bridge', aud: 'osionos-app', sub: IDS.userA, provider: 'prismatica', workspace_ids: [IDS.homeA],
		roles: { [IDS.homeA]: 'owner' }, is_admin: false, jti: 'legacy', iat: issuedAtSeconds, exp: issuedAtSeconds + 3600,
	};
	const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `osionos_v1.${encoded}.${createHmac('sha256', config.appSessionSecret).update(encoded).digest('base64url')}`;
}

function quietCache(options = {}) {
	const audits = [];
	return { cache: createSessionCutoffCache({ audit: (line) => audits.push(line), ...options }), audits };
}

/** A config whose cache already holds `validAfter` for user A, as a prefetch would leave it. */
async function configWithCutoff(validAfter) {
	const { cache } = quietCache();
	await refreshSessionCutoff(cache, IDS.userA, async () => validAfter, T);
	return { ...harnessConfig(), sessionCutoffs: cache };
}

const verifyAt = (token, config) => verifyAppSessionToken(token, config, T + 60_000);
const statusOf = (run) => { try { run(); return 200; } catch (error) { return error.status; } };

describe('timestampMicros reads what PostgREST returns for a timestamptz', () => {
	const cases = [
		['2026-10-15T12:00:00.123456+00:00', T * 1000 + 123_456],
		['2026-10-15T12:00:00+00:00', T * 1000],
		['2026-10-15T12:00:00.5Z', T * 1000 + 500_000],
		['2026-10-15T14:00:00.000001+02:00', T * 1000 + 1],
		['2026-10-15 14:00:00.25+02', T * 1000 + 250_000],
	];
	for (const [text, expected] of cases) {
		it(`reads ${text}`, () => assert.equal(timestampMicros(text), expected));
	}
	for (const text of ['', 'yesterday', '2026-10-15T12:00:00', '2026-13-45T12:00:00Z', null, 42]) {
		it(`answers null for ${JSON.stringify(text)}`, () => assert.equal(timestampMicros(text), null));
	}
});

describe('tokens carry a millisecond issue time', () => {
	it('mints iat_ms equal to the minting instant, beside the second-precision iat', () => {
		const config = harnessConfig();
		const { raw } = verifyAppSessionToken(tokenAt(config, T + 7), config, T + 8);
		assert.deepEqual([raw.iat_ms, raw.iat], [T + 7, Math.floor((T + 7) / 1000)]);
	});

	it('refuses a token whose iat_ms is not a whole number of milliseconds', () => {
		const config = harnessConfig();
		const claims = { iss: 'osionos-bridge', aud: 'osionos-app', sub: IDS.userA, workspace_ids: [IDS.homeA], iat: T / 1000, iat_ms: 'soon', exp: T / 1000 + 3600 };
		const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
		const token = `osionos_v1.${encoded}.${createHmac('sha256', config.appSessionSecret).update(encoded).digest('base64url')}`;
		assert.throws(() => verifyAppSessionToken(token, config, T), (error) => error.status === 401 && /issue time/.test(error.message));
	});
});

describe('the verifier refuses a token issued before sessions_valid_after', () => {
	it('401s a token minted 1 ms before the cut-off', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00.000+00:00');
		assert.throws(() => verifyAt(tokenAt(config, T - 1), config), (error) => error.status === 401 && /revoked/.test(error.message));
	});

	it('accepts a token minted 1 ms after the cut-off', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00.000+00:00');
		assert.equal(verifyAt(tokenAt(config, T + 1), config).userId, IDS.userA);
	});

	it('accepts a token minted in the cut-off\'s own millisecond when the cut-off has no sub-millisecond part', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00+00:00');
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T), config)), 200);
	});

	it('refuses a token minted in the cut-off\'s millisecond when the cut-off is later in it (the safe side)', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00.000400+00:00');
		assert.deepEqual([T, T + 1].map((at) => statusOf(() => verifyAt(tokenAt(config, at), config))), [401, 200]);
	});

	it('accepts every token of a user with no cut-off row', async () => {
		const config = await configWithCutoff(null);
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1_000_000), config)), 200);
	});

	it('leaves other users alone', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00Z');
		const other = createUserSession({ ...PAYLOAD, subject: IDS.userB }, config, { workspaceId: IDS.homeB }, T - 1).session.accessToken;
		assert.equal(statusOf(() => verifyAt(other, config)), 200);
	});
});

describe('a token minted before iat_ms existed is compared at second precision', () => {
	// Rule: such a token counts as issued at the start of its iat second, so it is refused
	// unless that second starts at or after the cut-off.
	it('accepts it when its second starts exactly at the cut-off', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00Z');
		assert.equal(statusOf(() => verifyAt(legacyTokenAt(config, T / 1000), config)), 200);
	});

	it('refuses it when the cut-off falls 1 ms into its second, and accepts the next second', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00.001Z');
		assert.deepEqual([T / 1000, T / 1000 + 1].map((at) => statusOf(() => verifyAt(legacyTokenAt(config, at), config))), [401, 200]);
	});

	it('refuses one from the second before', async () => {
		const config = await configWithCutoff('2026-10-15T12:00:00Z');
		assert.equal(statusOf(() => verifyAt(legacyTokenAt(config, T / 1000 - 1), config)), 401);
	});
});

describe('the per-user lookup is cached for the TTL', () => {
	it('looks up once inside the TTL and again after it', async () => {
		const { cache } = quietCache({ ttlMs: 5000 });
		let calls = 0;
		const lookup = async () => { calls += 1; return null; };
		await refreshSessionCutoff(cache, IDS.userA, lookup, T);
		await refreshSessionCutoff(cache, IDS.userA, lookup, T + 4999);
		assert.equal(calls, 1);
		await refreshSessionCutoff(cache, IDS.userA, lookup, T + 5000);
		assert.equal(calls, 2);
	});

	it('shares one lookup between concurrent requests', async () => {
		const { cache } = quietCache();
		let calls = 0;
		let release;
		const lookup = () => { calls += 1; return new Promise((done) => { release = done; }); };
		const both = Promise.all([refreshSessionCutoff(cache, IDS.userA, lookup, T), refreshSessionCutoff(cache, IDS.userA, lookup, T)]);
		release(null);
		await both;
		assert.equal(calls, 1);
	});

	it('dates the TTL from the start of the lookup, so a slow answer is not trusted longer', async () => {
		const { cache } = quietCache({ ttlMs: 5000 });
		await refreshSessionCutoff(cache, IDS.userA, async () => null, T);
		assert.equal(cache.entries.get(IDS.userA).expiresAt, T + 5000);
	});
});

describe('a failed lookup', () => {
	async function failedAfter(previous) {
		const { cache, audits } = quietCache({ ttlMs: 5000 });
		if (previous !== undefined) await refreshSessionCutoff(cache, IDS.userA, async () => previous, T - 10_000);
		await refreshSessionCutoff(cache, IDS.userA, async () => { throw new Error('PostgREST timed out'); }, T);
		return { config: { ...harnessConfig(), sessionCutoffs: cache }, audits };
	}

	it('fails closed (503) for a user with a cut-off on record, and still 401s a token older than it', async () => {
		const { config } = await failedAfter('2026-10-15T11:59:00Z');
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 60_001), config)), 401);
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1000), config)), 503);
	});

	it('fails open for a user with no cut-off on record, and writes an audit line naming the user', async () => {
		const { config, audits } = await failedAfter(undefined);
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1000), config)), 200);
		assert.equal(audits.length, 1);
		assert.match(audits[0], new RegExp(`${IDS.userA}.*PostgREST timed out`));
	});

	it('treats an unreadable sessions_valid_after as a failure, not as "no cut-off"', async () => {
		const { cache, audits } = quietCache();
		await refreshSessionCutoff(cache, IDS.userA, async () => '2026-10-15T11:00:00Z', T - 10_000);
		await refreshSessionCutoff(cache, IDS.userA, async () => 'not a time', T);
		const config = { ...harnessConfig(), sessionCutoffs: cache };
		assert.equal(statusOf(() => verifyAt(tokenAt(config, T - 1000), config)), 503);
		assert.equal(audits.length, 1);
	});
});

describe('every route inherits the check through the server', () => {
	const cutoffWorld = (validAfter) => ({ auth_session_cutoffs: [{ user_id: IDS.userA, sessions_valid_after: validAfter }] });
	const bearer = (config, at) => ({ authorization: `Bearer ${tokenAt(config, at)}` });

	for (const path of ['/api/favorites', '/api/tasks']) {
		it(`${path}: 401 for a token minted 1 ms before the cut-off, 200 for one minted 1 ms after`, async () => {
			const config = harnessConfig();
			const cutoff = Date.now() - 60_000;
			const mock = createPostgrestMock(cutoffWorld(new Date(cutoff).toISOString()));
			await withBridge(config, mock.fetchImpl, async (base) => {
				const before = await send(base, path, bearer(config, cutoff - 1));
				const after = await send(base, path, bearer(config, cutoff + 1));
				assert.deepEqual([before.status, after.status], [401, 200], `${before.text} / ${after.text}`);
				assert.match(before.body.message, /revoked/);
			});
		});
	}

	it('looks the user up with the service role, by user id, once for two requests inside the TTL', async () => {
		const config = harnessConfig();
		const mock = createPostgrestMock({});
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, '/api/favorites', bearer(config, Date.now()));
			await send(base, '/api/favorites', bearer(config, Date.now()));
		});
		const lookups = mock.calls.filter((call) => call.table === 'auth_session_cutoffs');
		assert.equal(lookups.length, 1);
		assert.equal(lookups[0].params.get('user_id'), `eq.${IDS.userA}`);
	});

	it('does not look anything up for a request without a valid token', async () => {
		const config = harnessConfig();
		const mock = createPostgrestMock({});
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, '/api/favorites', { authorization: 'Bearer osionos_v1.forged.sig' })).status, 401);
		});
		assert.equal(mock.calls.filter((call) => call.table === 'auth_session_cutoffs').length, 0);
	});

	it('serves a user with no row when the lookup fails, and refuses one with a row on record', async () => {
		const { cache, audits } = quietCache({ ttlMs: 0 });
		const config = { ...harnessConfig(), sessionCutoffs: cache };
		let failing = false;
		const mock = createPostgrestMock(cutoffWorld(new Date(Date.now() - 60_000).toISOString()), {
			failWhen: (call) => (failing && call.table === 'auth_session_cutoffs' ? { status: 503, body: { message: 'down' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const userB = { authorization: `Bearer ${createUserSession({ ...PAYLOAD, subject: IDS.userB }, config, { workspaceId: IDS.homeB }).session.accessToken}` };
			assert.equal((await send(base, '/api/favorites', bearer(config, Date.now()))).status, 200);
			failing = true;
			assert.equal((await send(base, '/api/favorites', bearer(config, Date.now()))).status, 503);
			assert.equal((await send(base, '/api/favorites', userB)).status, 200);
		});
		assert.equal(audits.filter((line) => line.includes(IDS.userB)).length, 1);
	});
});
