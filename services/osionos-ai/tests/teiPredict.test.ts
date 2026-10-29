import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'node:http';
import { TeiError, teiPredict } from '../src/encoders/tei.ts';
import { startMockTei } from './mockTei.ts';

/** The /predict client of TEI: the shape in, the typed errors out. */

const mock = await startMockTei({ score: (text) => (text.includes('bad') ? 0.97 : 0.02) });
after(async () => {
	await mock.close();
});

describe('teiPredict', () => {
	it('posts {inputs, truncate: true} and returns one label list per input', async () => {
		const out = await teiPredict(mock.baseUrl, ['a bad one', 'fine'], { timeoutMs: 2_000 });
		assert.deepEqual(mock.bodies.at(-1), { inputs: ['a bad one', 'fine'], truncate: true });
		assert.equal(out.length, 2);
		assert.equal(out[0]?.[0]?.label, 'toxic');
		assert.equal(out[0]?.[0]?.score, 0.97);
		assert.equal(out[1]?.[0]?.label, 'neutral');
	});

	it('types an HTTP failure and never puts the answer body in the message', async () => {
		mock.setOptions({ fail: true });
		await assert.rejects(teiPredict(mock.baseUrl, ['x'], { timeoutMs: 2_000 }), (error: unknown) => {
			assert.ok(error instanceof TeiError);
			assert.equal(error.kind, 'http');
			assert.equal(error.status, 500);
			assert.ok(!error.message.includes('classifier is down'));
			return true;
		});
		mock.setOptions({ fail: false });
	});

	it('types a timeout', async () => {
		const slow = createServer(() => {
			// never answers
		});
		await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', () => resolve()));
		const address = slow.address();
		const port = address && typeof address === 'object' ? address.port : 0;
		try {
			await assert.rejects(
				teiPredict(`http://127.0.0.1:${port}`, ['x'], { timeoutMs: 100 }),
				(error: unknown) => error instanceof TeiError && error.kind === 'timeout',
			);
		} finally {
			slow.closeAllConnections?.();
			slow.close();
		}
	});

	it('types a bad shape', async () => {
		const odd = createServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ not: 'a list' }));
		});
		await new Promise<void>((resolve) => odd.listen(0, '127.0.0.1', () => resolve()));
		const address = odd.address();
		const port = address && typeof address === 'object' ? address.port : 0;
		try {
			await assert.rejects(
				teiPredict(`http://127.0.0.1:${port}`, ['x'], { timeoutMs: 2_000 }),
				(error: unknown) => error instanceof TeiError && error.kind === 'shape',
			);
		} finally {
			odd.closeAllConnections?.();
			odd.close();
		}
	});
});
