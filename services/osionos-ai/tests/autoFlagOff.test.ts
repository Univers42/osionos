/**
 * Flag off (OSIONOS_AI_MODES unset): the tools the model is sent and the event
 * stream of a write request are byte-identical to the BASE behaviour, captured
 * before Task 15 into tests/fixtures/autoFlagOff.json.
 *
 * Caveat: ids, timestamps and token counts are normalised, so a change that
 * only moves one of those is not seen here. The fixture holds one scenario (a
 * proposed add_blocks), not every tool.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

// Unset before the service loads, so a flag set in the caller's environment cannot make this pass without testing the flag-off path.
delete process.env.OSIONOS_AI_MODES;
delete process.env.OSIONOS_AI_MODES_USERS;
const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');

const FIXTURE = new URL('./fixtures/autoFlagOff.json', import.meta.url);
const { app, mock, bridge, postRun, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;

function normalise(value: unknown): unknown {
	const text = JSON.stringify(value).replace(UUID, '<uuid>').replace(ISO, '<time>');
	return JSON.parse(text);
}

async function scenario(): Promise<{ tools: unknown; events: unknown }> {
	const pageId = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 'The notes', 'shared', '[]'::jsonb)`,
		[pageId, WORKSPACE_A, USER_A],
	);
	mock.setOptions({
		preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, usage: null, toolCallEveryStep: false, parallelToolCalls: 1,
		toolCall: { name: 'add_blocks', arguments: { pageId, blocks: [{ type: 'paragraph', content: 'hello' }] } },
		toolCallTrigger: 'do it',
	});
	const before = mock.bodies.length;
	const conversationId = await createConversation();
	const response = await postRun(conversationId, randomUUID(), 'do it', undefined, tokenFor(USER_A, WORKSPACE_A));
	const events = (await collect(new SseStream(response))).map(({ event, data }) => ({ event, data }));
	const sent = mock.bodies[before] as { tools?: unknown };
	return { tools: normalise(sent.tools), events: normalise(events) };
}

describe('flag off is the BASE behaviour', () => {
	it('sends the same tools and streams the same events', async () => {
		const actual = await scenario();
		if (!existsSync(FIXTURE)) {
			process.stdout.write(`FIXTURE-B64:${Buffer.from(JSON.stringify(actual, null, 1)).toString('base64')}\n`);
			assert.fail('fixture missing: captured above');
		}
		assert.deepEqual(actual, JSON.parse(readFileSync(FIXTURE, 'utf8')));
	});
});
