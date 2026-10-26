import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fetch as undiciFetch } from 'undici';
import { capBody } from '../src/connections/bodyCap.ts';

/**
 * The shared body cap on its own (MCP C267, web C345), against undici's real
 * fetch: it settles U1 of the web verdict, whether undici hands over a
 * DECODED stream, by serving a compression bomb.
 */
const CAP = 2 * 1024 * 1024;
const BOMB = Buffer.alloc(64 * 1024 * 1024);
const gzipBomb = gzipSync(BOMB);
const brBomb = brotliCompressSync(BOMB);

const server = createServer((request, response) => {
	if (request.url === '/gzip') {
		response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
		response.end(gzipBomb);
	} else if (request.url === '/br') {
		response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'br' });
		response.end(brBomb);
	} else if (request.url === '/lying') {
		response.writeHead(200, { 'content-type': 'text/html', 'content-length': String(CAP + 1) });
		response.end();
	} else {
		response.writeHead(200, { 'content-type': 'text/plain' });
		response.end('small body');
	}
});
let base = '';

before(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
	server.closeAllConnections();
	server.close();
});

/** Reads the capped body; returns the bytes read and whether the cap fired. */
async function readCapped(path: string): Promise<{ bytes: number; exceeded: boolean; failed: boolean }> {
	let exceeded = false;
	const raw = (await undiciFetch(`${base}${path}`)) as unknown as Response;
	let capped: Response;
	try {
		capped = capBody(raw, CAP, () => {
			exceeded = true;
		});
	} catch {
		return { bytes: 0, exceeded, failed: true };
	}
	let bytes = 0;
	let failed = false;
	try {
		for await (const chunk of capped.body as unknown as AsyncIterable<Uint8Array>) bytes += chunk.byteLength;
	} catch {
		failed = true;
	}
	return { bytes, exceeded, failed };
}

describe('the shared body cap', () => {
	for (const encoding of ['gzip', 'br']) {
		it(`U1/C345 a ${encoding} bomb (64 MiB decoded) is cut at the cap on the DECODED bytes`, async () => {
			assert.ok((encoding === 'gzip' ? gzipBomb : brBomb).byteLength < CAP, 'the wire size is under the cap');
			const result = await readCapped(`/${encoding}`);
			assert.equal(result.exceeded, true, 'the cap fired');
			assert.equal(result.failed, true, 'the stream errored');
			assert.ok(result.bytes <= CAP, `read ${result.bytes} bytes, cap ${CAP}`);
		});
	}

	it('C345 a content-length above the cap refuses before a byte is read', async () => {
		const result = await readCapped('/lying');
		assert.deepEqual(result, { bytes: 0, exceeded: true, failed: true });
	});

	it('a body under the cap passes whole', async () => {
		const result = await readCapped('/small');
		assert.deepEqual(result, { bytes: 'small body'.length, exceeded: false, failed: false });
	});
});
