/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-keys.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public-key routes of the account plane: GET, POST and DELETE /api/account/keys.
 *
 * The fake behind the bridge is the key table as PostgREST serves it (support/keys-postgrest.mjs):
 * the owner policy, the column grant, the service-role writes, the unique index and the
 * 50-row trigger. A route that scoped a statement wrongly would be invisible without it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { grantSudo } from '../../scripts/bridge-guard.mjs';
import { send } from './support/account-world.mjs';
import { gatewayRequest, postJson, sessionConfig, startSessionBridge, USER_A, USER_B } from './support/session-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { GPG_KEYS, SSH_KEYS, armorOf, lineOf, newPacket, sshLine } from './support/key-fixtures.mjs';
import { KEYS_TABLE, KEY_ROW_LIMIT, createKeysStore, keyRow } from './support/keys-postgrest.mjs';

const KEYS = '/api/account/keys';
const ed = SSH_KEYS.ed25519;
const PRIVATE_MESSAGE = 'Private keys are never accepted. Paste the public key only.';
const ENTRY_KEYS = ['createdAt', 'fingerprint', 'id', 'keyType', 'kind', 'publicKey', 'title'];
const CREATED_KEYS = ['createdAt', 'fingerprint', 'id', 'keyType', 'kind', 'title'];

const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

async function world(t, { keys = [], kv = kvStub(), fail = null } = {}) {
	const store = createKeysStore({ keys, fail });
	const built = await startSessionBridge({ t, config: sessionConfig(), kv, store });
	return { ...built, store, kv };
}

/** A real app session, minted through the gateway handoff. */
async function signIn(base, subject = USER_A) {
	const request = gatewayRequest({ provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() }, { timestamp: Date.now() });
	const minted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	const handoff = new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
	const consumed = await postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': 'bridge-test-agent' }, body: { token: handoff } });
	assert.equal(consumed.status, 200);
	return consumed.body.session.accessToken;
}

/** A signed-in user with an open sudo window. */
async function member(base, kv, subject = USER_A) {
	const token = await signIn(base, subject);
	await grantSudo(kv, { userId: subject, raw: { jti: claimsOf(token).jti } });
	return token;
}

const addKey = (base, token, body) => send(base, KEYS, { method: 'POST', token, body });
const sshBody = (overrides = {}) => ({ kind: 'ssh', title: 'Laptop', publicKey: sshLine(ed), ...overrides });

/** The nth distinct ed25519 key, for tests that add many. */
const nthKey = (index) => lineOf('ssh-ed25519', Buffer.alloc(32, index + 1));

async function captureConsole(run) {
	const lines = [];
	const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
	const collect = (...args) => lines.push(args.map(String).join(' '));
	Object.assign(console, { log: collect, warn: collect, error: collect, info: collect });
	try {
		return { result: await run(), lines };
	} finally {
		Object.assign(console, original);
	}
}

describe('the key routes need an app session', () => {
	it('answers 401 without one on every route, and writes nothing', async (t) => {
		const { base, store } = await world(t);
		assert.equal((await send(base, KEYS)).status, 401);
		assert.equal((await addKey(base, undefined, sshBody())).status, 401);
		assert.equal((await send(base, `${KEYS}/${randomUUID()}`, { method: 'DELETE' })).status, 401);
		assert.equal(store.keyCalls.length, 0);
	});

	it('answers 401 for a PAT-shaped bearer on every route and creates nothing', async (t) => {
		const { base, store } = await world(t);
		const token = `osio_pat_${'A'.repeat(43)}`;
		assert.equal((await send(base, KEYS, { token })).status, 401);
		assert.equal((await addKey(base, token, sshBody())).status, 401);
		assert.equal((await send(base, `${KEYS}/${randomUUID()}`, { method: 'DELETE', token })).status, 401);
		assert.equal(store.keyCalls.length, 0);
		assert.equal(store.rows().length, 0);
		assert.equal(store.auditRows().length, 0);
	});
});

