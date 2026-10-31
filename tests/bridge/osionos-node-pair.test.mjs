// `osionos-node pair` and the heartbeat (own-machines plan, devil verdict 2026-10-31, 3, 4, 6, 7),
// against a fake bridge: the machine signs what the contract says, writes its identity only after
// the owner accepts the account, and leaves on a 410.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { randomBytes, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pairMachine } from '../../packages/osionos-node/pair.mjs';
import { createHeartbeat } from '../../packages/osionos-node/heartbeat.mjs';
import { saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { bridgeKeyFromSeed, heartbeatMessage, nextKeyMessage, pairPollMessage, pairStartMessage } from '../../scripts/machine-protocol.mjs';
import { b64url, fromB64url, generateAgentKeyPair, verifyMessage } from '../../scripts/ide-agent-frames.mjs';

const BRIDGE = 'https://bridge.example:10000';
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KEY = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
const NEXT = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
const reply = (status, body) => ({ status, ok: status < 300, json: async () => body });

function fakeBridge({ email = 'owner@example.com', pendingPolls = 1 } = {}) {
	const calls = [];
	let polls = 0;
	let startKey = null;
	const fetchImpl = async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push({ path: new URL(url).pathname, body });
		if (url.endsWith('/pair/start')) {
			startKey = fromB64url(body.pubkey);
			assert.ok(verifyMessage(startKey, pairStartMessage({ origin: BRIDGE, pubkey: body.pubkey, name: body.name, ts: body.ts }), body.sig));
			return reply(200, { pairId: 'p'.repeat(43), code: 'BCDF-GHJK', expiresIn: 300, interval: 0 });
		}
		if (url.endsWith('/pair/poll')) {
			assert.ok(verifyMessage(startKey, pairPollMessage({ origin: BRIDGE, pairId: body.pairId, ts: body.ts }), body.sig));
			if (polls++ < pendingPolls) return reply(202, { status: 'pending' });
			return reply(200, { machineId: 'm-abcdefghijklmnop', ownerId: OWNER, accountEmail: email, bridgeKeys: [{ kid: KEY.kid, publicKey: KEY.publicKey }] });
		}
		return reply(404, {});
	};
	return { calls, fetchImpl };
}

function tempFile(t) {
	const dir = mkdtempSync(join(tmpdir(), 'pair-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return join(dir, 'machine.json');
}

test('pair prints the code and fingerprint, then writes machine.json once the owner says yes', async (t) => {
	const file = tempFile(t);
	const { fetchImpl } = fakeBridge();
	const said = [];
	const machine = await pairMachine({ bridge: BRIDGE, name: 'laptop', file, fetchImpl, say: (line) => said.push(line), confirm: async () => true, platform: 'linux-x64' });
	assert.match(said.join('\n'), /BCDF-GHJK/);
	assert.match(said.join('\n'), /[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}/);
	assert.match(said.join('\n'), /owner@example\.com/);
	assert.equal(machine.machineId, 'm-abcdefghijklmnop');
	assert.equal(statSync(file).mode & 0o777, 0o600);
	assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).bridgeKeys, { [KEY.kid]: KEY.publicKey });
});

test('pair writes nothing when the owner declines or the account is not the expected one', async (t) => {
	const file = tempFile(t);
	await assert.rejects(pairMachine({ bridge: BRIDGE, name: 'laptop', file, fetchImpl: fakeBridge().fetchImpl, say: () => {}, confirm: async () => false, platform: 'linux-x64' }), /declined/);
	assert.equal(existsSync(file), false);
	await assert.rejects(pairMachine({ bridge: BRIDGE, name: 'laptop', file, fetchImpl: fakeBridge({ email: 'attacker@example.com' }).fetchImpl, say: () => {}, acceptAccount: 'owner@example.com', platform: 'linux-x64' }), /attacker@example\.com/);
	assert.equal(existsSync(file), false);
});

function pairedFile(t) {
	const file = tempFile(t);
	const { privateKey, publicKeyRaw } = generateAgentKeyPair();
	saveMachine(file, {
		machineId: 'm-abcdefghijklmnop', ownerId: OWNER, accountEmail: 'owner@example.com', bridgeUrl: BRIDGE,
		bridgeKeys: { [KEY.kid]: KEY.publicKey }, privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
	});
	return { file, publicKeyRaw };
}

test('the heartbeat signs machine, origin and time; a signed next key is pinned, an unsigned one is not', async (t) => {
	const { file, publicKeyRaw } = pairedFile(t);
	const keys = { [KEY.kid]: KEY.publicKey };
	const sent = [];
	const nextSig = b64url(sign(null, nextKeyMessage({ origin: BRIDGE, kid: NEXT.kid, publicKey: NEXT.publicKey }), KEY.privateKey));
	const fetchImpl = async (url, init) => {
		sent.push(JSON.parse(init.body));
		return reply(200, { bridgeKeys: [{ kid: KEY.kid, publicKey: KEY.publicKey }, { kid: NEXT.kid, publicKey: NEXT.publicKey, sig: nextSig }, { kid: 'zzzzzzzz', publicKey: NEXT.publicKey, sig: nextSig }] });
	};
	const beat = createHeartbeat({ file, keys, ideOrigin: 'http://127.0.0.1:4100', fetchImpl, onGone: () => assert.fail('not gone') });
	assert.equal(await beat.once(), 'ok');
	const { machineId, ideOrigin, ts, sig } = sent[0];
	assert.equal(machineId, 'm-abcdefghijklmnop');
	assert.equal(ideOrigin, 'http://127.0.0.1:4100');
	assert.ok(verifyMessage(publicKeyRaw, heartbeatMessage({ origin: BRIDGE, machineId, ideOrigin, ts }), sig), 'signed by the machine key');
	assert.deepEqual(Object.keys(keys).sort(), [KEY.kid, NEXT.kid].sort());
	const later = sent.length;
	await beat.once();
	assert.ok(sent[later].ts > ts, 'each beat carries a later time');
});

test('a 410 removes machine.json and calls onGone', async (t) => {
	const { file } = pairedFile(t);
	let gone = false;
	const beat = createHeartbeat({ file, keys: { [KEY.kid]: KEY.publicKey }, ideOrigin: 'http://127.0.0.1:4100', fetchImpl: async () => reply(410, { code: 'gone' }), onGone: () => { gone = true; } });
	assert.equal(await beat.once(), 'gone');
	assert.equal(gone, true);
	assert.equal(existsSync(file), false);
});

test('an unreachable bridge is not a revocation', async (t) => {
	const { file } = pairedFile(t);
	const beat = createHeartbeat({ file, keys: { [KEY.kid]: KEY.publicKey }, ideOrigin: 'http://127.0.0.1:4100', fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, onGone: () => assert.fail('not gone') });
	assert.equal(await beat.once(), 'unreachable');
	assert.equal(existsSync(file), true);
});
