// A remembered computer on /api/pty (devil verdict 2026-11-01, Amendment 1, R1-R6, R8; groot ADR
// 0041, R5 overridden: production and the beta remember). The device secret is half of an opening:
// it opens a shell only beside a fresh resume assertion the bridge signed for the owner and this
// machine, only under the app origin it was issued to, and it is issued only from a step-up token
// that carries the person's remember choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHeartbeat } from '../../packages/osionos-node/heartbeat.mjs';
import { saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { createRememberedComputers } from '../../packages/osionos-node/remembered-computers.mjs';
import { KEY, MACHINE, OWNER, STRANGER, mint, mintResume, open, world } from './support/pty-world.mjs';
import { pairedMachine } from './support/paired-node.mjs';

const PROD = 'https://baas.tail10f2ea.ts.net:8443';
const BETA = 'https://baas-beta.tail10f2ea.ts.net';
const BOTH = [PROD, BETA];

/** A step-up open with "Remember this computer" checked, under `appOrigin`: the device secret it was told. */
async function rememberUnder(origin, base, appOrigin) {
	const conn = await open(origin, { token: mint(base, { remember: true }), appOrigin });
	assert.equal(conn.sent[0].op, 'opened');
	return conn.sent[0].device;
}

const sameOrigin = (base) => ({ 'sec-fetch-site': 'same-origin', origin: base, 'content-type': 'application/json' });

test('R1: a device secret alone, an assertion alone, an expired or a replayed assertion each get 4401 and spawn nothing', async (t) => {
	const { base, origin, host } = await world(t, { remember: BOTH });
	const device = await rememberUnder(origin, base, PROD);
	assert.match(device, /^[A-Za-z0-9_-]{43}$/);
	const spawned = host.spawned;
	const replayed = mintResume(base);
	assert.equal((await open(origin, { device, assertion: replayed, appOrigin: PROD })).sent[0].op, 'opened', 'both factors open');
	const refused = [
		{ device, appOrigin: PROD }, { assertion: mintResume(base), appOrigin: PROD }, { secret: device },
		{ device, assertion: mintResume(base, { now: Date.now() - 61_000 }), appOrigin: PROD },
		{ device, assertion: replayed, appOrigin: PROD },
		{ device, assertion: mint(base), appOrigin: PROD },
	];
	for (const credential of refused) assert.equal((await open(origin, credential)).closeCode, 4401, JSON.stringify(Object.keys(credential)));
	assert.equal(host.spawned, spawned + 1);
});

test('R2: /api/node/session refuses a resume assertion; the jti a shell spent cannot be spent there', async (t) => {
	const { base } = await world(t, { remember: BOTH });
	const session = (bearer) => fetch(`${base}/api/node/session`, {
		method: 'POST', headers: { ...sameOrigin(base), authorization: `Bearer ${bearer}` }, body: JSON.stringify({ node: MACHINE }),
	});
	assert.equal((await session(mintResume(base))).status, 401);
});

test('R3: a valid device secret with another account\'s or another machine\'s assertion gets 4401', async (t) => {
	const { base, origin, host } = await world(t, { remember: BOTH });
	const device = await rememberUnder(origin, base, PROD);
	const spawned = host.spawned;
	for (const over of [{ sub: STRANGER }, { machine: 'm-ponmlkjihgfedcba' }, { aud: 'http://127.0.0.1:1' }]) {
		assert.equal((await open(origin, { device, assertion: mintResume(base, over), appOrigin: PROD })).closeCode, 4401, JSON.stringify(over));
	}
	assert.equal(host.spawned, spawned);
	assert.equal((await open(origin, { device, assertion: mintResume(base), appOrigin: PROD })).sent[0].op, 'opened', 'not burnt by the refusals');
});

test('R4: a secret remembered under production does not open under the beta, and the reverse', async (t) => {
	const { base, origin } = await world(t, { remember: BOTH });
	const prod = await rememberUnder(origin, base, PROD);
	const beta = await rememberUnder(origin, base, BETA);
	assert.equal((await open(origin, { device: prod, assertion: mintResume(base), appOrigin: BETA })).closeCode, 4401);
	assert.equal((await open(origin, { device: beta, assertion: mintResume(base), appOrigin: PROD })).closeCode, 4401);
	assert.equal((await open(origin, { device: beta, assertion: mintResume(base), appOrigin: BETA })).sent[0].op, 'opened');
});

test('R5 (overridden, ADR 0041): only a remember origin gets a device secret; the beta is one by the owner\'s choice', async (t) => {
	const narrow = await world(t, { remember: [PROD] });
	const beta = await open(narrow.origin, { token: mint(narrow.base, { remember: true }), appOrigin: BETA });
	assert.equal(beta.sent[0].op, 'opened');
	assert.equal(beta.sent[0].device, undefined, 'a node not told to remember the beta gives it nothing');
	const dev = await open(narrow.origin, { token: mint(narrow.base, { remember: true }), appOrigin: 'http://localhost:3001' });
	assert.deepEqual(Object.keys(dev.sent[0]).sort(), ['op', 'secret'], 'a dev app origin opens, and is remembered by nothing');
	const both = await world(t, { remember: BOTH });
	assert.match(await rememberUnder(both.origin, both.base, BETA), /^[A-Za-z0-9_-]{43}$/);
});

test('R6: a device secret only from a remembering token with an origin; never from a session secret or a remembered open', async (t) => {
	const { base, origin } = await world(t, { remember: BOTH });
	const unchecked = await open(origin, { token: mint(base), appOrigin: PROD });
	assert.equal(unchecked.sent[0].device, undefined, 'the checkbox off');
	const noOrigin = await open(origin, { token: mint(base, { remember: true }) });
	assert.equal(noOrigin.sent[0].device, undefined, 'an older frame names no origin');
	const fromSecret = await open(origin, { secret: noOrigin.sent[0].secret });
	assert.deepEqual(fromSecret.sent[0], { op: 'opened' });
	const device = await rememberUnder(origin, base, PROD);
	const resumed = await open(origin, { device, assertion: mintResume(base), appOrigin: PROD });
	assert.match(resumed.sent[0].secret, /^[A-Za-z0-9_-]{43}$/, 'a remembered open gets a session secret for its next shells');
	assert.equal(resumed.sent[0].device, undefined, 'and no new device secret: no rotation');
	assert.equal((await open(origin, { device, assertion: mintResume(base), appOrigin: PROD })).sent[0].op, 'opened', 'the old one still opens');
});

test('R6: a node without remembered computers ignores the remember claim, and its frame learns it from /api/machine/self', async (t) => {
	const plain = await world(t);
	const conn = await open(plain.origin, { token: mint(plain.base, { remember: true }), appOrigin: PROD });
	assert.equal(conn.sent[0].device, undefined);
	assert.equal((await open(plain.origin, { device: 'A'.repeat(43), assertion: mintResume(plain.base), appOrigin: PROD })).closeCode, 4401);
	const self = async (base) => (await fetch(`${base}/api/machine/self`, { headers: { 'sec-fetch-site': 'same-origin' } })).json();
	assert.deepEqual(await self(plain.base), { paired: true, machineId: MACHINE });
	const remembering = await world(t, { remember: BOTH });
	assert.deepEqual(await self(remembering.base), { paired: true, machineId: MACHINE, remember: true });
});

test('R8: forget from the node\'s own page deletes the record; another origin cannot; revoke deletes the file', async (t) => {
	const { base, origin, file } = await world(t, { remember: BOTH });
	const device = await rememberUnder(origin, base, PROD);
	const forget = (headers) => fetch(`${base}/api/machine/forget`, { method: 'POST', headers, body: JSON.stringify({ device }) });
	assert.equal((await forget({ ...sameOrigin(base), origin: PROD, 'sec-fetch-site': 'cross-site' })).status, 403);
	assert.equal((await open(origin, { device, assertion: mintResume(base), appOrigin: PROD })).sent[0].op, 'opened');
	assert.equal((await forget(sameOrigin(base))).status, 204);
	assert.equal((await open(origin, { device, assertion: mintResume(base), appOrigin: PROD })).closeCode, 4401);
	await rememberUnder(origin, base, PROD);
	assert.equal(existsSync(file), true);
	origin.revoke(OWNER);
	assert.equal(existsSync(file), false);
});

test('R8: the heartbeat\'s 410 deletes the remembered computers before the node stops', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'beat-forget-'));
	chmodSync(dir, 0o700);
	const machineFile = join(dir, 'machine.json');
	const remembered = join(dir, 'remembered-computers.json');
	saveMachine(machineFile, pairedMachine(KEY));
	createRememberedComputers({ file: remembered, owner: OWNER, machine: MACHINE, origins: [PROD] }).issue(PROD);
	assert.equal(existsSync(remembered), true);
	let leftOnStop = null;
	const beat = createHeartbeat({
		file: machineFile, keys: { [KEY.kid]: KEY.publicKey }, ideOrigin: 'http://127.0.0.1:4100', forget: [remembered],
		fetchImpl: async () => new Response('', { status: 410 }),
		onGone: () => { leftOnStop = [existsSync(remembered), existsSync(machineFile)]; },
	});
	t.after(() => beat.stop());
	assert.equal(await beat.once(), 'gone');
	assert.deepEqual(leftOnStop, [false, false]);
});
