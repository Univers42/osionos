// The additive seams the relay needs, each proved separately from the relay itself:
// a configurable decoder cap, the pure WS auth helpers without docker, the shared HTTP
// edge, and a docker client that may take a socket path only on the agent side.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameDecoder } from '../../scripts/ide-ws.mjs';
import * as wsAuth from '../../scripts/ide-ws-auth.mjs';
import * as legacy from '../../scripts/bridge-ide-exec.mjs';
import { sendJson, sendPreflight, routeIdeApi } from '../../scripts/ide-http-edge.mjs';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDockerClient, createAgentDockerClient } from '../../scripts/ide-docker.mjs';

const maskedFrame = (payload, opcode = 2) => {
	const mask = Buffer.from([9, 8, 7, 6]);
	const body = Buffer.from(payload);
	const masked = Buffer.from(body.map((byte, i) => byte ^ mask[i & 3]));
	let header;
	if (body.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
	else if (body.length < 65536) header = Buffer.from([0x80 | opcode, 0x80 | 126, body.length >> 8, body.length & 255]);
	else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(body.length), 2); }
	return Buffer.concat([header, mask, masked]);
};

describe('createFrameDecoder maxMessage', () => {
	it('keeps the 1 MiB default', () => {
		const feed = createFrameDecoder();
		assert.equal(feed(maskedFrame(Buffer.alloc(1 << 20, 1)))[0].data.length, 1 << 20);
		assert.throws(() => createFrameDecoder()(maskedFrame(Buffer.alloc((1 << 20) + 1))), /too large/);
	});
	it('enforces a lower per-decoder cap, on whole frames and on reassembled fragments', () => {
		const feed = createFrameDecoder({ maxMessage: 65536 });
		assert.equal(feed(maskedFrame(Buffer.alloc(65536)))[0].data.length, 65536);
		assert.throws(() => createFrameDecoder({ maxMessage: 65536 })(maskedFrame(Buffer.alloc(65537))), /too large/);
		const split = createFrameDecoder({ maxMessage: 100 });
		const first = maskedFrame(Buffer.alloc(60), 2); first[0] &= 0x7f; // FIN cleared
		split(first);
		const cont = maskedFrame(Buffer.alloc(60), 0);
		assert.throws(() => split(cont), /too large/);
	});
});

describe('ide-ws-auth', () => {
	it('holds the pure seams and bridge-ide-exec re-exports the same functions', () => {
		for (const name of ['parseResizeFrame', 'extractWsAuth', 'armTokenExpiry', 'rejectUpgrade']) {
			assert.equal(typeof wsAuth[name], 'function', name);
		}
		for (const name of ['parseResizeFrame', 'extractWsAuth', 'armTokenExpiry']) assert.equal(legacy[name], wsAuth[name], name);
	});
	it('rejectUpgrade writes the status line and destroys the socket', () => {
		let written = ''; let destroyed = false;
		wsAuth.rejectUpgrade({ write: (s) => { written += s; }, destroy: () => { destroyed = true; } }, 403, 'Forbidden');
		assert.match(written, /^HTTP\/1\.1 403 Forbidden\r\n/);
		assert.equal(destroyed, true);
	});
});

describe('ide-http-edge', () => {
	const fakeResponse = () => {
		const out = { status: 0, headers: {}, body: '' };
		return Object.assign(out, {
			setHeader: () => {},
			writeHead: (status, headers) => { out.status = status; out.headers = headers; },
			end: (body = '') => { out.body = body; },
		});
	};
	it('sendJson and sendPreflight keep their wire shape', () => {
		const res = fakeResponse();
		sendJson(res, 418, { ok: false });
		assert.deepEqual([res.status, res.headers['cache-control'], res.body], [418, 'no-store', '{"ok":false}']);
		const pre = fakeResponse();
		sendPreflight(pre, 'https://app.example');
		assert.equal(pre.status, 204);
		assert.equal(pre.headers['access-control-allow-origin'], 'https://app.example');
	});
	it('routeIdeApi refuses a foreign Origin, answers a preflight, then walks the handlers', async () => {
		const ctx = { allowedOrigin: 'https://app.example', requestConfig: {}, handlers: [async (_u, _r, response) => { sendJson(response, 200, { ok: true }); return true; }] };
		const url = new URL('http://x/api/ide/y');
		const foreign = fakeResponse();
		await routeIdeApi(url, { headers: { origin: 'https://evil.example' }, method: 'GET' }, foreign, ctx);
		assert.equal(foreign.status, 403);
		const pre = fakeResponse();
		await routeIdeApi(url, { headers: { origin: 'https://app.example' }, method: 'OPTIONS' }, pre, ctx);
		assert.equal(pre.status, 204);
		const ok = fakeResponse();
		await routeIdeApi(url, { headers: {}, method: 'GET' }, ok, ctx);
		assert.equal(ok.status, 200);
		const none = fakeResponse();
		await routeIdeApi(url, { headers: {}, method: 'GET' }, none, { ...ctx, handlers: [] });
		assert.equal(none.status, 404);
	});
});

describe('docker client socket paths (T-P6)', () => {
	it('the server constructor refuses a socket path in every spelling', () => {
		for (const value of ['/var/run/docker.sock', 'unix:///var/run/docker.sock', 'unix:/run/user/1000/docker.sock', '/run/docker.sock:2375']) {
			assert.throws(() => createDockerClient({ OSIONOS_IDE_DOCKER_HOST: value }), /socket/i, value);
		}
	});
	it('the server constructor still accepts host:port', () => {
		assert.equal(typeof createDockerClient({ OSIONOS_IDE_DOCKER_HOST: '127.0.0.1:2375' }).attachExec, 'function');
	});
	it('the agent constructor takes an absolute socket path and rejects the rest', () => {
		assert.equal(typeof createAgentDockerClient({ socketPath: '/run/user/1000/docker.sock' }).resizeExec, 'function');
		for (const bad of ['', 'relative.sock', undefined, 'unix:///x', '127.0.0.1:2375']) {
			assert.throws(() => createAgentDockerClient({ socketPath: bad }), /absolute/i, String(bad));
		}
	});
	it('the agent client really talks HTTP over that socket', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'osio-sock-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer((req, res) => { res.writeHead(req.url === '/_ping' ? 200 : 404); res.end('OK'); });
		await new Promise((resolve) => server.listen(socketPath, resolve));
		try {
			assert.equal(await createAgentDockerClient({ socketPath }).ping(), true);
		} finally {
			await new Promise((resolve) => server.close(resolve));
			await rm(dir, { recursive: true, force: true });
		}
	});
});
