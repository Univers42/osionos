/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-stepup.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A 2FA step-up starts a new refresh family (F-2): confirm, verify, recovery verify and
 * disable each answer a refresh token, retire the old family, carry a running sudo window,
 * and fail closed. Every spec runs the real handler on a running bridge.
 * Caveat: the kv double ignores TTLs, so a carried sudo window is proved by the TTL passed to
 * `kv.set`, not by a clock that moves past it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashRecoveryCode } from '../../scripts/bridge-account-mfa-recovery.mjs';
import { STEP_SECONDS, hotp, newSecret, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';
import { familyRefreshExp, hashRefreshToken, readRefreshToken } from '../../scripts/bridge-refresh-token.mjs';
import { CODES_TABLE, MFA_KEY, TOTP_TABLE, startMfaWorld, verifiedRow } from './support/mfa-world.mjs';
import { createSessionStore } from './support/session-postgrest.mjs';
import { refreshWith, tokenClaims } from './support/session-signin.mjs';
import { USER_A } from './support/session-world.mjs';

const PEPPER = Buffer.alloc(32, 5).toString('base64');
const ENV = { OSIONOS_MFA_SECRET_KEY: MFA_KEY, OSIONOS_RECOVERY_PEPPER: PEPPER };
const SESSIONS = 'osionos_sessions';
const KINDS = ['confirm', 'verify', 'recovery', 'disable'];
const CUT_OFF_KINDS = new Set(['confirm', 'disable']);
const stepAt = (ms) => Math.floor(ms / 1000 / STEP_SECONDS);
const post = (world, path, token, body = {}) => world.api('POST', `/api/account/2fa/${path}`, token, { body });
const codeRows = () => Array.from({ length: 3 }, (_, index) => ({ user_id: USER_A, code_hmac: hashRecoveryCode({ pepper: PEPPER, userId: USER_A, code: `abcd-efg${index + 2}` }), used_at: null }));
const RECOVERY_CODES = ['abcd-efg2', 'abcd-efg3', 'abcd-efg4'];
const idsOf = (rows, userFamily) => rows.filter((row) => row.family_id === userFamily).map((row) => row.id);

/** Replaces the session store's transport with one that can refuse or hold chosen requests. */
function intercept(world, decide) {
	const serve = world.sessions.fetchImpl;
	world.sessions.fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const refusal = await decide({ method: init.method ?? 'GET', table: parsed.pathname.replace('/rest/v1/', ''), params: parsed.searchParams });
		return refusal ? new Response('{}', { status: refusal }) : serve(url, init);
	};
}

/**
 * One world per route. `run()` calls the route with the old session's latest token; with
 * `rotate` the old family has refreshed once first, so its latest row is not its root.
 */
async function arrange(t, kind, { rotate = false, records = 'on' } = {}) {
	const secret = newSecret();
	const factor = kind === 'confirm' ? [] : [verifiedRow(USER_A, sealSecret(secret, USER_A, ENV))];
	const world = await startMfaWorld(t, { env: ENV, totp: factor, recovery: kind === 'recovery' || kind === 'disable' ? codeRows() : [], records });
	let session = await world.signIn();
	const rootJti = session.claims.jti;
	if (kind === 'disable') {
		const stepped = await post(world, 'verify', session.accessToken, { code: hotp(secret, stepAt(world.clock.at)) });
		assert.equal(stepped.status, 200, stepped.text);
		session = { accessToken: stepped.body.accessToken, refreshToken: stepped.body.refreshToken, claims: tokenClaims(stepped.body.accessToken) };
		world.advance(31_000);
	}
	const family = session.claims.jti;
	if (rotate) {
		const next = await refreshWith(world.base, session.refreshToken);
		assert.equal(next.status, 200, JSON.stringify(next.body));
		session = { accessToken: next.body.accessToken, refreshToken: next.body.refreshToken, claims: tokenClaims(next.body.accessToken) };
	}
	if (kind === 'confirm') {
		await world.sudo(session.accessToken);
		const enrolled = await world.api('POST', '/api/account/2fa/enroll', session.accessToken, { body: {} });
		assert.equal(enrolled.status, 200, enrolled.text);
		const secretParam = new URL(enrolled.body.otpauthUrl).searchParams.get('secret');
		const { base32Decode } = await import('../../scripts/bridge-account-mfa-totp.mjs');
		world.advance(1000);
		session.code = () => hotp(base32Decode(secretParam), stepAt(world.clock.at));
	} else if (kind === 'disable') {
		await world.sudo(session.accessToken);
		world.advance(1000);
	}
	const run = (token = session.accessToken, index = 0) => {
		if (kind === 'disable') return post(world, 'disable', token);
		if (kind === 'recovery') return post(world, 'recovery/verify', token, { code: RECOVERY_CODES[index] });
		return post(world, 'verify', token, { code: kind === 'confirm' ? session.code() : hotp(secret, stepAt(world.clock.at)) });
	};
	return { world, session, run, family, rootJti, secret };
}

