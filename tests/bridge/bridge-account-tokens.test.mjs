/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-tokens.test.mjs                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The personal access tokens of the account plane: the management routes, the sudo window
 * that guards the two irreversible ones, and the rules that keep the secret out of
 * everything but the create answer.
 *
 * The fake behind the bridge is the token table as PostgREST serves it: the account role
 * reads its own rows through the owner policy, it may not read the hash and it may not
 * write at all, and the service role writes. A route that broke one of those rules would
 * be invisible without this file.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grantSudo } from '../../scripts/bridge-guard.mjs';
import { PAT_PERMISSIONS, PAT_RESOURCES } from '../../scripts/bridge-pat-permissions.mjs';
import { PAT_PREFIX } from '../../scripts/bridge-pat-store.mjs';
import { send } from './support/account-world.mjs';
import { gatewayRequest, postJson, sessionConfig, startSessionBridge, USER_A, USER_B } from './support/session-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { AUDIT_TABLE, createPatStore, PAT_TABLE } from './support/pat-postgrest.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The nine keys of a token entry, and nothing else.
const ENTRY_KEYS = ['createdAt', 'expiresAt', 'grants', 'id', 'kind', 'lastUsedAt', 'name', 'revokedAt', 'scopes'];

function inDays(days) {
	return new Date(Date.now() + days * 86_400_000).toISOString();
}

function tokenRow({ id = randomUUID(), userId = USER_A, name = 'CI token', kind = 'classic', scopes = ['pages:read'], grants = [], hash = 'a'.repeat(64), createdAt = '2026-10-01T00:00:00.000Z', expiresAt = '2026-12-01T00:00:00.000Z', revokedAt = null } = {}) {
	return {
		id,
		user_id: userId,
		name,
		kind,
		scopes,
		grants,
		token_hash: hash,
		created_at: createdAt,
		expires_at: expiresAt,
		last_used_at: null,
		revoked_at: revokedAt,
		revoked_reason: revokedAt ? 'user' : null,
	};
}

function claimsOf(token) {
	return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** The bridge, the token table behind it and the key/value store the throttle uses. */
async function world(t, { tokens = [], kv = kvStub(), fail = null } = {}) {
	const config = sessionConfig();
	const store = createPatStore({ tokens, fail });
	const built = await startSessionBridge({ t, config, kv, store });
	return { ...built, store, kv, config };
}

/** A real app session, minted by the bridge itself through the gateway handoff. */
async function signIn(base, subject = USER_A) {
	const request = gatewayRequest({ provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() }, { timestamp: Date.now() });
	const minted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	assert.equal(minted.status, 200);
	const handoff = new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
	const consumed = await postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': 'bridge-test-agent' }, body: { token: handoff } });
	assert.equal(consumed.status, 200);
	return consumed.body.session.accessToken;
}

/** The sudo window of a session: the guard reads it under the session's own jti. */
function openSudo(kv, token, userId = USER_A) {
	grantSudo(kv, { userId, raw: { jti: claimsOf(token).jti } });
}

function classicBody(overrides = {}) {
	return { name: 'CI token', kind: 'classic', expiresAt: inDays(30), scopes: ['pages:read'], ...overrides };
}

function fineGrainedBody(overrides = {}) {
	return { name: 'CI token', kind: 'fine_grained', expiresAt: inDays(30), grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }], ...overrides };
}

/** Every console line a call writes, so a secret in a log line would be caught. */
async function captureConsole(run) {
	const lines = [];
	const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
	const collect = (...args) => lines.push(args.map((value) => String(value)).join(' '));
	console.log = collect;
	console.warn = collect;
	console.error = collect;
	console.info = collect;
	try {
		return { result: await run(), lines };
	} finally {
		Object.assign(console, original);
	}
}

describe('the token routes need an app session', () => {
	it('answers 401 without one on every route', async (t) => {
		const { base } = await world(t);
		const listed = await send(base, '/api/account/tokens');
		assert.equal(listed.status, 401);
		const created = await send(base, '/api/account/tokens', { method: 'POST', body: classicBody() });
		assert.equal(created.status, 401);
		const revoked = await send(base, `/api/account/tokens/${randomUUID()}`, { method: 'DELETE' });
		assert.equal(revoked.status, 401);
	});

	it('answers 401 with a bearer that is not an app session', async (t) => {
		const { base } = await world(t);
		const listed = await send(base, '/api/account/tokens', { headers: { authorization: 'Bearer not-a-session' } });
		assert.equal(listed.status, 401);
	});
});