describe('the sudo window guards add and delete', () => {
	it('answers 403 sudo_required without a window and writes no audit row', async (t) => {
		const { base, store } = await world(t);
		const token = await signIn(base);
		const added = await addKey(base, token, sshBody());
		assert.equal(added.status, 403);
		assert.equal(added.body.code, 'sudo_required');
		const removed = await send(base, `${KEYS}/${randomUUID()}`, { method: 'DELETE', token });
		assert.equal(removed.status, 403);
		assert.equal(store.keyCalls.length, 0);
		assert.equal(store.auditRows().length, 0);
	});

	it('lists without a window: reading needs no sudo', async (t) => {
		const { base } = await world(t);
		const listed = await send(base, KEYS, { token: await signIn(base) });
		assert.equal(listed.status, 200);
		assert.deepEqual(listed.body, { ok: true, keys: [] });
	});
});

describe('POST /api/account/keys', () => {
	it('stores an ssh key: 201, the entry without the key text, the line rebuilt without the comment', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await member(base, kv);
		const added = await addKey(base, token, sshBody({ publicKey: sshLine(ed, 'secret-comment') }));
		assert.equal(added.status, 201);
		assert.deepEqual(Object.keys(added.body.key).sort(), CREATED_KEYS);
		assert.equal(added.body.key.fingerprint, ed.fingerprint);
		assert.equal(added.body.key.keyType, 'ssh-ed25519');
		assert.equal(added.body.key.kind, 'ssh');
		assert.equal(added.body.key.title, 'Laptop');
		assert.ok(!added.text.includes('secret-comment'));
		const [row] = store.rows();
		assert.equal(row.user_id, USER_A);
		assert.equal(row.public_key, `${ed.type} ${ed.blob}`);
		assert.ok(!JSON.stringify(store.auditRows()).includes('secret-comment'));
	});

	it('stores a gpg key under its 40-hex fingerprint', async (t) => {
		const { base, kv } = await world(t);
		const token = await member(base, kv);
		const added = await addKey(base, token, { kind: 'gpg', title: 'Signing', publicKey: GPG_KEYS.ed25519.armor });
		assert.equal(added.status, 201);
		assert.equal(added.body.key.fingerprint, GPG_KEYS.ed25519.fingerprint);
		assert.equal(added.body.key.keyType, 'eddsa');
	});

	it('trims the title and takes the user id from the session, never from the body', async (t) => {
		const { base, store, kv } = await world(t);
		const token = await member(base, kv);
		const added = await addKey(base, token, sshBody({ title: '  Work laptop  ' }));
		assert.equal(added.body.key.title, 'Work laptop');
		assert.equal(store.rows()[0].user_id, USER_A);
		assert.equal(store.keyCalls.at(-1).role, 'service_role');
	});

	it('answers 409 key_exists for the same key twice, and allows it under another user', async (t) => {
		const { base, kv } = await world(t);
		const tokenA = await member(base, kv, USER_A);
		const tokenB = await member(base, kv, USER_B);
		assert.equal((await addKey(base, tokenA, sshBody())).status, 201);
		const again = await addKey(base, tokenA, sshBody({ title: 'Other title' }));
		assert.equal(again.status, 409);
		assert.equal(again.body.code, 'key_exists');
		assert.equal((await addKey(base, tokenB, sshBody())).status, 201);
	});

	it('maps the 51st-row trigger to 409 key_limit', async (t) => {
		const keys = Array.from({ length: KEY_ROW_LIMIT }, (_, index) => keyRow({ userId: USER_A, fingerprint: `SHA256:seed${index}` }));
		const { base, kv } = await world(t, { keys });
		const added = await addKey(base, await member(base, kv), sshBody());
		assert.equal(added.status, 409);
		assert.equal(added.body.code, 'key_limit');
	});

	it('throttles the eleventh add of an hour with 429 and a retry window of an hour', async (t) => {
		const { base, kv } = await world(t);
		const token = await member(base, kv);
		for (let index = 0; index < 10; index += 1) {
			assert.equal((await addKey(base, token, sshBody({ publicKey: nthKey(index) }))).status, 201, `add ${index}`);
		}
		const throttled = await addKey(base, token, sshBody({ publicKey: nthKey(10) }));
		assert.equal(throttled.status, 429);
		assert.equal(throttled.body.code, 'rate_limited');
		assert.equal(throttled.body.retryAfterSeconds, 3600);
		assert.equal(throttled.headers.get('retry-after'), '3600');
	});

	it('writes the audit row before the insert, with the kind and fingerprint only', async (t) => {
		const { base, store, kv } = await world(t);
		await addKey(base, await member(base, kv), sshBody());
		const order = store.events.filter((event) => event.endsWith('osionos_bridge_audit_events') || event.endsWith(KEYS_TABLE));
		assert.deepEqual(order, ['POST osionos_bridge_audit_events', `POST ${KEYS_TABLE}`]);
		const [audit] = store.auditRows();
		assert.equal(audit.event_type, 'account.key.add');
		assert.deepEqual(audit.details, { kind: 'ssh', fingerprint: ed.fingerprint });
	});

	it('does not insert when the audit row cannot be written', async (t) => {
		const { base, store, kv } = await world(t, { fail: (call) => (call.table === 'osionos_bridge_audit_events' ? { status: 500 } : null) });
		const added = await addKey(base, await member(base, kv), sshBody());
		assert.equal(added.status, 503);
		assert.equal(store.rows().length, 0);
	});

	it('answers 503 when the table is missing, not an empty success', async (t) => {
		const { base, kv } = await world(t, { fail: (call) => (call.table === KEYS_TABLE && call.method === 'POST' ? { status: 404, body: {} } : null) });
		const added = await addKey(base, await member(base, kv), sshBody());
		assert.equal(added.status, 503);
		assert.equal(added.body.code, 'account_plane_unavailable');
	});
});

