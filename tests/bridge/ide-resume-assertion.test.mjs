// The resume assertion (devil verdict 2026-11-01, Amendment 1, R2): the bridge signs it with no
// step-up, it lives 60 s, and it has its own prefix and signing domain, so no node, old or new,
// can take it for a machine token (A8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

import {
	RESUME_VERSION, bridgeKeyFromSeed, signMachineToken, signResumeAssertion, verifyMachineToken, verifyResumeAssertion,
} from '../../scripts/ide-machine-protocol.mjs';
import { verifyMachineToken as verifyAtBae4497e } from '../fixtures/osionos-node-bae4497e/ide-machine-protocol.mjs';
import { readPtyAuth as readAuthAtBae4497e } from '../fixtures/osionos-node-bae4497e/pty-wire.mjs';

const SEED = randomBytes(32).toString('base64url');
const KEY = bridgeKeyFromSeed(SEED);
const KEYS = { [KEY.kid]: KEY.publicKey };
const SUB = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MACHINE = 'm-abcdefghijklmnop';
const AUD = 'http://127.0.0.1:4100';
const NOW = 1_800_000_000_000;
const expect = { keys: KEYS, machine: MACHINE, aud: AUD, now: NOW };
const resume = (over = {}) => signResumeAssertion({ sub: SUB, machine: MACHINE, aud: AUD, seed: SEED, now: NOW, ...over });
const machineToken = (over = {}) => signMachineToken({ sub: SUB, machine: MACHINE, aud: AUD, seed: SEED, now: NOW, ...over }).token;
const claimsOf = (assertion) => JSON.parse(Buffer.from(assertion.split('.')[2], 'base64url').toString('utf8'));

test('R2: a resume assertion has its own prefix, typ resume, every claim, and lives at most 60 s', () => {
	const { assertion, exp } = resume();
	assert.ok(assertion.startsWith(`${RESUME_VERSION}.${KEY.kid}.`));
	assert.equal(RESUME_VERSION, 'osionos_mr1');
	const claims = claimsOf(assertion);
	assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'jti', 'machine', 'sub', 'typ']);
	assert.equal(claims.typ, 'resume');
	assert.equal(claims.exp - claims.iat, 60);
	assert.equal(exp, claims.exp);
	assert.throws(() => resume({ ttlSeconds: 61 }), /at most 60/);
	assert.equal(verifyResumeAssertion(assertion, expect).sub, SUB);
});

test('R2: a resume assertion is refused when expired, for another machine or origin, or forged', () => {
	const { assertion } = resume();
	assert.throws(() => verifyResumeAssertion(assertion, { ...expect, now: NOW + 60_000 }), /expired/);
	assert.throws(() => verifyResumeAssertion(assertion, { ...expect, machine: 'm-ponmlkjihgfedcba' }), /another machine/);
	assert.throws(() => verifyResumeAssertion(assertion, { ...expect, aud: 'http://127.0.0.1:4101' }), /another origin/);
	assert.throws(() => verifyResumeAssertion(assertion.replace(/.{4}$/, 'AAAA'), expect), /bad signature/);
});

test('R2: a machine token is refused where a resume assertion is expected, and the reverse', () => {
	assert.throws(() => verifyResumeAssertion(machineToken(), expect), /wrong shape/);
	const swapped = machineToken().replace(/^osionos_mc1\./, `${RESUME_VERSION}.`);
	assert.throws(() => verifyResumeAssertion(swapped, expect), /bad signature/, 'another signing domain');
	assert.throws(() => verifyMachineToken(resume().assertion, expect), /wrong shape/);
});

test('R2 (A8): the node verifier at bae4497e rejects a resume assertion, under either prefix', () => {
	const { assertion } = resume();
	assert.throws(() => verifyAtBae4497e(assertion, expect), /wrong shape/);
	const disguised = assertion.replace(/^osionos_mr1\./, 'osionos_mc1.');
	assert.throws(() => verifyAtBae4497e(disguised, expect), /bad signature/, 'domain-separated: the old verifier cannot be fooled');
	assert.equal(readAuthAtBae4497e(JSON.stringify({ token: assertion, cols: 80, rows: 24 })), null, 'the old wire refuses it as a token');
});

test('R6: the signed remember choice rides on the machine token; the node at bae4497e still accepts it', () => {
	const remembered = machineToken({ remember: true });
	assert.equal(claimsOf(remembered).remember, true);
	assert.equal(verifyMachineToken(remembered, expect).remember, true);
	assert.equal(verifyAtBae4497e(remembered, expect).sub, SUB, 'old nodes ignore the claim (R14)');
	assert.equal(Object.hasOwn(claimsOf(machineToken()), 'remember'), false, 'without the choice the claims are unchanged');
	assert.equal(Object.hasOwn(claimsOf(machineToken({ remember: 'yes' })), 'remember'), false, 'only true is signed');
});