describe('GET /api/account/tokens', () => {
	it('lists the caller\'s tokens and nobody else\'s', async (t) => {
		const { base } = await world(t, { tokens: [tokenRow({ name: 'A token' }), tokenRow({ userId: USER_B, name: 'B token' })] });
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		assert.equal(listed.status, 200);
		assert.equal(listed.body.ok, true);
		assert.equal(listed.body.tokens.length, 1);
		assert.equal(listed.body.tokens[0].name, 'A token');
	});

	it('leaves the other user\'s row untouched in the table', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow({ name: 'A token' }), tokenRow({ userId: USER_B, name: 'B token' })] });
		const token = await signIn(base);
		await send(base, '/api/account/tokens', { token });
		const foreign = store.rows(PAT_TABLE).find((row) => row.user_id === USER_B);
		assert.equal(foreign.revoked_at, null);
		assert.equal(foreign.revoked_reason, null);
	});

	it('answers exactly the nine keys of an entry, and never the hash', async (t) => {
		const { base } = await world(t, { tokens: [tokenRow({ hash: 'b'.repeat(64) })] });
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		const [entry] = listed.body.tokens;
		assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS);
		assert.equal(listed.text.includes('token_hash'), false);
		assert.equal(listed.text.includes('b'.repeat(64)), false);
	});

	it('reads through the account role and names the columns it may read', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow()] });
		const token = await signIn(base);
		await send(base, '/api/account/tokens', { token });
		const read = store.callsTo(PAT_TABLE).find((call) => call.method === 'GET');
		assert.ok(read, 'the list is read from the token table');
		assert.equal(read.claims?.role, 'osionos_account_user');
		assert.equal(read.claims?.aud, 'osionos-account');
		assert.equal(read.params.get('select'), 'id,name,kind,scopes,grants,created_at,expires_at,last_used_at,revoked_at,revoked_reason');
		assert.equal(read.params.get('order'), 'created_at.desc');
		assert.equal(read.params.get('limit'), '50');
	});

	it('serves the vocabulary of the bridge module, so the panel has one list', async (t) => {
		const { base } = await world(t);
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		assert.deepEqual(listed.body.catalog.resources, PAT_RESOURCES);
		assert.deepEqual(listed.body.catalog.permissions, PAT_PERMISSIONS);
	});

	it('answers 503 and never an empty list when the account plane is down', async (t) => {
		const { base } = await world(t, {
			tokens: [tokenRow()],
			fail: (call) => (call.method === 'GET' && call.table === PAT_TABLE ? { status: 403, body: { code: '22023', message: 'role "osionos_account_user" does not exist' } } : null),
		});
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		assert.equal(listed.status, 503);
		assert.equal(listed.body.code, 'account_plane_unavailable');
		assert.equal(listed.body.tokens, undefined);
	});
});

describe('the live token cap', () => {
	const many = (count, overrides = {}) => Array.from({ length: count }, (_, index) => tokenRow({ name: `t${index}`, hash: String(index).padStart(64, '0'), ...overrides }));

	it('lists only unrevoked tokens, so a revoked row never hides a live one', async (t) => {
		const revoked = many(50, { createdAt: '2026-10-10T00:00:00.000Z', revokedAt: '2026-10-11T00:00:00.000Z' }).map((row, index) => ({ ...row, token_hash: `r${index}`.padStart(64, '0') }));
		const live = tokenRow({ name: 'old live', hash: 'b'.repeat(64), createdAt: '2026-01-01T00:00:00.000Z' });
		const { base } = await world(t, { tokens: [live, ...revoked] });
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		assert.deepEqual(listed.body.tokens.map((entry) => entry.name), ['old live']);
	});

	it('refuses the fifty-first live token with 422 pat_limit_reached and writes nothing', async (t) => {
		const { base, store, kv } = await world(t, { tokens: many(50) });
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		assert.equal(created.status, 422);
		assert.equal(created.body.code, 'pat_limit_reached');
		assert.equal(store.rows(PAT_TABLE).length, 50);
		assert.equal(store.rows(AUDIT_TABLE).some((row) => row.event_type === 'pat_create'), false);
	});

	it('does not count revoked tokens toward the cap', async (t) => {
		const { base, kv } = await world(t, { tokens: many(50, { revokedAt: '2026-10-02T00:00:00.000Z' }) });
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		assert.equal(created.status, 201);
	});
});

