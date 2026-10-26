import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * OSIONOS_AI_RESEARCH unset (C415): `mode` is a 400, and the tool set, the
 * reservation and the limits are the chat's. Its own file: the service reads
 * the flag once, at import.
 */
delete process.env.OSIONOS_AI_RESEARCH;

const base = await serveAi();
const { config } = await import('../src/config.ts');
const { buildRunTools } = await import('../src/runs/toolSet.ts');
const { createToolPool, TOOL_DEFINITION_CHARS, MAX_STEPS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS } = await import('../src/tools/index.ts');
const { estimateRunMicroUsd } = await import('../src/runs/estimate.ts');
const { DEFAULT_RUN_LIMITS } = await import('../src/tools/limits.ts');

const PLATFORM = { id: 'mock-platform', label: 'p', inputMicroUsdPerMTok: 3_000_000, outputMicroUsdPerMTok: 15_000_000, default: false };

async function post(body: Record<string, unknown>): Promise<number> {
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(randomUUID())}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId: randomUUID(), conversationId: randomUUID(), text: 'hi', ...body }),
	});
	await response.body?.cancel();
	return response.status;
}

describe('research mode with the flag off', () => {
	it('C415 a body with mode is a 400; the same body without it reaches the conversation lookup', async () => {
		assert.equal(config.researchEnabled, false);
		assert.equal(await post({ mode: 'research' }), 400);
		assert.equal(await post({}), 404);
	});

	it('C415 the tool set has only the chat\'s tools and the reservation of a hello is today\'s', () => {
		const run = buildRunTools({
			db: {} as Pool,
			user: { userId: randomUUID(), workspaceId: randomUUID(), memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() },
			pool: createToolPool(),
			runId: randomUUID(),
			conversationId: randomUUID(),
			ownerId: randomUUID(),
			pages: [],
			sources: [],
			emit: async () => {},
		});
		assert.ok(Object.keys(run.tools ?? {}).length > 4, 'the chat keeps its whole read set');
		assert.equal(TOOL_DEFINITION_CHARS, 7543);
		// Measured with the defaults on 2026-10-26; a change here moves every reservation.
		assert.equal(estimateRunMicroUsd(PLATFORM, { text: 'hello', historyChars: 0 }), 59_166);
		assert.deepEqual(DEFAULT_RUN_LIMITS, { maxSteps: MAX_STEPS, stepChars: TOOL_OUTPUT_CHARS, poolChars: TOOL_POOL_CHARS });
	});
});
