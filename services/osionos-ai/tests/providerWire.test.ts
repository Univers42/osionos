import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startFailingUpstream } from './mockFailing.ts';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The wire of each pooled provider (FA2, FA5, FA25): two mock providers on the
 * loopback, one that declares the OpenRouter wire and one that does not. The
 * environment is set before the harness imports the service.
 */
const orMock = await startFailingUpstream();
const plainMock = await startFailingUpstream();
const poolModel = (id: string, upstreamId: string, extra: object = {}) => ({
	id, label: id, upstreamId, inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false, dataUse: 'no-train', ...extra,
});
process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
process.env.OSIONOS_AI_KEY_ORA = 'pool-key-ora';
process.env.OSIONOS_AI_KEY_PLAIN = 'pool-key-plain';
process.env.OSIONOS_AI_PLATFORM_PROVIDERS = JSON.stringify([
	{
		id: 'ora', baseUrl: `${orMock.baseUrl}/v1`, apiKeyEnv: 'OSIONOS_AI_KEY_ORA', wire: 'openrouter',
		models: [poolModel('ora-x', 'shared/x'), poolModel('ora-r', 'up/ora-r', { reasoning: true }), poolModel('ora-mt', 'up/ora-mt', { dataUse: 'may-train' })],
	},
	{
		id: 'plain', baseUrl: `${plainMock.baseUrl}/v1`, apiKeyEnv: 'OSIONOS_AI_KEY_PLAIN', wire: 'openai-compatible',
		models: [poolModel('plain-x', 'shared/x'), poolModel('plain-r', 'up/plain-r', { reasoning: true })],
	},
]);
const { app, mock, base, tokenFor, createConversation } = await startHarness({ upstreamBaseUrl: plainMock.baseUrl });
const { resolveTarget } = await import('../src/gateway/resolve.ts');
const { cooldownKey } = await import('../src/runs/cooldown.ts');

after(async () => {
	await app.close();
	await mock.close();
	await orMock.close();
	await plainMock.close();
});

/** A run on a model to its end. */
async function run(model: string, effort?: string): Promise<void> {
	const conversationId = await createConversation();
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId: randomUUID(), conversationId, text: 'hello', model, ...(effort ? { effort } : {}) }),
	});
	assert.equal(response.status, 200);
	await collect(new SseStream(response));
}

describe('provider wire', () => {
	before(() => {
		orMock.reset();
		plainMock.reset();
	});

	it('openrouter wire gets referer + reasoning effort shape', async () => {
		await run('ora-r', 'high');
		const [headers] = orMock.headersFor('up/ora-r');
		const [body] = orMock.bodiesFor('up/ora-r');
		assert.ok(headers['http-referer']);
		assert.equal(headers['x-title'], 'osionos');
		assert.equal(headers.authorization, 'Bearer pool-key-ora');
		assert.deepEqual(body.reasoning, { effort: 'high' });
		assert.equal('reasoning_effort' in body, false);
	});

	it('openai-compatible wire gets neither header nor provider/reasoning body fields', async () => {
		await run('plain-r', 'high');
		const [headers] = plainMock.headersFor('up/plain-r');
		const [body] = plainMock.bodiesFor('up/plain-r');
		assert.equal(headers['http-referer'], undefined);
		assert.equal(headers['x-title'], undefined);
		assert.equal(headers.authorization, 'Bearer pool-key-plain');
		assert.equal(body.reasoning_effort, 'high');
		assert.equal('reasoning' in body, false);
		assert.equal('provider' in body, false);
		await run('plain-x');
		assert.equal('provider' in plainMock.bodiesFor('shared/x')[0], false);
	});

	it('no-train openrouter text call carries data_collection deny', async () => {
		await run('ora-x');
		assert.deepEqual(orMock.bodiesFor('shared/x')[0].provider, { data_collection: 'deny' });
		await run('ora-mt');
		assert.equal('provider' in orMock.bodiesFor('up/ora-mt')[0], false);
	});

	it('upstream receives upstreamId, not menuId', () => {
		assert.equal(orMock.bodiesFor('ora-x').length, 0);
		assert.equal(orMock.bodiesFor('shared/x').length, 1);
		assert.equal(plainMock.bodiesFor('plain-x').length, 0);
		assert.equal(plainMock.bodiesFor('shared/x').length, 1);
	});

	it('same upstreamId on two providers rests independently', async () => {
		const user = { userId: USER_A } as never;
		const keys: string[] = [];
		for (const menuId of ['ora-x', 'plain-x']) {
			const out = await resolveTarget(app.db, app.redis, user, undefined, menuId);
			assert.equal(out.kind, 'resolved');
			if (out.kind !== 'resolved') return;
			assert.equal(out.target.modelId, menuId);
			keys.push(cooldownKey('platform', out.target.connectionId, out.target.modelId));
		}
		assert.notEqual(keys[0], keys[1]);
		const user_ = await resolveTarget(app.db, app.redis, user, undefined, 'ora-x');
		assert.ok(user_.kind === 'resolved' && user_.target.provider === 'ora' && user_.target.upstreamWire === 'openrouter' && user_.target.dataUse === 'no-train');
	});
});

describe('a legacy entry off openrouter.ai (FA5)', () => {
	it('gets reasoningEffort, no provider or reasoning field and no OpenRouter headers', async () => {
		await run('mock-reasoner', 'high');
		const [headers] = plainMock.headersFor('mock-reasoner');
		const [body] = plainMock.bodiesFor('mock-reasoner');
		assert.equal(body.reasoning_effort, 'high');
		assert.equal('reasoning' in body, false);
		assert.equal('provider' in body, false);
		assert.equal(headers['http-referer'], undefined);
		assert.equal(headers['x-title'], undefined);
	});
});