describe('POST validates the body before it parses anything', () => {
	const sentinel = 'SENTINEL-VALUE-1f9c';
	const bodies = [
		['a fingerprint field', sshBody({ fingerprint: sentinel })],
		['a keyType field', sshBody({ keyType: sentinel })],
		['an id field', sshBody({ id: sentinel })],
		['an unknown field', sshBody({ [sentinel]: 1 })],
		['a user_id field', sshBody({ user_id: USER_B })],
		['a kind that is neither ssh nor gpg', sshBody({ kind: 'pgp' })],
		['no kind', { title: 'Laptop', publicKey: sshLine(ed) }],
		['an empty title', sshBody({ title: '   ' })],
		['an 81-character title', sshBody({ title: 'a'.repeat(81) })],
		['a title with a control character', sshBody({ title: 'bad\nname' })],
		['a title that is not text', sshBody({ title: 7 })],
		['no publicKey', { kind: 'ssh', title: 'Laptop' }],
		['a publicKey that is not text', sshBody({ publicKey: { a: 1 } })],
		['an array body', [sshBody()]],
	];
	for (const [name, body] of bodies) {
		it(`answers 422 for ${name}, writes nothing and audits nothing`, async (t) => {
			const { base, store, kv } = await world(t);
			const added = await send(base, KEYS, { method: 'POST', token: await member(base, kv), body });
			assert.equal(added.status, 422);
			assert.ok(!added.text.includes(sentinel));
			assert.equal(store.rows().length, 0);
			assert.ok(!JSON.stringify(store.auditRows()).includes(sentinel));
			assert.equal(store.auditRows().length, 0);
		});
	}

	it('accepts an 80-character title', async (t) => {
		const { base, kv } = await world(t);
		assert.equal((await addKey(base, await member(base, kv), sshBody({ title: 'a'.repeat(80) }))).status, 201);
	});
});

