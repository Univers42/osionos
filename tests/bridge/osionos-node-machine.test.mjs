// osionos-node as a paired machine (own-machines plan, devil verdict 2026-10-31): it trusts only
// tokens the bridge signed for it, proves who it is to the app, and keeps its identity file private.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIdeOriginServer } from '../../packages/osionos-node/ide-origin.mjs';
import { createMachineSession, loadMachine, saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { bridgeKeyFromSeed, signMachineToken, whoamiMessage } from '../../scripts/ide-machine-protocol.mjs';
import { fromB64url, generateAgentKeyPair, verifyMessage } from '../../scripts/ide-agent-frames.mjs';
import { signIdeToken } from '../../scripts/ide-token.mjs';

const SEED = randomBytes(32).toString('base64url');
const KEY = bridgeKeyFromSeed(SEED);
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const MACHINE = 'm-abcdefghijklmnop';
const BRIDGE = 'https://bridge.example:10000';
const SAME = { 'sec-fetch-site': 'same-origin' };

function identity() {
	const { privateKey, publicKeyRaw } = generateAgentKeyPair();
	return {
		machineId: MACHINE, ownerId: OWNER, accountEmail: 'owner@example.com', bridgeUrl: BRIDGE,
		bridgeKeys: { [KEY.kid]: KEY.publicKey },
		privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
		publicKeyRaw,
	};
}

async function world(t, machine = identity()) {
	const server = await http0();
	const session = createMachineSession({ machine, home: '/home/owner' });
	const origin = createIdeOriginServer({
		...session.originOptions, ideOrigin: server.ideOrigin, commit: 'c'.repeat(40),
		nodes: { [MACHINE]: { socketPath: '/nonexistent.sock', extensionRoots: [] } },
	});
	await new Promise((resolve) => origin.server.listen(server.port, '127.0.0.1', resolve));
	t.after(() => origin.close());
	return { base: server.ideOrigin, machine, origin };
}

// The origin server needs its own origin before it listens, so the port is asked of the OS first.
// Caveat: another process can take the port between this probe and the listen; rare, and it
// fails loudly (EADDRINUSE), never silently.
async function http0() {
	const probe = createServer();
	await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	return { port, ideOrigin: `http://127.0.0.1:${port}` };
}

const mint = (base, over = {}) => signMachineToken({ sub: OWNER, machine: MACHINE, aud: base, seed: SEED, ...over }).token;
function openSession(base, token) {
	return fetch(`${base}/api/node/session`, {
		method: 'POST', headers: { ...SAME, origin: base, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ node: MACHINE }),
	});
}

test('machine.json is written owner-only and read back; a missing one reads as null', () => {
	const dir = mkdtempSync(join(tmpdir(), 'mj-'));
	try {
		const file = join(dir, 'machine.json');
		assert.equal(loadMachine(file), null);
		const { publicKeyRaw: _drop, ...stored } = identity();
		saveMachine(file, stored);
		assert.equal(statSync(file).mode & 0o777, 0o600);
		assert.equal(loadMachine(file).machineId, MACHINE);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('saveMachine makes a missing folder 0700 and leaves no temp file behind', () => {
	const dir = mkdtempSync(join(tmpdir(), 'mj-'));
	try {
		const folder = join(dir, '.osionos');
		const { publicKeyRaw: _drop, ...stored } = identity();
		saveMachine(join(folder, 'machine.json'), stored);
		assert.equal(statSync(folder).mode & 0o777, 0o700);
		assert.deepEqual(readdirSync(folder), ['machine.json']);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('machine.json is refused when others can read it or write its folder; saving tightens our folder', () => {
	const dir = mkdtempSync(join(tmpdir(), 'mj-'));
	try {
		const file = join(dir, 'machine.json');
		const { publicKeyRaw: _drop, ...stored } = identity();
		saveMachine(file, stored);
		chmodSync(file, 0o644);
		assert.throws(() => loadMachine(file), /readable or writable by others/);
		chmodSync(file, 0o600);
		chmodSync(dir, 0o775);
		assert.throws(() => loadMachine(file), /writable by others/);
		saveMachine(file, stored);
		assert.equal(statSync(dir).mode & 0o777, 0o700, 'our own folder is tightened on save');
		assert.equal(loadMachine(file).machineId, MACHINE);
	} finally { chmodSync(dir, 0o700); rmSync(dir, { recursive: true, force: true }); }
});

test('a bridge-signed token for this machine and origin opens a session once', async (t) => {
	const { base } = await world(t);
	const token = mint(base);
	const first = await openSession(base, token);
	assert.equal(first.status, 204);
	assert.match(first.headers.get('set-cookie'), new RegExp(`^osio-node-${MACHINE}=nc1\\.`));
	assert.equal((await openSession(base, token)).status, 401, 'a jti is single-use');
});

test('the session refuses a stranger, another origin, a foreign key and a legacy IDE token', async (t) => {
	const { base } = await world(t);
	const foreign = randomBytes(32).toString('base64url');
	assert.equal((await openSession(base, mint(base, { sub: STRANGER }))).status, 403);
	assert.equal((await openSession(base, mint(base, { aud: 'http://127.0.0.1:1' }))).status, 401);
	assert.equal((await openSession(base, mint(base, { seed: foreign }))).status, 401);
	const legacy = signIdeToken({ userId: OWNER, workspaceId: OWNER, secret: 's'.repeat(40), scope: 'node' }).token;
	assert.equal((await openSession(base, legacy)).status, 401);
});

test('whoami signs the app nonce with the machine key, for its own origin only', async (t) => {
	const { base, machine } = await world(t);
	const nonce = randomBytes(16).toString('base64url');
	const res = await fetch(`${base}/api/machine/whoami`, { method: 'POST', headers: { ...SAME, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ nonce }) });
	assert.equal(res.status, 200);
	const { machineId, sig } = await res.json();
	assert.equal(machineId, MACHINE);
	assert.ok(verifyMessage(machine.publicKeyRaw, whoamiMessage({ origin: BRIDGE, machineId, ideOrigin: base, nonce }), sig));
	const cross = await fetch(`${base}/api/machine/whoami`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ nonce }) });
	assert.equal(cross.status, 403);
	assert.ok(fromB64url(sig).length === 64);
});

test('home answers the folder only with a live session cookie', async (t) => {
	const { base } = await world(t);
	assert.equal((await fetch(`${base}/api/machine/home`, { headers: SAME })).status, 401);
	const cookie = (await openSession(base, mint(base))).headers.get('set-cookie').split(';')[0];
	const res = await fetch(`${base}/api/machine/home`, { headers: { ...SAME, cookie } });
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { folder: '/home/owner' });
	assert.equal(existsSync('/nonexistent.sock'), false);
});
