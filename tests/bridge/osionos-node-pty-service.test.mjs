// The web terminal's shell socket on osionos-node (devil verdict 2026-11-01, W2 to W5, W8, U6;
// groot ADR 0041). A shell opens only for the owner's bridge-signed token, spent once through the
// same jti guard as /api/node/session, or the session secret this node gave that frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { FakeConn, settle } from './support/pty-fakes.mjs';
import { anyWireText, seededRandom } from './support/seeded-values.mjs';
import { MACHINE, OWNER, STRANGER, mint, open, opening, world } from './support/pty-world.mjs';

function upgrade(base, headers) {
	return new Promise((resolve) => {
		const req = http.request(`${base}/api/pty`, {
			headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'a2V5', 'sec-websocket-version': '13', ...headers },
		});
		req.on('upgrade', (res, socket) => resolve({ ok: true, socket }));
		req.on('response', (res) => { res.resume(); resolve({ ok: false, status: res.statusCode }); });
		req.on('error', () => resolve({ ok: false, status: 0 }));
		req.end();
	});
}

test('W2: an upgrade from any origin but the node\'s own is refused before it is accepted', async (t) => {
	const { base, accepted, host } = await world(t);
	const port = new URL(base).port;
	const origins = [undefined, 'null', 'https://baas.tail10f2ea.ts.net:8443', `http://localhost:${port}`, `http://127.0.0.1:${Number(port) + 1}`];
	for (const origin of origins) {
		const result = await upgrade(base, origin === undefined ? {} : { origin });
		assert.equal(result.status, 403, String(origin));
	}
	assert.equal((await upgrade(base, { origin: base, 'sec-fetch-site': 'cross-site' })).status, 403, 'fetch metadata must agree');
	assert.equal(accepted.length, 0);
	assert.equal(host.spawned, 0);
	const ours = await upgrade(base, { origin: base });
	assert.equal(accepted.length, 1, 'the node\'s own origin reaches the socket');
	ours.socket?.destroy();
});

test('W3: the owner\'s token opens one shell; it is spent for /api/node/session too, and the reverse', async (t) => {
	const { base, origin, host } = await world(t);
	const token = mint(base);
	const conn = await open(origin, { token });
	assert.equal(conn.sent[0].op, 'opened');
	assert.equal(host.spawned, 1);
	assert.deepEqual(host.shells[0].size, { cols: 80, rows: 24 });
	const session = (bearer) => fetch(`${base}/api/node/session`, {
		method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: base, authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
		body: JSON.stringify({ node: MACHINE }),
	});
	assert.equal((await session(token)).status, 401, 'a token spent by /api/pty is refused by /api/node/session');
	const other = mint(base);
	assert.equal((await session(other)).status, 204);
	const replay = await open(origin, { token: other });
	assert.equal(replay.closeCode, 4401, 'a token spent by /api/node/session is refused by /api/pty');
	assert.equal(host.spawned, 1);
});

test('W3: an expired token, another audience or machine, a stranger, a bad signature, junk, binary and silence get 4401', async (t) => {
	const { base, origin, host } = await world(t);
	const forged = mint(base).replace(/.{4}$/, 'AAAA');
	const credentials = [
		{ token: mint(base, { now: Date.now() - 3_600_000 }) }, { token: mint('http://127.0.0.1:1') }, { token: mint(base, { machine: 'm-ponmlkjihgfedcba' }) },
		{ token: mint(base, { sub: STRANGER }) }, { token: forged }, { secret: 'A'.repeat(43) },
	];
	for (const credential of credentials) assert.equal((await open(origin, credential)).closeCode, 4401, JSON.stringify(credential).slice(0, 60));
	for (const junk of ['not json', JSON.stringify({ token: mint(base) }), JSON.stringify({ op: 'write', data: 'id\n' })]) {
		const conn = new FakeConn();
		origin.pty.attach(conn);
		conn.receive(junk);
		await settle();
		assert.equal(conn.closeCode, 4401, junk.slice(0, 40));
	}
	const binary = new FakeConn();
	origin.pty.attach(binary);
	binary.receive(opening({ token: mint(base) }), true);
	await settle();
	assert.equal(binary.closeCode, 4401, 'a binary frame');
	assert.equal(host.spawned, 0);
});