describe('step-up family: what each route answers', () => {
	for (const kind of KINDS) {
		it(`${kind}: a new jti, a refresh token of a new ungated family, and its root row (B1, B2)`, async (t) => {
			const { world, session, run } = await arrange(t, kind);
			const answer = await run();
			assert.equal(answer.status, 200, answer.text);
			assert.match(answer.body.refreshToken, /^osb_rt\./);
			const claims = tokenClaims(answer.body.accessToken);
			assert.notEqual(claims.jti, session.claims.jti);
			const { payload } = readRefreshToken(answer.body.refreshToken, world.config, world.clock.at);
			assert.deepEqual([payload.fam, payload.sub, payload.mfa_req, payload.aal, payload.exp], [claims.jti, USER_A, undefined, undefined, familyRefreshExp(world.config, claims.exp)]);
			const row = world.sessions.rows(SESSIONS).find((candidate) => candidate.id === claims.jti);
			assert.deepEqual([row.family_id, row.parent_id ?? null, row.refresh_hash, row.auth_method], [claims.jti, null, hashRefreshToken(answer.body.refreshToken), 'refresh']);
			assert.equal(typeof answer.body.expiresAt, 'string');
			assert.ok(Number.isFinite(Date.parse(answer.body.expiresAt)));
			assert.equal(answer.body.aal, 2);
		});
	}
});

describe('step-up family: the old family ends (B3, B4)', () => {
	for (const kind of KINDS) {
		for (const rotate of [false, true]) {
			it(`${kind}${rotate ? ' after one refresh' : ''}: its latest refresh token and access token are refused, every row is revoked as step_up`, async (t) => {
				const { world, session, run, family } = await arrange(t, kind, { rotate });
				assert.equal((await run()).status, 200);
				const refused = await refreshWith(world.base, session.refreshToken);
				assert.equal(refused.status, 401);
				if (!CUT_OFF_KINDS.has(kind)) assert.equal(refused.body.code, 'session_revoked');
				const rows = world.sessions.rows(SESSIONS).filter((row) => row.family_id === family);
				assert.ok(rows.length >= (rotate ? 2 : 1));
				assert.ok(rows.every((row) => row.revoked_reason === 'step_up' && row.revoked_at), JSON.stringify(rows));
				assert.equal((await world.api('GET', '/api/account/sessions', session.accessToken)).status, 401, 'the old access token is revoked locally');
			});
		}
	}
});

describe('step-up family: assurance, listing, single use (B5, B6, B7, B8)', () => {
	it('the new family refreshes without a gate and a reused first token is refused (B5)', async (t) => {
		const { world, run } = await arrange(t, 'verify');
		const answer = await run();
		const rotated = await refreshWith(world.base, answer.body.refreshToken);
		assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
		const claims = tokenClaims(rotated.body.accessToken);
		assert.deepEqual([claims.mfa_req, claims.aal ?? 2], [undefined, 2]);
		assert.equal((await world.api('GET', '/api/account/sessions', rotated.body.accessToken)).status, 200);
		const reused = await refreshWith(world.base, answer.body.refreshToken);
		assert.deepEqual([reused.status, reused.body.code], [401, 'refresh_token_reused']);
	});

	it('the list shows exactly one live row, the new jti, current (B6)', async (t) => {
		const { world, run } = await arrange(t, 'verify');
		const answer = await run();
		const list = await world.api('GET', '/api/account/sessions', answer.body.accessToken);
		assert.equal(list.status, 200, list.text);
		const live = list.body.sessions;
		assert.deepEqual(live.map((row) => [row.id, row.current]), [[tokenClaims(answer.body.accessToken).jti, true]]);
	});

	it('refuses a session whose row is already revoked and writes no row (B7)', async (t) => {
		const { world, session, run } = await arrange(t, 'verify');
		// Another replica revoked it: this one still honours the token, so only the row can say no.
		Object.assign(world.sessions.rows(SESSIONS).find((row) => row.id === session.claims.jti), { revoked_at: new Date(world.clock.at).toISOString(), revoked_reason: 'user' });
		const before = world.sessions.rows(SESSIONS).length;
		const answer = await run();
		assert.deepEqual([answer.status, answer.body.code, answer.body.accessToken], [401, 'session_revoked', undefined]);
		assert.equal(world.sessions.rows(SESSIONS).length, before);
	});

	it('still mints for a legacy token that never had a row (B7)', async (t) => {
		const { world, session, run } = await arrange(t, 'verify');
		const rows = world.sessions.rows(SESSIONS);
		rows.splice(rows.findIndex((row) => row.id === session.claims.jti), 1);
		const answer = await run();
		assert.equal(answer.status, 200, answer.text);
		assert.match(answer.body.refreshToken, /^osb_rt\./);
	});

	it('a replayed code is refused and leaves one new family (B8)', async (t) => {
		const { world, run } = await arrange(t, 'verify');
		const first = await run();
		const replay = await run(first.body.accessToken);
		assert.deepEqual([replay.status, replay.body.code], [422, 'code_invalid']);
		assert.equal(world.sessions.rows(SESSIONS).length, 2);
	});
});

