import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startKit } from './failoverKit.ts';
import { USER_A, WORKSPACE_A } from './harness.ts';
import { cooldownKey } from '../src/runs/cooldown.ts';

/**
 * The client sends the literal model "auto" for an empty or Auto choice. The
 * service reads it as "no model chosen" at the request boundary, so the word
 * never reaches an upstream provider, whichever route or connection.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, post, call, clean, tokenFor, createConversation, postComplete } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

const token = () => tokenFor(USER_A, WORKSPACE_A);

describe('model "auto" at the request boundary', () => {
	before(clean);

	it('a BYO connection with "auto" never sends "auto" upstream', async () => {
		await clean();
		const own = await call('/api/ai/connections', {
			method: 'POST',
			token: token(),
			body: { kind: 'api_key', provider: 'openrouter', apiKey: 'sk-test-0123456789abcdef' },
		});
		const conversationId = await createConversation();
		const response = await post(
			{ runId: crypto.randomUUID(), conversationId, text: 'hi', connectionId: String(own.body?.id), model: ' Auto ' },
			token(),
		);
		assert.equal(response.status, 400);
		assert.equal(((await response.json()) as { code: string }).code, 'invalid_request');
		assert.ok(!failing.requests.some((model) => model.toLowerCase().trim() === 'auto'));
	});

	it('a platform run with "auto" and an empty Auto chain uses the default, not "auto"', async () => {
		await clean();
		const until = String(Date.now() + 60_000);
		for (const id of ['mock-metered', 'mock-vision', 'mock-platform', 'mock-model', 'mock-dear', 'mock/first:free', 'mock/second:free']) {
			await app.redis.set(cooldownKey(`user:${USER_A}`, 'platform', id), until, 'EX', 60);
		}
		await runToEnd({});
		const defaultModel = [...failing.requests];
		assert.equal(defaultModel.length, 1);
		failing.requests.length = 0;
		await runToEnd({ model: 'AUTO' });
		assert.deepEqual(failing.requests, defaultModel);
		await clean();
	});

	it('a completion with "auto" runs the default model, not "auto"', async () => {
		await clean();
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false });
		const response = await postComplete({ runId: crypto.randomUUID(), command: 'summarize', input: { text: 'words' }, model: 'auto' });
		assert.equal(response.status, 200);
		await response.text();
		assert.ok(!failing.requests.includes('auto'));
	});
});