describe('POST answers the validator\'s refusals as 400 and stores nothing', () => {
	const cases = [
		['a weak RSA key', sshBody({ publicKey: sshLine(SSH_KEYS.rsa2048) }), 'key_weak'],
		['a key line with options', sshBody({ publicKey: `command="x" ${sshLine(ed)}` }), 'key_invalid'],
		['a second line', sshBody({ publicKey: `${sshLine(ed)}\n${sshLine(ed)}` }), 'key_invalid'],
		['a gpg block sent as ssh', sshBody({ publicKey: GPG_KEYS.ed25519.armor }), 'key_invalid'],
		['an ssh line sent as gpg', { kind: 'gpg', title: 'x', publicKey: sshLine(ed) }, 'key_invalid'],
		['a v5 gpg key', { kind: 'gpg', title: 'x', publicKey: armorOf(Buffer.concat([newPacket(6, Buffer.from([5, 0, 0, 0, 0, 22]))])) }, 'key_unsupported'],
	];
	for (const [name, body, code] of cases) {
		it(`refuses ${name} with ${code}`, async (t) => {
			const { base, store, kv } = await world(t);
			const added = await send(base, KEYS, { method: 'POST', token: await member(base, kv), body });
			assert.equal(added.status, 400);
			assert.equal(added.body.code, code);
			assert.equal(store.rows().length, 0);
		});
	}
});

describe('private keys are refused, never stored, never echoed', () => {
	const secret = 'c2VjcmV0LXByaXZhdGUta2V5LW1hdGVyaWFsLXRoYXQtbXVzdC1uZXZlci1sZWF2ZQ';
	const openssh = Buffer.concat([Buffer.from('openssh-key-v1\0'), Buffer.from(secret)]).toString('base64');
	const samples = [
		['ssh', `-----BEGIN OPENSSH PRIVATE KEY-----\n${openssh}\n-----END OPENSSH PRIVATE KEY-----\n`],
		['ssh', `-----BEGIN RSA PRIVATE KEY-----\n${secret}${secret}\n-----END RSA PRIVATE KEY-----`],
		['ssh', `ssh-ed25519 ${openssh}`],
		['gpg', `-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n${secret}\n-----END PGP PRIVATE KEY BLOCK-----`],
		['gpg', armorOf(Buffer.concat([newPacket(6, Buffer.from([4, 0, 0, 0, 0, 22])), newPacket(7, Buffer.from(secret))]))],
		['gpg', armorOf(Buffer.concat([newPacket(5, Buffer.from(secret))]))],
	];
	const windows = (text) => Array.from({ length: Math.max(0, text.length - 12) }, (_, start) => text.slice(start, start + 12)).filter((_, index) => index % 5 === 0);

	for (const [kind, text] of samples) {
		it(`answers 400 private_key_refused for a ${kind} sample and leaks no substring of it`, async (t) => {
			const { base, store, kv } = await world(t);
			const token = await member(base, kv);
			const { result, lines } = await captureConsole(() => addKey(base, token, { kind, title: 'pasted', publicKey: text }));
			assert.equal(result.status, 400);
			assert.equal(result.body.code, 'private_key_refused');
			assert.equal(result.body.message, PRIVATE_MESSAGE);
			assert.equal(store.rows().length, 0);
			const audits = JSON.stringify(store.auditRows());
			const logged = lines.join('\n');
			for (const piece of windows(secret + openssh)) {
				assert.ok(!result.text.includes(piece), 'body');
				assert.ok(!audits.includes(piece), 'audit');
				assert.ok(!logged.includes(piece), 'console');
			}
			for (const row of store.auditRows()) assert.equal(row.details.fingerprint, undefined);
		});
	}
});

describe('GET /api/account/keys', () => {
	it('lists the caller\'s keys newest first through the account role, public fields only', async (t) => {
		const rows = [
			keyRow({ userId: USER_A, title: 'Old', fingerprint: 'SHA256:old', createdAt: '2026-09-01T00:00:00.000Z' }),
			keyRow({ userId: USER_A, title: 'New', fingerprint: 'SHA256:new', createdAt: '2026-10-01T00:00:00.000Z' }),
		];
		const { base, store } = await world(t, { keys: rows });
		const listed = await send(base, KEYS, { token: await signIn(base) });
		assert.equal(listed.status, 200);
		assert.deepEqual(listed.body.keys.map((entry) => entry.title), ['New', 'Old']);
		assert.deepEqual(Object.keys(listed.body.keys[0]).sort(), ENTRY_KEYS);
		assert.equal(listed.body.keys[0].publicKey, 'ssh-ed25519 AAAA');
		const read = store.keyCalls.find((call) => call.method === 'GET');
		assert.equal(read.role, 'osionos_account_user');
		assert.ok(!listed.text.includes('user_id'));
	});

	it('answers 503 when the table is missing', async (t) => {
		const { base } = await world(t, { fail: (call) => (call.table === KEYS_TABLE ? { status: 404, body: {} } : null) });
		const listed = await send(base, KEYS, { token: await signIn(base) });
		assert.equal(listed.status, 503);
	});
});