describe('step-up family: the sudo window (B9)', () => {
	async function sudoCase(t, { grant, expires, failCopy = false }) {
		const { world, session, run } = await arrange(t, 'verify');
		const writes = [];
		const set = world.kv.set;
		let armed = false;
		world.kv.set = async (key, value, ttl) => {
			if (armed && failCopy && key.includes('sudo')) throw new Error('kv down');
			writes.push([key, value, ttl]);
			return set(key, value, ttl);
		};
		if (grant) await world.sudo(session.accessToken);
		if (expires !== undefined) await world.kv.set(`sudo-expires:${session.claims.jti}`, new Date(world.clock.at + expires).toISOString(), 600_000);
		writes.length = 0;
		armed = true;
		const answer = await run();
		const fresh = tokenClaims(answer.body.accessToken ?? session.accessToken).jti;
		return { world, answer, writes, fresh, old: session.claims.jti };
	}

	it('no grant: nothing is carried (a)', async (t) => {
		const { world, writes, fresh } = await sudoCase(t, { grant: false, expires: 120_000 });
		assert.equal(world.kv.has(`sudo:${fresh}`), false);
		assert.deepEqual(writes, []);
	});

	it('a grant with its expiry is carried with the time it has left (b)', async (t) => {
		const { world, writes, fresh, old } = await sudoCase(t, { grant: true, expires: 120_000 });
		assert.equal(await world.kv.get(`sudo:${fresh}`), USER_A);
		assert.equal(await world.kv.get(`sudo-expires:${fresh}`), await world.kv.get(`sudo-expires:${old}`));
		assert.deepEqual(writes.map(([key, , ttl]) => [key.split(':')[0], ttl]), [['sudo', 120_000], ['sudo-expires', 120_000]]);
	});

	it('a grant with no expiry key is not carried (c)', async (t) => {
		const { world, fresh } = await sudoCase(t, { grant: true });
		assert.equal(world.kv.has(`sudo:${fresh}`), false);
	});

	it('an expired expiry key is not carried (d)', async (t) => {
		const { world, fresh } = await sudoCase(t, { grant: true, expires: -1000 });
		assert.equal(world.kv.has(`sudo:${fresh}`), false);
	});

	it('a failing copy still answers 200 (e)', async (t) => {
		const { answer } = await sudoCase(t, { grant: true, expires: 120_000, failCopy: true });
		assert.equal(answer.status, 200, answer.text);
	});
});