describe('POST /api/account/tokens', () => {
	it('answers 201 with the secret once, and stores only the hash of it', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		assert.equal(created.status, 201);
		assert.equal(created.body.ok, true);
		assert.ok(created.body.secret.startsWith(PAT_PREFIX), 'the secret carries the prefix');
		assert.equal(created.body.secret.length, PAT_PREFIX.length + 43);
		assert.deepEqual(Object.keys(created.body.token).sort(), ENTRY_KEYS);
		const [row] = store.rows(PAT_TABLE);
		assert.equal(row.token_hash, createHash('sha256').update(created.body.secret).digest('hex'));
		assert.equal(JSON.stringify(row).includes(created.body.secret), false, 'the secret is nowhere in the stored row');
		assert.equal(row.user_id, USER_A);
		assert.equal(row.kind, 'classic');
		assert.deepEqual(row.scopes, ['pages:read']);
		assert.deepEqual(row.grants, []);
	});

	it('writes a fine-grained token with its grants and no scope', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: fineGrainedBody() });
		assert.equal(created.status, 201);
		const [row] = store.rows(PAT_TABLE);
		assert.equal(row.kind, 'fine_grained');
		assert.deepEqual(row.scopes, []);
		assert.deepEqual(row.grants, [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }]);
	});

	it('writes the audit row before the insert, and it never carries the secret', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		const audit = store.rows(AUDIT_TABLE).find((row) => row.event_type === 'pat_create');
		assert.ok(audit, 'the create is audited');
		assert.equal(audit.details.tokenId, created.body.token.id);
		assert.equal(audit.details.kind, 'classic');
		assert.deepEqual(Object.keys(audit.details).sort(), ['expiresAt', 'kind', 'tokenId']);
		assert.equal(JSON.stringify(audit.details).includes(created.body.secret), false);
		const insert = store.callsTo(PAT_TABLE).find((call) => call.method === 'POST');
		const auditCall = store.callsTo(AUDIT_TABLE).find((call) => call.method === 'POST');
		assert.ok(auditCall, 'the audit row is written');
		assert.ok(insert, 'the row is inserted');
		assert.ok(store.calls.indexOf(auditCall) < store.calls.indexOf(insert), 'the audit row comes first');
	});

	it('refuses a body without an expiry and writes nothing', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: { name: 'CI token', kind: 'classic', scopes: ['pages:read'] } });
		assert.equal(created.status, 422);
		assert.equal(created.body.code, 'pat_expiry_required');
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('refuses an expiry in the past and one more than a year out', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const past = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ expiresAt: inDays(-1) }) });
		assert.equal(past.status, 422);
		assert.equal(past.body.code, 'pat_expiry_required');
		const far = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ expiresAt: inDays(366) }) });
		assert.equal(far.status, 422);
		assert.equal(far.body.code, 'pat_expiry_required');
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('refuses an expiry that is not a date', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ expiresAt: 'whenever' }) });
		assert.equal(created.status, 422);
		assert.equal(created.body.code, 'pat_invalid_body');
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('refuses an unknown scope, resource, attribute and permission with their own code', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const scope = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ scopes: ['pages:fly'] }) });
		assert.equal(scope.status, 422);
		assert.equal(scope.body.code, 'pat_unknown_scope');
		const resource = await send(base, '/api/account/tokens', { method: 'POST', token, body: fineGrainedBody({ grants: [{ resource: 'planets', attributes: ['title'], permissions: ['read'] }] }) });
		assert.equal(resource.status, 422);
		assert.equal(resource.body.code, 'pat_unknown_resource');
		const attribute = await send(base, '/api/account/tokens', { method: 'POST', token, body: fineGrainedBody({ grants: [{ resource: 'pages', attributes: ['title', 'mood'], permissions: ['read'] }] }) });
		assert.equal(attribute.status, 422);
		assert.equal(attribute.body.code, 'pat_unknown_attribute');
		const permission = await send(base, '/api/account/tokens', { method: 'POST', token, body: fineGrainedBody({ grants: [{ resource: 'pages', attributes: ['title'], permissions: ['delete'] }] }) });
		assert.equal(permission.status, 422);
		assert.equal(permission.body.code, 'pat_unknown_permission');
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('refuses a body that carries both a scope and a grant, and a body with an unknown key', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const both = await send(base, '/api/account/tokens', { method: 'POST', token, body: { name: 'CI token', kind: 'classic', expiresAt: inDays(30), scopes: ['pages:read'], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }] } });
		assert.equal(both.status, 422);
		assert.equal(both.body.code, 'pat_invalid_body');
		const unknown = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ nickname: 'ci' }) });
		assert.equal(unknown.status, 422);
		assert.equal(unknown.body.code, 'pat_invalid_body');
		assert.match(unknown.body.message, /nickname/);
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('answers 429 with the seconds to wait on the eleventh create of a minute', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		for (let index = 0; index < 10; index += 1) {
			const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
			assert.equal(created.status, 201);
		}
		const throttled = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		assert.equal(throttled.status, 429);
		assert.equal(throttled.body.code, 'rate_limited');
		assert.equal(throttled.body.retryAfterSeconds, 60);
		assert.equal(store.rows(PAT_TABLE).length, 10);
	});
});

