import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { FREE, REASONER, startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The reasoning effort of a run: the option each wire reads, the merge with
 * the vision deny, the run body, and the request the upstream receives.
 */
const { app, mock, base, tokenFor, createConversation } = await startHarness();
const { reasoningOptions, mergeProviderOptions } = await import('../src/runs/effort.ts');
const { parseCatalog } = await import('../src/connections/catalogParse.ts');
const { config } = await import('../src/config.ts');

after(async () => {
	await app.close();
	await mock.close();
});

const target = (wire: 'openai-compatible' | 'anthropic' | 'google', optionsKey: string, extra = {}) => ({
	wire,
	optionsKey,
	reasoning: true,
	platformBudget: false,
	...extra,
});

/** A run of the caller on a model, with or without an effort. */
function postRun(model: string, effort?: unknown): Promise<Response> {
	return createConversation().then((conversationId) =>
		fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				runId: randomUUID(),
				conversationId,
				text: 'hello',
				model,
				...(effort === undefined ? {} : { effort }),
			}),
		}),
	);
}

describe('reasoningOptions', () => {
	it('openai-compatible sends reasoningEffort under the adapter name', () => {
		for (const level of ['low', 'medium', 'high'] as const) {
			assert.deepEqual(reasoningOptions(target('openai-compatible', 'groq'), level), {
				groq: { reasoningEffort: level },
			});
		}
	});

	it('the platform (OpenRouter) sends reasoning.effort', () => {
		assert.deepEqual(reasoningOptions(target('openai-compatible', 'platform', { platformBudget: true }), 'high'), {
			platform: { reasoning: { effort: 'high' } },
		});
	});

	it('anthropic sends a thinking budget per level, capped by the output room', () => {
		const budgets = { low: 1_024, medium: 4_096, high: 16_000 };
		for (const [level, budget] of Object.entries(budgets)) {
			assert.deepEqual(reasoningOptions(target('anthropic', 'anthropic'), level as 'low', 32_000), {
				anthropic: { thinking: { type: 'enabled', budgetTokens: budget } },
			});
		}
		assert.deepEqual(reasoningOptions(target('anthropic', 'anthropic'), 'high', 6_000), {
			anthropic: { thinking: { type: 'enabled', budgetTokens: 4_976 } },
		});
	});

	it('anthropic sends nothing when the room leaves under 1 024 tokens', () => {
		assert.deepEqual(reasoningOptions(target('anthropic', 'anthropic'), 'low', 2_000), {});
	});

	it('google sends a thinking budget', () => {
		assert.deepEqual(reasoningOptions(target('google', 'google'), 'medium'), {
			google: { thinkingConfig: { thinkingBudget: 8_192 } },
		});
	});

	it('sends nothing without an effort, or on a model that does not reason', () => {
		assert.deepEqual(reasoningOptions(target('openai-compatible', 'groq'), undefined), {});
		assert.deepEqual(reasoningOptions(target('anthropic', 'anthropic', { reasoning: false }), 'high'), {});
	});
});

describe('mergeProviderOptions', () => {
	it('keeps the vision deny and the effort under the same key', () => {
		const deny = { platform: { provider: { data_collection: 'deny' } } };
		const effort = reasoningOptions(target('openai-compatible', 'platform', { platformBudget: true }), 'low');
		assert.deepEqual(mergeProviderOptions(deny, effort), {
			platform: { provider: { data_collection: 'deny' }, reasoning: { effort: 'low' } },
		});
	});

	it('an empty side changes nothing', () => {
		const deny = { platform: { provider: { data_collection: 'deny' } } };
		assert.deepEqual(mergeProviderOptions(deny, {}), deny);
		assert.deepEqual(mergeProviderOptions({}, {}), {});
	});
});

describe('the catalog and the model list', () => {
	it('catalogParse keeps reasoning: true and defaults to false', () => {
		const [provider] = parseCatalog({
			p: {
				id: 'p',
				name: 'P',
				models: {
					a: { id: 'a', name: 'A', reasoning: true },
					b: { id: 'b', name: 'B' },
					c: { id: 'c', name: 'C', reasoning: 'yes' },
				},
			},
		});
		assert.deepEqual(provider.models.map((m) => [m.id, m.reasoning]), [['a', true], ['b', false], ['c', false]]);
	});

	it('GET /api/ai/models carries reasoning for every platform model', async () => {
		const response = await fetch(`${base}/api/ai/models`, {
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}` },
		});
		const { models } = (await response.json()) as { models: { id: string; reasoning: boolean }[] };
		assert.equal(models.find((m) => m.id === REASONER.id)?.reasoning, true);
		assert.equal(models.find((m) => m.id === FREE.id)?.reasoning, false);
		assert.ok(models.every((m) => typeof m.reasoning === 'boolean'));
	});
});

describe('the run route', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false });
	});

	it('rejects an effort it does not know with 400', async () => {
		const response = await postRun(REASONER.id, 'extreme');
		assert.equal(response.status, 400);
		await response.body?.cancel();
	});

	it('accepts the three levels, and sends the effort in the request body', async () => {
		for (const level of ['low', 'medium', 'high']) {
			const response = await postRun(REASONER.id, level);
			assert.equal(response.status, 200);
			await collect(new SseStream(response));
			const body = mock.lastBody() as { reasoning?: { effort?: string } };
			assert.equal(body.reasoning?.effort, level);
		}
	});

	it('a run without an effort sends no reasoning field', async () => {
		await collect(new SseStream(await postRun(REASONER.id)));
		const body = mock.lastBody() as Record<string, unknown>;
		assert.equal('reasoning' in body, false);
		assert.equal('reasoning_effort' in body, false);
	});

	it('an effort on a model that does not reason is not sent', async () => {
		await collect(new SseStream(await postRun(FREE.id, 'high')));
		const body = mock.lastBody() as Record<string, unknown>;
		assert.equal('reasoning' in body, false);
	});
});