describe('step-up family: failures close (B10)', () => {
	for (const kind of KINDS) {
		it(`${kind}: a root-row insert that fails answers 503 with no token, and the factor change stays`, async (t) => {
			const { world, run, family } = await arrange(t, kind);
			intercept(world, ({ method, table }) => (method === 'POST' && table === SESSIONS ? 500 : null));
			const answer = await run();
			assert.equal(answer.status, 503, answer.text);
			assert.equal(answer.body.code, 'session_record_unavailable');
			assert.deepEqual([answer.body.accessToken, answer.body.refreshToken], [undefined, undefined]);
			if (kind === 'confirm') assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'verified');
			if (kind === 'disable') assert.deepEqual([world.mfa.rows(TOTP_TABLE).length, world.mfa.rows(CODES_TABLE).length], [0, 0]);
			if (kind === 'recovery') assert.equal(world.mfa.rows(CODES_TABLE).filter((row) => row.used_at).length, 1);
			if (CUT_OFF_KINDS.has(kind)) assert.match(answer.body.message, /signed out/);
			else assert.ok(world.sessions.rows(SESSIONS).filter((row) => row.family_id === family).every((row) => !row.revoked_at), 'the old family is untouched');
		});

		it(`${kind}: an old-family revoke that fails answers 503 with no token and revokes the unused new row`, async (t) => {
			const { world, run, family } = await arrange(t, kind);
			let first = true;
			intercept(world, ({ method, table, params }) => {
				if (method !== 'PATCH' || table !== SESSIONS || params.get('family_id') !== `eq.${family}` || !first) return null;
				first = false;
				return 500;
			});
			const answer = await run();
			assert.equal(answer.status, 503, answer.text);
			assert.deepEqual([answer.body.accessToken, answer.body.refreshToken], [undefined, undefined]);
			const fresh = world.sessions.rows(SESSIONS).filter((row) => row.family_id !== family);
			assert.ok(fresh.length >= 1 && fresh.every((row) => row.revoked_at), JSON.stringify(fresh));
		});
	}
});

describe('step-up family: records off (B11)', () => {
	for (const kind of KINDS) {
		it(`${kind}: answers today's body on the old jti and writes no sudo key`, async (t) => {
			const { world, session, run } = await arrange(t, kind, { records: 'off' });
			await world.sudo(session.accessToken);
			const writes = [];
			const set = world.kv.set;
			world.kv.set = async (key, ...rest) => { writes.push(key); return set(key, ...rest); };
			const answer = await run();
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(Object.keys(answer.body).sort(), ['aal', 'accessToken', 'expiresAt', 'ok', ...(kind === 'recovery' ? ['remaining'] : [])].sort());
			assert.equal(tokenClaims(answer.body.accessToken).jti, session.claims.jti);
			assert.deepEqual(writes, []);
			assert.equal(world.kv.has(`sudo:${session.claims.jti}`), true);
			if (CUT_OFF_KINDS.has(kind)) assert.ok(world.sessions.calls.some((call) => call.method === 'PATCH' && call.body?.created_at), 'redated as today');
		});
	}
});

describe('step-up family: one mint per old family (B12)', () => {
	it('two parallel accepted recovery codes leave one live new family; the loser answers 401', async (t) => {
		const { world, session, family } = await arrange(t, 'recovery');
		let arrivals = 0;
		let release;
		const both = new Promise((done) => { release = done; });
		intercept(world, async ({ method, table, params }) => {
			if (method === 'GET' && table === SESSIONS && String(params.get('select')).includes('revoked_at')) {
				arrivals += 1;
				if (arrivals === 2) release();
				await both;
			}
			return null;
		});
		const answers = await Promise.all([0, 1].map((index) => post(world, 'recovery/verify', session.accessToken, { code: RECOVERY_CODES[index] })));
		assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 401], answers.map((answer) => answer.text).join(' | '));
		const loser = answers.find((answer) => answer.status === 401);
		assert.equal(loser.body.code, 'session_revoked');
		const live = world.sessions.rows(SESSIONS).filter((row) => !row.revoked_at);
		assert.deepEqual(live.map((row) => row.id), [tokenClaims(answers.find((answer) => answer.status === 200).body.accessToken).jti]);
		assert.ok(idsOf(world.sessions.rows(SESSIONS), family).length >= 1);
	});
});

describe('the in-memory session double (B13)', () => {
	it('honours a family_id filter: revoking one family leaves another live', async () => {
		const rows = [{ id: 'x1', family_id: 'x', user_id: USER_A }, { id: 'x2', family_id: 'x', user_id: USER_A }, { id: 'y1', family_id: 'y', user_id: USER_A }];
		const store = createSessionStore({ rows });
		await store.fetchImpl(`https://baas.local/rest/v1/${SESSIONS}?family_id=eq.x&revoked_at=is.null`, { method: 'PATCH', body: JSON.stringify({ revoked_at: 'now' }) });
		assert.deepEqual(store.rows(SESSIONS).map((row) => [row.id, Boolean(row.revoked_at)]), [['x1', true], ['x2', true], ['y1', false]]);
	});
});