describe('DELETE /api/account/tokens/:id', () => {
	it('answers 404 for another user\'s token and leaves the row alone', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow({ userId: USER_B, name: 'B token' })] });
		const token = await signIn(base);
		const foreign = store.rows(PAT_TABLE)[0];
		const revoked = await send(base, `/api/account/tokens/${foreign.id}`, { method: 'DELETE', token });
		assert.equal(revoked.status, 404);
		assert.equal(revoked.body.code, 'pat_not_found');
		assert.equal(store.rows(PAT_TABLE)[0].revoked_at, null);
	});

	it('revokes the caller\'s token and audits it', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow({ name: 'A token' })] });
		const token = await signIn(base);
		const [row] = store.rows(PAT_TABLE);
		const revoked = await send(base, `/api/account/tokens/${row.id}`, { method: 'DELETE', token });
		assert.equal(revoked.status, 204);
		assert.equal(revoked.text, '');
		const stored = store.rows(PAT_TABLE)[0];
		assert.ok(stored.revoked_at, 'the row carries the revocation');
		assert.equal(stored.revoked_reason, 'user');
		const audit = store.rows(AUDIT_TABLE).find((entry) => entry.event_type === 'pat_revoke');
		assert.ok(audit, 'the revoke is audited');
		assert.equal(audit.details.tokenId, row.id);
	});

	it('answers 404 for a token that is already revoked', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow({ revokedAt: '2026-10-02T00:00:00.000Z' })] });
		const token = await signIn(base);
		const [row] = store.rows(PAT_TABLE);
		const revoked = await send(base, `/api/account/tokens/${row.id}`, { method: 'DELETE', token });
		assert.equal(revoked.status, 404);
		assert.equal(revoked.body.code, 'pat_not_found');
	});

	it('answers 422 when the id is not a uuid', async (t) => {
		const { base } = await world(t);
		const token = await signIn(base);
		const revoked = await send(base, '/api/account/tokens/not-a-uuid', { method: 'DELETE', token });
		assert.equal(revoked.status, 422);
		assert.equal(revoked.body.code, 'pat_invalid_token_id');
	});

	it('answers 429 with the seconds to wait on the thirty-first revoke of a minute', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow()] });
		const token = await signIn(base);
		const [row] = store.rows(PAT_TABLE);
		for (let index = 0; index < 30; index += 1) {
			const revoked = await send(base, `/api/account/tokens/${row.id}`, { method: 'DELETE', token });
			assert.ok(revoked.status === 204 || revoked.status === 404, `the revoke answered ${revoked.status}`);
		}
		const throttled = await send(base, `/api/account/tokens/${row.id}`, { method: 'DELETE', token });
		assert.equal(throttled.status, 429);
		assert.equal(throttled.body.code, 'rate_limited');
		assert.equal(throttled.body.retryAfterSeconds, 60);
	});
});

