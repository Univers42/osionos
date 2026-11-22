import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { lastOf, startKit } from './failoverKit.ts';
import type { SseEvent } from './sse.ts';

/**
 * A run never ends in silence (user report 2026-11-22).
 *
 * Two live runs ended with no answer: one spent its whole output on reasoning
 * (finish `length`, not one text delta), the other wrote its tool call as TEXT
 * (`<tool_call>read_page<arg_key>…`) and that text was the answer. The model
 * here is the scripted upstream: no provider is called.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, clean } = kit;
const MODEL = 'mock-metered';

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

/** One SSE chunk of the OpenAI wire, and the end of the stream. */
function sse(delta: Record<string, unknown>, finishReason: string): string {
	const chunk = {
		id: 'chatcmpl-silent',
		object: 'chat.completion.chunk',
		created: 0,
		model: MODEL,
		choices: [{ index: 0, delta, finish_reason: finishReason }],
		usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
	};
	return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
}

const glmCall = (pageId: string) =>
	`<tool_call>read_page\n<arg_key>pageId</arg_key>\n<arg_value>${pageId}</arg_value>\n</tool_call>`;
const hermesCall = (pageId: string) =>
	`<tool_call>\n{"name": "read_page", "arguments": {"pageId": "${pageId}"}}\n</tool_call>`;

const typed = (events: SseEvent[], type: string) => events.filter((event) => event.event === type);
const shownText = (events: SseEvent[]) => typed(events, 'text.delta').map((event) => (event.data as { text: string }).text).join('');
const lastData = (events: SseEvent[]) => lastOf(events).data as Record<string, unknown>;

describe('a tool call the model wrote as text', () => {
	beforeEach(clean);

	for (const [format, write] of [['GLM', glmCall], ['Hermes', hermesCall]] as const) {
		it(`the ${format} form is a real call, and the run goes on to the answer`, async () => {
			const pageId = randomUUID();
			failing.script(MODEL, { behaviour: 'sse', body: sse({ content: write(pageId) }, 'stop') }, 'ok');
			const { events } = await runToEnd({ model: MODEL });
			const called = typed(events, 'tool.called').map((event) => event.data as { toolName: string; input: { pageId: string } });
			assert.deepEqual(called.map((call) => [call.toolName, call.input.pageId]), [['read_page', pageId]]);
			assert.equal(typed(events, 'tool.result').length, 1);
			assert.equal(failing.countFor(MODEL), 2, 'the model is asked again with the result');
			assert.ok(!/tool_call|arg_key/.test(shownText(events)), 'no markup reaches the reader');
			assert.ok(shownText(events).length > 0);
			assert.equal(lastOf(events).event, 'done');
		});
	}

	it('on the step that may not call a tool, the markup is dropped and the reader is told', async () => {
		failing.script(MODEL, 'tool', 'tool', 'tool', 'tool', { behaviour: 'sse', body: sse({ content: glmCall(randomUUID()) }, 'stop') });
		const { events } = await runToEnd({ model: MODEL });
		assert.ok(!/tool_call|arg_key/.test(shownText(events)), 'no markup reaches the reader');
		assert.deepEqual(lastData(events), { code: 'empty_answer' });
	});
});

describe('a run that ends without an answer says so', () => {
	beforeEach(clean);

	it('all of the output spent on reasoning (finish length) is answer_cut_off', async () => {
		failing.script(MODEL, { behaviour: 'sse', body: sse({ reasoning_content: 'thinking…' }, 'length') });
		const { events } = await runToEnd({ model: MODEL });
		assert.deepEqual(lastData(events), { code: 'answer_cut_off' });
	});

	it('an empty answer with finish stop is empty_answer', async () => {
		failing.script(MODEL, { behaviour: 'sse', body: sse({ content: '' }, 'stop') });
		const { events } = await runToEnd({ model: MODEL });
		assert.deepEqual(lastData(events), { code: 'empty_answer' });
	});

	it('an answer the provider filtered away is answer_filtered', async () => {
		failing.script(MODEL, { behaviour: 'sse', body: sse({ content: '' }, 'content_filter') });
		const { events } = await runToEnd({ model: MODEL });
		assert.deepEqual(lastData(events), { code: 'answer_filtered' });
	});
});

describe('a read_page refused for its id', () => {
	beforeEach(clean);

	it('tells the model where a page id comes from', async () => {
		failing.script(MODEL, 'tool', 'ok');
		await runToEnd({ model: MODEL });
		const messages = failing.bodiesFor(MODEL)[1].messages as { role: string; content: unknown }[];
		const result = JSON.stringify(messages.filter((message) => message.role === 'tool').map((message) => message.content));
		assert.ok(result.includes('search_workspace'), `the model is pointed to the search: ${result}`);
		assert.ok(result.includes('<workspace>'), 'and to the ids the prompt lists');
	});
});
