// The connector leaves only on a gone the bridge signed for this machine and this beat (devil verdict
// 2026-11-27, TB14, TB15): every other 410 is logged and changes nothing, so a wrong or lying bridge
// cannot erase a pairing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHeartbeat } from '../../packages/osionos-node/heartbeat.mjs';
import { saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { signMessage } from '../../scripts/ide-agent-frames.mjs';
import { bridgeKeyFromSeed, goneMessage, heartbeatMessage, nextKeyMessage } from '../../scripts/ide-machine-protocol.mjs';
import { MACHINE, pairedMachine } from './support/paired-node.mjs';

const BRIDGE = 'https://bridge.example';
const IDE = 'http://127.0.0.1:4100';
const KEY = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
const STRANGER = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
const gone410 = (body) => ({ status: 410, ok: false, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });

function pairedDir(t) {
	const dir = mkdtempSync(join(tmpdir(), 'node-gone-'));
	chmodSync(dir, 0o700);
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const file = join(dir, 'machine.json');
	saveMachine(file, pairedMachine(KEY, BRIDGE));
	return { dir, file };
}

// Each case builds the 410 body from the beat the node actually sent.
const sign = (key, message) => signMessage(key.privateKey, message);
const CASES = {
	valid: ({ ts }) => ({ gone: { machineId: MACHINE, kid: KEY.kid, ts, sig: sign(KEY, goneMessage({ origin: BRIDGE, machineId: MACHINE, ts })) } }),
	'ts + 1': ({ ts }) => ({ gone: { machineId: MACHINE, kid: KEY.kid, ts: ts + 1, sig: sign(KEY, goneMessage({ origin: BRIDGE, machineId: MACHINE, ts: ts + 1 })) } }),
	'ts - 1': ({ ts }) => ({ gone: { machineId: MACHINE, kid: KEY.kid, ts: ts - 1, sig: sign(KEY, goneMessage({ origin: BRIDGE, machineId: MACHINE, ts: ts - 1 })) } }),
	'another machine id': ({ ts }) => ({ gone: { machineId: 'm-zzzzzzzzzzzzzzzz', kid: KEY.kid, ts, sig: sign(KEY, goneMessage({ origin: BRIDGE, machineId: 'm-zzzzzzzzzzzzzzzz', ts })) } }),
	'an unknown kid': ({ ts }) => ({ gone: { machineId: MACHINE, kid: STRANGER.kid, ts, sig: sign(STRANGER, goneMessage({ origin: BRIDGE, machineId: MACHINE, ts })) } }),
	'kid __proto__': ({ ts }) => ({ gone: { machineId: MACHINE, kid: '__proto__', ts, sig: sign(STRANGER, goneMessage({ origin: BRIDGE, machineId: MACHINE, ts })) } }),
	'a heartbeat-domain signature': ({ ts }) => ({ gone: { machineId: MACHINE, kid: KEY.kid, ts, sig: sign(KEY, heartbeatMessage({ origin: BRIDGE, machineId: MACHINE, ideOrigin: IDE, ts })) } }),
	'a next-key signature': ({ ts }) => ({ gone: { machineId: MACHINE, kid: KEY.kid, ts, sig: sign(KEY, nextKeyMessage({ origin: BRIDGE, kid: MACHINE, publicKey: String(ts) })) } }),
	unsigned: () => ({ ok: false, code: 'gone', message: 'This machine is not paired.' }),
	'a garbage body': () => 'not json at all',
};

for (const [name, body] of Object.entries(CASES)) {
	test(`TB14: a 410 with ${name} ${name === 'valid' ? 'unpairs' : 'changes nothing'}`, async (t) => {
		const { dir, file } = pairedDir(t);
		const keys = { [KEY.kid]: KEY.publicKey };
		const logged = [];
		let goneCalls = 0;
		const beat = createHeartbeat({
			file, keys, ideOrigin: IDE, log: (line) => logged.push(line), onGone: () => { goneCalls += 1; },
			fetchImpl: async (url, init) => gone410(body(JSON.parse(init.body))),
		});
		const answer = await beat.once();
		if (name === 'valid') {
			assert.equal(answer, 'gone');
			assert.equal(goneCalls, 1);
			assert.equal(existsSync(file), false);
			const archived = readdirSync(dir).filter((entry) => /^machine\.removed-[0-9TZ-]+\.json$/.test(entry));
			assert.equal(archived.length, 1, 'the identity is archived, not deleted');
			assert.equal(statSync(join(dir, archived[0])).mode & 0o777, 0o600);
			assert.equal(logged.length, 0);
		} else {
			assert.equal(answer, 'refused');
			assert.equal(goneCalls, 0);
			assert.equal(existsSync(file), true);
			assert.deepEqual(readdirSync(dir), ['machine.json']);
			assert.equal(logged.length, 1);
			assert.equal(logged[0].includes(KEY.kid), false, 'the log line carries no reply text');
		}
	});
}

test('TB15: an unverified 410 is logged at most once an hour', async (t) => {
	const { file } = pairedDir(t);
	const logged = [];
	let clock = 1_800_000_000_000;
	const beat = createHeartbeat({
		file, keys: { [KEY.kid]: KEY.publicKey }, ideOrigin: IDE, now: () => clock, log: (line) => logged.push(line),
		onGone: () => assert.fail('not gone'), fetchImpl: async () => gone410({ code: 'gone' }),
	});
	await beat.once();
	clock += 3_599_999;
	await beat.once();
	assert.equal(logged.length, 1);
	clock += 1;
	await beat.once();
	assert.equal(logged.length, 2);
});

test('TB15: onGone runs after the identity is archived, and the beat never re-reads it', async (t) => {
	const { file } = pairedDir(t);
	let seenOnGone = null;
	const beat = createHeartbeat({
		file, keys: { [KEY.kid]: KEY.publicKey }, ideOrigin: IDE,
		fetchImpl: async (url, init) => gone410(CASES.valid(JSON.parse(init.body))),
		onGone: () => { seenOnGone = existsSync(file); },
	});
	assert.equal(await beat.once(), 'gone');
	assert.equal(seenOnGone, false);
});