describe('the sudo window guards the two irreversible routes', () => {
	it('refuses a create without the window', async (t) => {
		const { base, store } = await world(t);
		const token = await signIn(base);
		const created = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() });
		assert.equal(created.status, 403);
		assert.equal(created.body.code, 'sudo_required');
		assert.equal(store.rows(PAT_TABLE).length, 0);
	});

	it('refuses a revoke-all without the window', async (t) => {
		const { base, store } = await world(t, { tokens: [tokenRow()] });
		const token = await signIn(base);
		const revoked = await send(base, '/api/account/tokens', { method: 'DELETE', token });
		assert.equal(revoked.status, 403);
		assert.equal(revoked.body.code, 'sudo_required');
		assert.equal(store.rows(PAT_TABLE)[0].revoked_at, null);
	});

	it('revokes every live token of the caller and audits it', async (t) => {
		const { base, store, kv } = await world(t, { tokens: [tokenRow({ name: 'one' }), tokenRow({ name: 'two' }), tokenRow({ userId: USER_B, name: 'B token' })] });
		const token = await signIn(base);
		openSudo(kv, token);
		const revoked = await send(base, '/api/account/tokens', { method: 'DELETE', token });
		assert.equal(revoked.status, 204);
		const rows = store.rows(PAT_TABLE);
		assert.ok(rows.find((row) => row.name === 'one').revoked_at);
		assert.ok(rows.find((row) => row.name === 'two').revoked_at);
		assert.equal(rows.find((row) => row.name === 'B token').revoked_at, null, 'another user\'s token is untouched');
		assert.ok(store.rows(AUDIT_TABLE).some((row) => row.event_type === 'pat_revoke_all'));
	});
});

describe('the secret is shown once', () => {
	it('never reaches the list, the audit, an error body or a log line', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await signIn(base);
		openSudo(kv, token);
		const { result: created, lines } = await captureConsole(() => send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody() }));
		const secret = created.body.secret;
		assert.ok(secret, 'the create carries the secret');
		const listed = await send(base, '/api/account/tokens', { token });
		assert.equal(listed.text.includes(secret), false);
		assert.equal(JSON.stringify(store.rows(AUDIT_TABLE)).includes(secret), false);
		const refused = await send(base, '/api/account/tokens', { method: 'POST', token, body: classicBody({ nickname: 'ci' }) });
		assert.equal(refused.text.includes(secret), false);
		assert.equal(lines.join('\n').includes(secret), false);
	});
});

describe('the two modules never compare a secret or a hash', () => {
	it('holds no equality comparison next to one', () => {
		const comparison = /([A-Za-z_$][\w$]*)\s*(===|!==)\s*([A-Za-z_$][\w$]*)/g;
		for (const file of ['scripts/bridge-pat-store.mjs', 'scripts/bridge-account-tokens.mjs']) {
			const source = readFileSync(resolve(APP_ROOT, file), 'utf8');
			const offenders = source.split('\n').filter((line) => {
				for (const match of line.matchAll(comparison)) {
					if (/hash|secret/i.test(match[1]) || /hash|secret/i.test(match[3])) return true;
				}
				return false;
			});
			assert.deepEqual(offenders, [], `${file} compares a secret or a hash`);
		}
	});
});

describe('the module is mounted on the account seam', () => {
	it('answers the list route instead of the generic 404', async (t) => {
		const { base } = await world(t, { tokens: [tokenRow({ name: 'Mounted token' })] });
		const token = await signIn(base);
		const listed = await send(base, '/api/account/tokens', { token });
		assert.equal(listed.status, 200);
		assert.equal(listed.body.tokens[0].name, 'Mounted token');
		const unknown = await send(base, '/api/account/nothing-here', { token });
		assert.equal(unknown.status, 404);
	});
});