test('W3: silence for 5 s gets 4401 with no spawn', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const { origin, host } = await world(t);
	const conn = new FakeConn();
	origin.pty.attach(conn);
	t.mock.timers.tick(4999);
	assert.equal(conn.closeCode, null);
	t.mock.timers.tick(1);
	assert.equal(conn.closeCode, 4401);
	assert.equal(host.spawned, 0);
});

test('W3: a revoked owner\'s earlier token opens nothing; in shared-secret mode /api/pty is 404', async (t) => {
	const { base, origin, host } = await world(t);
	const early = mint(base, { now: Date.now() - 5000 });
	origin.revoke(OWNER);
	assert.equal((await open(origin, { token: early })).closeCode, 4401);
	assert.equal(host.spawned, 0);
	const legacy = await world(t, { paired: false });
	assert.equal((await upgrade(legacy.base, { origin: legacy.base })).status, 404);
	assert.equal(legacy.origin.pty, null);
});

test('W4: at most 4 sockets wait unauthenticated; the next is refused before it is accepted', async (t) => {
	const { base, accepted, origin } = await world(t);
	const held = [];
	for (let i = 0; i < 4; i += 1) held.push(await upgrade(base, { origin: base }));
	assert.equal(origin.pty.counts().pending, 4);
	assert.equal((await upgrade(base, { origin: base })).status, 429);
	assert.equal(accepted.length, 4);
	accepted[0].conn.drop();
	await settle();
	assert.equal(origin.pty.counts().pending, 3, 'a closed pending socket frees its place');
	for (const h of held) h.socket?.destroy();
});

test('W4: the 9th shell gets 4429 with no spawn; closing one frees its slot', async (t) => {
	const { base, origin, host } = await world(t);
	const first = await open(origin, { token: mint(base) });
	const { secret } = first.sent[0];
	const shells = [first];
	for (let i = 1; i < 8; i += 1) shells.push(await open(origin, { secret }));
	assert.equal(host.spawned, 8);
	const ninth = await open(origin, { token: mint(base) });
	assert.equal(ninth.closeCode, 4429);
	assert.equal(host.spawned, 8);
	shells[3].drop();
	await settle();
	assert.equal(origin.pty.counts().shells, 7);
	const again = await open(origin, { secret });
	assert.equal(again.sent[0].op, 'opened');
	assert.equal(host.spawned, 9);
});

test('W5: after the opening only write, resize and ack reach the pty; anything else closes it and kills the pty', async (t) => {
	const { base, origin, host } = await world(t);
	const conn = await open(origin, { token: mint(base) });
	const shell = host.shells[0];
	conn.receive(JSON.stringify({ op: 'write', data: 'echo hi\r' }));
	conn.receive(JSON.stringify({ op: 'resize', cols: 120, rows: 40 }));
	conn.receive(JSON.stringify({ op: 'ack', chars: 5000 }));
	assert.deepEqual([shell.writes, shell.resizes, shell.acks], [['echo hi\r'], [[120, 40]], [5000]]);
	conn.receive(JSON.stringify({ op: 'create', cols: 80, rows: 24 }));
	await settle();
	assert.equal(conn.closeCode, 4400);
	assert.equal(shell.kills, 1);
	const binary = await open(origin, { secret: conn.sent[0].secret });
	assert.equal(binary.closeCode, 4401, 'the frame\'s secret died with its last socket');
});

test('W5 property: generated messages never crash the node and nothing out of bounds reaches the pty', async (t) => {
	const { base, origin, host } = await world(t);
	const seed = Number(process.env.PTY_WIRE_SEED ?? 4242);
	const rand = seededRandom(seed);
	let conn = await open(origin, { token: mint(base) });
	let secret = conn.sent[0].secret;
	let closes = 0;
	for (let run = 0; run < 3000; run += 1) {
		if (conn.closeCode !== null) {
			closes += 1;
			conn = await open(origin, { token: mint(base) });
			secret = conn.sent[0].secret;
		}
		assert.doesNotThrow(() => conn.receive(anyWireText(rand), rand() < 0.02), `seed ${seed} run ${run}`);
		await settle();
	}
	assert.ok(secret);
	assert.ok(closes > 10, 'invalid messages closed the socket');
	for (const shell of host.shells) {
		for (const data of shell.writes) assert.ok(typeof data === 'string' && data.length <= 65536);
		for (const [cols, rows] of shell.resizes) assert.ok([cols, rows].every((n) => Number.isInteger(n) && n >= 1 && n <= 1000));
		for (const chars of shell.acks) assert.ok(Number.isSafeInteger(chars) && chars >= 0);
	}
	assert.ok(host.live() <= 1, 'every closed socket killed its pty');
});

