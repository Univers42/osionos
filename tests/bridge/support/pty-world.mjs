// A paired osionos-node with the web terminal on a real loopback port (devil verdict 2026-11-01):
// the shell sockets are FakeConns, the pty host records spawns, and tokens are bridge-signed with a
// throwaway seed. `remember` (a list of origins) gives it a remembered-computers file in a fresh
// private folder.
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIdeOriginServer } from '../../../packages/osionos-node/ide-origin.mjs';
import { createMachineSession } from '../../../packages/osionos-node/machine-identity.mjs';
import { createRememberedComputers } from '../../../packages/osionos-node/remembered-computers.mjs';
import { bridgeKeyFromSeed, signMachineToken, signResumeAssertion } from '../../../scripts/ide-machine-protocol.mjs';
import { FakeConn, fakeHost, settle } from './pty-fakes.mjs';
import { MACHINE, OWNER, freeLoopbackOrigin, pairedMachine } from './paired-node.mjs';

export { MACHINE, OWNER };
export const SEED = randomBytes(32).toString('base64url');
export const KEY = bridgeKeyFromSeed(SEED);
export const STRANGER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

// What ws's handleUpgrade does, minus the framing: answer 101, and end the TCP socket with the conn.
function acceptLikeWs(socket, accepted) {
	const conn = new FakeConn();
	socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
	conn.once('close', () => socket.destroy());
	accepted.push({ conn, socket });
	return conn;
}

function rememberedIn(t, origins) {
	const dir = mkdtempSync(join(tmpdir(), 'pty-remember-'));
	chmodSync(dir, 0o700);
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const file = join(dir, 'remembered-computers.json');
	return { file, devices: createRememberedComputers({ file, owner: OWNER, machine: MACHINE, origins }) };
}

export async function world(t, { paired = true, remember = null } = {}) {
	const host = fakeHost();
	const accepted = [];
	const { port, origin: ideOrigin } = await freeLoopbackOrigin();
	const session = paired ? createMachineSession({ machine: pairedMachine(KEY, 'https://bridge.example:10000'), home: '/home/owner' }) : null;
	const memory = remember ? rememberedIn(t, remember) : { file: null, devices: null };
	const origin = createIdeOriginServer({
		...(session ? session.originOptions : { secret: 'k'.repeat(32) }), ownerId: OWNER, ideOrigin, commit: 'c'.repeat(40),
		nodes: { [MACHINE]: { socketPath: '/nonexistent.sock', extensionRoots: [] } },
		pty: paired ? { host, accept: (req, socket) => Promise.resolve(acceptLikeWs(socket, accepted)) } : undefined,
		devices: memory.devices,
	});
	await new Promise((resolve) => origin.server.listen(port, '127.0.0.1', resolve));
	t.after(() => origin.close());
	return { base: ideOrigin, origin, host, accepted, ...memory };
}

export const mint = (base, over = {}) => signMachineToken({ sub: OWNER, machine: MACHINE, aud: base, seed: SEED, ...over }).token;
export const mintResume = (base, over = {}) => signResumeAssertion({ sub: OWNER, machine: MACHINE, aud: base, seed: SEED, ...over }).assertion;
export const opening = (credential, size = { cols: 80, rows: 24 }) => JSON.stringify({ ...credential, ...size });

export async function open(origin, credential, size) {
	const conn = new FakeConn();
	origin.pty.attach(conn);
	conn.receive(opening(credential, size));
	await settle();
	return conn;
}
