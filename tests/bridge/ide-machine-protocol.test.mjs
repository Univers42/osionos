// The own-machines protocol (docs/ide/vscode-backend/own-machines-plan.md, devil verdict
// 2026-10-31): the machine token only the bridge can sign, the messages a machine signs, and the
// loopback origin rule. One module, so the node, the bridge and the tests read one contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

import {
	MACHINE_TOKEN_VERSION, bridgeKeyFromSeed, isLoopbackIdeOrigin, newMachineId, signMachineToken, verifyMachineToken,
} from '../../scripts/ide-machine-protocol.mjs';
import { isNodeId } from '../../scripts/ide-token.mjs';

const SEED = randomBytes(32).toString('base64url');
const KEY = bridgeKeyFromSeed(SEED);
const KEYS = { [KEY.kid]: KEY.publicKey };
const AUD = 'http://127.0.0.1:4100';
const NOW = Date.UTC(2026, 9, 31, 12);
const SUB = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const mint = (over = {}) => signMachineToken({ sub: SUB, machine: 'm-abcdefghijkl', aud: AUD, seed: SEED, now: NOW, ...over });
const check = (token, over = {}) => verifyMachineToken(token, { keys: KEYS, machine: 'm-abcdefghijkl', aud: AUD, now: NOW + 1000, ...over });

test('a token the bridge signed verifies for its machine and origin', () => {
	const { token } = mint();
	assert.ok(token.startsWith(`${MACHINE_TOKEN_VERSION}.${KEY.kid}.`));
	const claims = check(token);
	assert.equal(claims.sub, SUB);
	assert.equal(claims.machine, 'm-abcdefghijkl');
	assert.equal(claims.aud, AUD);
	assert.ok(claims.exp - claims.iat <= 900);
	assert.match(claims.jti, /^[0-9a-f-]{36}$/);
});

test('every refusal is its own reason', () => {
	const { token } = mint();
	const other = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
	const cases = {
		'another machine': () => check(token, { machine: 'm-zzzzzzzzzzzz' }),
		'another origin': () => check(token, { aud: 'http://127.0.0.1:4200' }),
		'expired': () => check(token, { now: NOW + 901_000 }),
		'unknown key': () => check(token, { keys: { [other.kid]: other.publicKey } }),
		'a key under the right kid but another value': () => check(token, { keys: { [KEY.kid]: other.publicKey } }),
		'a tampered payload': () => check(token.replace(/\.([^.]+)\.([^.]+)$/, (_m, p, s) => `.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' })).toString('base64url')}.${s}`)),
		'another version': () => check(token.replace(MACHINE_TOKEN_VERSION, 'osionos_ide1')),
		'garbage': () => check('osionos_mc1.x.y.z'),
		'not a string': () => check(undefined),
	};
	for (const [name, run] of Object.entries(cases)) assert.throws(run, /machine token/, name);
});

test('ttl is capped at 900 seconds', () => {
	assert.throws(() => mint({ ttlSeconds: 901 }), /900/);
});

test('the bridge seed must be exactly 32 bytes', () => {
	for (const bad of ['', 'abc', randomBytes(31).toString('base64url'), randomBytes(33).toString('base64url')]) {
		assert.throws(() => bridgeKeyFromSeed(bad), /32-byte/, JSON.stringify(bad));
	}
	const { publicKey } = generateKeyPairSync('ed25519');
	assert.ok(publicKey);
});

test('only an http 127.0.0.0/8 literal with a high port and nothing else is a machine origin', () => {
	for (const ok of ['http://127.0.0.1:4100', 'http://127.1.2.3:65535', 'http://127.0.0.1:1024']) assert.equal(isLoopbackIdeOrigin(ok), true, ok);
	for (const bad of ['https://127.0.0.1:4100', 'http://localhost:4100', 'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:4100/', 'http://u@127.0.0.1:4100', 'http://127.0.0.1:4100/x', 'http://127.0.0.1.evil.example:4100', 'http://10.0.0.1:4100', 'javascript:1', 7]) {
		assert.equal(isLoopbackIdeOrigin(bad), false, String(bad));
	}
});

test('machine ids are random, distinct and valid node ids', () => {
	const ids = new Set(Array.from({ length: 200 }, newMachineId));
	assert.equal(ids.size, 200);
	for (const id of ids) assert.ok(isNodeId(id) && /^m-[a-z2-7]{16}$/.test(id), id);
});