describe('two users: nobody reaches another user\'s key', () => {
	it('hides A\'s keys from B, answers B\'s delete like a random id, and leaves A\'s row', async (t) => {
		const { base, store, kv } = await world(t);
		const tokenA = await member(base, kv, USER_A);
		const tokenB = await member(base, kv, USER_B);
		const added = await addKey(base, tokenA, sshBody());
		const id = added.body.key.id;
		assert.deepEqual((await send(base, KEYS, { token: tokenB })).body.keys, []);
		const foreign = await send(base, `${KEYS}/${id}`, { method: 'DELETE', token: tokenB });
		const random = await send(base, `${KEYS}/${randomUUID()}`, { method: 'DELETE', token: tokenB });
		assert.equal(foreign.status, 404);
		assert.equal(random.status, 404);
		assert.deepEqual(foreign.body, random.body);
		assert.equal(foreign.body.code, 'key_not_found');
		assert.equal((await send(base, KEYS, { token: tokenA })).body.keys.length, 1);
		assert.equal(store.rows().length, 1);
	});
});

describe('DELETE /api/account/keys/:id', () => {
	it('removes the caller\'s key with ONE statement scoped by id and user_id, and answers 204', async (t) => {
		const row = keyRow({ userId: USER_A, fingerprint: 'SHA256:mine' });
		const { base, store, kv } = await world(t, { keys: [row, keyRow({ userId: USER_A, fingerprint: 'SHA256:other' })] });
		const removed = await send(base, `${KEYS}/${row.id}`, { method: 'DELETE', token: await member(base, kv) });
		assert.equal(removed.status, 204);
		assert.deepEqual(store.rows().map((entry) => entry.fingerprint), ['SHA256:other']);
		assert.equal(store.keyCalls.length, 1, 'no select before the delete');
		const [call] = store.keyCalls;
		assert.equal(call.method, 'DELETE');
		assert.equal(call.params.get('id'), `eq.${row.id}`);
		assert.equal(call.params.get('user_id'), `eq.${USER_A}`);
		assert.equal(call.role, 'service_role');
	});

	it('writes the audit row before the delete', async (t) => {
		const row = keyRow({ userId: USER_A, fingerprint: 'SHA256:mine' });
		const { base, store, kv } = await world(t, { keys: [row] });
		await send(base, `${KEYS}/${row.id}`, { method: 'DELETE', token: await member(base, kv) });
		assert.deepEqual(store.events.filter((event) => event.endsWith('osionos_bridge_audit_events') || event.endsWith(KEYS_TABLE)), ['POST osionos_bridge_audit_events', `DELETE ${KEYS_TABLE}`]);
		assert.equal(store.auditRows()[0].event_type, 'account.key.delete');
	});

	it('answers 422 for an id that is not a UUID, without touching the table', async (t) => {
		const { base, store, kv } = await world(t);
		const removed = await send(base, `${KEYS}/not-a-uuid`, { method: 'DELETE', token: await member(base, kv) });
		assert.equal(removed.status, 422);
		assert.equal(store.keyCalls.length, 0);
	});

	it('answers 404 on a second delete of the same id', async (t) => {
		const row = keyRow({ userId: USER_A, fingerprint: 'SHA256:mine' });
		const { base, kv } = await world(t, { keys: [row] });
		const token = await member(base, kv);
		assert.equal((await send(base, `${KEYS}/${row.id}`, { method: 'DELETE', token })).status, 204);
		assert.equal((await send(base, `${KEYS}/${row.id}`, { method: 'DELETE', token })).status, 404);
	});
});

describe('the routes leave other paths alone', () => {
	it('does not answer a path that merely starts like the key path', async (t) => {
		const { base } = await world(t);
		const other = await send(base, '/api/account/keys-extra', { token: await signIn(base) });
		assert.equal(other.status, 404);
	});
});