test('W8: the pty\'s output and exit reach the frame; a closed socket kills its pty at once', async (t) => {
	const { base, origin, host } = await world(t);
	const conn = await open(origin, { token: mint(base) });
	host.shells[0].events.data('hello');
	host.shells[0].events.exit(3);
	assert.deepEqual(conn.sent.slice(1), [{ op: 'data', data: 'hello' }, { op: 'exit', exitCode: 3 }]);
	await settle();
	assert.equal(conn.closeCode, 1000);
	assert.equal(origin.pty.counts().shells, 0);
	const other = await open(origin, { token: mint(base) });
	other.drop();
	await settle();
	assert.equal(host.shells[1].kills, 1);
});

test('W8: revoke and close kill every pty and every pending socket', async (t) => {
	const { base, origin, host } = await world(t);
	const a = await open(origin, { token: mint(base) });
	await open(origin, { secret: a.sent[0].secret });
	const waiting = new FakeConn();
	origin.pty.attach(waiting);
	origin.revoke(OWNER);
	await settle();
	assert.deepEqual(host.shells.map((shell) => shell.kills), [1, 1]);
	assert.equal(waiting.closeCode, 1001);
	assert.deepEqual(origin.pty.counts(), { pending: 0, shells: 0, sessions: 0 });
	assert.equal((await open(origin, { token: mint(base) })).closeCode, 4401, 'a token from the revocation\'s second is void too');
	const fresh = await world(t);
	const b = await open(fresh.origin, { token: mint(fresh.base) });
	fresh.origin.close();
	await settle();
	assert.equal(fresh.host.shells[0].kills, 1);
	assert.equal(b.closeCode, 1001);
});

test('U6: the frame\'s secret opens more shells while one is open and dies with the last', async (t) => {
	const { base, origin, host } = await world(t);
	const first = await open(origin, { token: mint(base) });
	const { secret } = first.sent[0];
	assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
	const second = await open(origin, { secret });
	assert.deepEqual(second.sent[0], { op: 'opened' }, 'a secret opening gets no new secret');
	const otherFrame = await open(origin, { token: mint(base) });
	assert.notEqual(otherFrame.sent[0].secret, secret);
	first.drop();
	second.drop();
	await settle();
	assert.equal((await open(origin, { secret })).closeCode, 4401);
	assert.equal((await open(origin, { secret: otherFrame.sent[0].secret })).sent[0].op, 'opened', 'another frame keeps its own');
	assert.equal(host.spawned, 4);
});

test('a host that cannot start a shell closes the socket with 4503 and frees the slot', async (t) => {
	const { base, origin, host } = await world(t);
	host.fail = true;
	assert.equal((await open(origin, { token: mint(base) })).closeCode, 4503);
	assert.equal(origin.pty.counts().shells, 0);
});

// Owner 2026-11-01: the shell opened but sat stuck. The frame ignores everything before `opened`, and
// the node sent the shell's first output (its prompt, its terminal queries) before it: lost, so a
// shell that waits on its terminal's answer never got one.
test('the frame gets opened before any output, and the shell\'s first output is not lost', async (t) => {
	const { base, origin, host } = await world(t);
	const spawn = host.spawn;
	host.spawn = async (size, events) => {
		const shell = await spawn(size, events);
		events.data('\u001b[6nPROMPT> ');
		return shell;
	};
	const conn = await open(origin, { token: mint(base) });
	assert.deepEqual(conn.sent.map((message) => message.op), ['opened', 'data']);
	assert.equal(conn.sent[1].data, '\u001b[6nPROMPT> ');
});
