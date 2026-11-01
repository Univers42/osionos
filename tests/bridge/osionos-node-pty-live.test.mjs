// The web terminal end to end on a real shell (devil verdict 2026-11-01, W1, W2, W8, W9): the pinned
// VS Code server's ws and node-pty, the node's own gates, bash. Runs where that server is
// installed (OSIONOS_TEST_SERVER, default ~/.osionos/server/1.138.0) and is skipped elsewhere,
// which CI is: the gates themselves are covered by osionos-node-pty-service.test.mjs with fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createIdeOriginServer } from '../../packages/osionos-node/ide-origin.mjs';
import { createMachineSession } from '../../packages/osionos-node/machine-identity.mjs';
import { createPtyHost, serverSocketAcceptor } from '../../packages/osionos-node/pty-runtime.mjs';
import { PTY_LIMITS } from '../../packages/osionos-node/pty-wire.mjs';
import { bridgeKeyFromSeed, signMachineToken } from '../../scripts/ide-machine-protocol.mjs';
import { generateAgentKeyPair } from '../../scripts/ide-agent-frames.mjs';

const SERVER = process.env.OSIONOS_TEST_SERVER ?? join(homedir(), '.osionos', 'server', '1.138.0');
const BASH = '/bin/bash';
const ready = existsSync(join(SERVER, 'node')) && existsSync(join(SERVER, 'vscode', 'node_modules', 'node-pty')) && existsSync(BASH);
const skip = ready ? false : `no pinned VS Code server at ${SERVER}`;
const SEED = randomBytes(32).toString('base64url');
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MACHINE = 'm-abcdefghijklmnop';

async function world(t) {
	const probe = http.createServer();
	await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	const base = `http://127.0.0.1:${port}`;
	const key = bridgeKeyFromSeed(SEED);
	const { privateKey } = generateAgentKeyPair();
	const machine = { machineId: MACHINE, ownerId: OWNER, bridgeUrl: 'https://bridge.example', bridgeKeys: { [key.kid]: key.publicKey }, privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url') };
	const host = createPtyHost({ serverDir: SERVER, env: { ...process.env, SHELL: BASH, PS1: '$ ' }, cwd: homedir() });
	const origin = createIdeOriginServer({
		...createMachineSession({ machine, home: homedir() }).originOptions, ownerId: OWNER, ideOrigin: base, commit: 'c'.repeat(40),
		nodes: { [MACHINE]: { socketPath: '/nonexistent.sock', extensionRoots: [] } }, pty: { host, accept: serverSocketAcceptor(SERVER) },
	});
	await new Promise((resolve) => origin.server.listen(port, '127.0.0.1', resolve));
	t.after(() => { origin.close(); host.stop(); });
	return { base, origin };
}

const WebSocket = ready ? createRequire(join(SERVER, 'vscode', 'package.json'))('ws') : null;
const token = (base) => signMachineToken({ sub: OWNER, machine: MACHINE, aud: base, seed: SEED }).token;

/** A frame's socket: everything it receives, joined; resolves once the shell opened. */
function shell(base, { origin = base, headers = {} } = {}) {
	const ws = new WebSocket(`${base.replace('http', 'ws')}/api/pty`, { origin, headers });
	const state = { ws, output: '', chars: 0, opened: null, refused: null, closed: null };
	ws.on('unexpected-response', (req, res) => { state.refused = res.statusCode; });
	ws.on('close', (code) => { state.closed = code; });
	ws.on('error', () => {});
	ws.on('open', () => ws.send(JSON.stringify({ token: token(base), cols: 80, rows: 24 })));
	ws.on('message', (data) => {
		const message = JSON.parse(String(data));
		if (message.op === 'opened') state.opened = message;
		if (message.op === 'data') { state.output += message.data; state.chars += message.data.length; }
	});
	state.write = (data) => ws.send(JSON.stringify({ op: 'write', data }));
	return state;
}

async function until(check, ms = 5000) {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error(`timed out after ${ms} ms`);
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a real shell opens, echoes, and refuses a foreign Host or Origin through the real ws', { skip }, async (t) => {
	const { base } = await world(t);
	const s = shell(base);
	await until(() => s.opened);
	assert.match(s.opened.secret, /^[A-Za-z0-9_-]{43}$/);
	s.write('echo pty-ok-$((6*7))\r');
	await until(() => s.output.includes('pty-ok-42'));
	s.ws.close();
	const port = new URL(base).port;
	const foreignOrigin = shell(base, { origin: 'https://baas.tail10f2ea.ts.net:8443' });
	const foreignHost = shell(base, { headers: { host: `evil.test:${port}` } });
	await until(() => foreignOrigin.refused && foreignHost.refused);
	assert.deepEqual([foreignOrigin.refused, foreignHost.refused], [403, 403]);
});

test('W8: closing the socket hangs up the shell\'s jobs within 1 s', { skip }, async (t) => {
	const { base, origin } = await world(t);
	const s = shell(base);
	await until(() => s.opened);
	s.write('sleep 1000 & echo BG:$!\r');
	await until(() => /BG:(\d+)/.test(s.output));
	s.write('sh -c \'echo FG:$$; exec sleep 999\'\r');
	await until(() => /FG:(\d+)/.test(s.output));
	const pids = [Number(/BG:(\d+)/.exec(s.output)[1]), Number(/FG:(\d+)/.exec(s.output)[1])];
	assert.ok(pids.every(alive));
	const closedAt = Date.now();
	s.ws.terminate();
	await until(() => !pids.some(alive), 1000);
	assert.ok(Date.now() - closedAt <= 1000, `${Date.now() - closedAt} ms`);
	assert.equal(origin.pty.counts().shells, 0);
});

test('W9: with no ack, `yes` is paused at the high watermark; acking resumes it', { skip }, async (t) => {
	const { base } = await world(t);
	const s = shell(base);
	await until(() => s.opened);
	s.write('yes\r');
	await until(() => s.chars > PTY_LIMITS.highWatermark);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const settled = s.chars;
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const bound = PTY_LIMITS.highWatermark + 65536;
	t.diagnostic(`unacked chars after 2 s of yes: ${s.chars} (bound ${bound})`);
	assert.equal(s.chars, settled, 'no output while paused');
	assert.ok(s.chars <= bound, `${s.chars} > ${bound}`);
	s.ws.send(JSON.stringify({ op: 'ack', chars: s.chars }));
	await until(() => s.chars > settled);
	s.ws.terminate();
});
