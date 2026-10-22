import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { startMockImageEngine } from './mockImageEngine.ts';

/**
 * The image generation when the deployment has not turned it on (devil C70):
 * the route does not exist, and the engine is never called — even when its
 * URL is set. And a deployment that turns it on without what it needs does
 * not start.
 */
const engine = await startMockImageEngine();
delete process.env.OSIONOS_AI_IMAGES;
process.env.OSIONOS_AI_IMAGE_URL = `${engine.baseUrl}/v1`;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await engine.close();
});

/** The status and the raw body of a POST. */
async function post(path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId: randomUUID(), prompt: 'a cat' }),
	});
	return { status: response.status, body: await response.text() };
}

/** The boot of the service in a child process: what it says on stderr, and whether it started. */
async function boot(env: Record<string, string | undefined>): Promise<{ started: boolean; stderr: string }> {
	const child = fileURLToPath(new URL('./prodConfigChild.ts', import.meta.url));
	const merged: Record<string, string> = {};
	for (const [name, value] of Object.entries({ ...process.env, ...env })) {
		if (value !== undefined) merged[name] = value;
	}
	if (!('OSIONOS_AI_IMAGE_MICROUSD' in env) || env.OSIONOS_AI_IMAGE_MICROUSD === undefined) {
		delete merged.OSIONOS_AI_IMAGE_MICROUSD;
	}
	return new Promise((resolve, reject) => {
		const process_ = spawn(process.execPath, ['--experimental-strip-types', child], {
			env: merged,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		process_.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8');
		});
		process_.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
		});
		process_.on('close', () => resolve({ started: stdout.includes('RESULT '), stderr }));
		process_.on('error', reject);
	});
}

describe('osionos-ai images: off by default (C70)', () => {
	it('the route answers exactly what an unknown route answers, and the engine is never called', async () => {
		const images = await post('/api/ai/images');
		const unknown = await post('/api/ai/no-such-route');
		assert.equal(images.status, 404);
		assert.deepEqual(images, unknown);
		assert.equal(engine.bodies.length, 0);
	});

	it('turned on without an engine URL, the service refuses to start and names the variable', async () => {
		const output = await boot({ OSIONOS_AI_IMAGES: 'on', OSIONOS_AI_IMAGE_URL: '', OSIONOS_AI_IMAGE_MICROUSD: '2000' });
		assert.equal(output.started, false);
		assert.match(output.stderr, /OSIONOS_AI_IMAGE_URL/);
	});

	it('turned on without a price, the service refuses to start (C74: an image is never free)', async () => {
		for (const price of [undefined, '0']) {
			const output = await boot({ OSIONOS_AI_IMAGES: 'on', OSIONOS_AI_IMAGE_MICROUSD: price });
			assert.equal(output.started, false, `price ${String(price)}`);
			assert.match(output.stderr, /OSIONOS_AI_IMAGE_MICROUSD/);
			assert.ok(!output.stderr.includes(engine.baseUrl), 'the value is never printed');
		}
	});

	it('turned on with an engine and a price, the service starts', async () => {
		const output = await boot({
			OSIONOS_AI_IMAGES: 'on',
			OSIONOS_AI_IMAGE_MICROUSD: '2000',
			OSIONOS_AI_IMAGE_CHECK_DIR: '/tmp/osionos-ai-check-stub',
			OSIONOS_AI_PROMPT_GUARD_URL: 'http://guard.invalid',
		});
		assert.equal(output.started, true, output.stderr);
	});

	it('turned on without the models of the safety check, the service refuses to start (C73)', async () => {
		const output = await boot({ OSIONOS_AI_IMAGES: 'on', OSIONOS_AI_IMAGE_MICROUSD: '2000' });
		assert.equal(output.started, false);
		assert.match(output.stderr, /OSIONOS_AI_IMAGE_CHECK_DIR/);
	});

	it('turned on without the guard of the prompt, the service refuses to start (C72)', async () => {
		const output = await boot({
			OSIONOS_AI_IMAGES: 'on',
			OSIONOS_AI_IMAGE_MICROUSD: '2000',
			OSIONOS_AI_IMAGE_CHECK_DIR: '/tmp/osionos-ai-check-stub',
			OSIONOS_AI_PROMPT_GUARD_URL: '',
		});
		assert.equal(output.started, false);
		assert.match(output.stderr, /OSIONOS_AI_PROMPT_GUARD_URL/);
	});
});
