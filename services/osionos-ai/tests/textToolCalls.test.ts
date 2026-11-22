import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { markupStart, MAX_TEXT_CALLS, parseTextToolCalls } from '../src/runs/textToolCalls.ts';
import { textToolCallMiddleware } from '../src/runs/textToolCallMiddleware.ts';

/** The calls a model writes as text (textToolCalls.ts), and the stream that turns them into calls. */
const TOOLS = new Set(['read_page', 'search_workspace']);
const ID = '5a4b1c2d-1111-4111-8111-000000000001';

describe('parseTextToolCalls', () => {
	it('reads the GLM form, a JSON value decoded and a string kept', () => {
		const text = `<tool_call>search_workspace\n<arg_key>query</arg_key>\n<arg_value>syntax variables</arg_value>\n<arg_key>limit</arg_key><arg_value>3</arg_value>\n</tool_call>`;
		assert.deepEqual(parseTextToolCalls(text, TOOLS), { text: '', calls: [{ toolName: 'search_workspace', input: { query: 'syntax variables', limit: 3 } }] });
	});

	it('reads the Hermes form, with arguments as an object or as a JSON string', () => {
		const object = `<tool_call>{"name": "read_page", "arguments": {"pageId": "${ID}"}}</tool_call>`;
		const string = `<tool_call>{"name": "read_page", "arguments": "{\\"pageId\\": \\"${ID}\\"}"}</tool_call>`;
		for (const text of [object, string]) {
			assert.deepEqual(parseTextToolCalls(text, TOOLS).calls, [{ toolName: 'read_page', input: { pageId: ID } }]);
		}
	});

	it('keeps the prose around the markup', () => {
		const parsed = parseTextToolCalls(`Let me read it. <tool_call>read_page<arg_key>pageId</arg_key><arg_value>${ID}</arg_value></tool_call>`, TOOLS);
		assert.equal(parsed.text, 'Let me read it. ');
		assert.equal(parsed.calls.length, 1);
	});

	it('drops, never calls, a tool the request did not offer, broken JSON, or a block left open', () => {
		for (const text of ['<tool_call>delete_everything</tool_call>', '<tool_call>{"name": "read_page", </tool_call>', `<tool_call>read_page<arg_key>pageId</arg_key><arg_value>${ID}`]) {
			assert.deepEqual(parseTextToolCalls(text, TOOLS), { text: '', calls: [] }, text);
		}
	});

	it(`reads at most ${MAX_TEXT_CALLS} calls of one step`, () => {
		const one = `<tool_call>read_page<arg_key>pageId</arg_key><arg_value>${ID}</arg_value></tool_call>`;
		assert.equal(parseTextToolCalls(one.repeat(MAX_TEXT_CALLS + 5), TOOLS).calls.length, MAX_TEXT_CALLS);
	});

	it('never throws, and no <tool_call> survives in the text it returns', () => {
		fc.assert(
			fc.property(fc.array(fc.oneof(fc.string(), fc.constantFrom('<tool_call>', '</tool_call>', '<arg_key>', '</arg_value>', '{"name":'))), (pieces) => {
				assert.ok(!parseTextToolCalls(pieces.join(''), TOOLS).text.includes('<tool_call>'));
			}),
		);
	});

	it('markupStart finds the tag, or the start of it at the end of a piece', () => {
		assert.deepEqual(['ab<tool_call>x', 'ab<tool', 'a <b', 'plain'].map(markupStart), [2, 2, -1, -1]);
	});
});

type Part = Record<string, unknown> & { type: string };

/** The stream of one step through the middleware: what the SDK reads. */
async function through(parts: Part[], params: Record<string, unknown>): Promise<Part[]> {
	const stream = new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } });
	const wrap = textToolCallMiddleware.wrapStream as unknown as (options: unknown) => Promise<{ stream: ReadableStream<Part> }>;
	const result = await wrap({ doStream: async () => ({ stream }), doGenerate: async () => ({}), params, model: {} });
	const out: Part[] = [];
	for await (const part of result.stream) out.push(part);
	return out;
}

const markupSplit = ['I will read it. <to', 'ol_call>read_page<arg_key>pageId</arg_key>', `<arg_value>${ID}</arg_value></tool_call>`];
const stepOf = (pieces: string[]): Part[] => [
	{ type: 'text-start', id: 't' },
	...pieces.map((delta) => ({ type: 'text-delta', id: 't', delta })),
	{ type: 'text-end', id: 't' },
	{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: {} },
];
const shown = (parts: Part[]) => parts.filter((part) => part.type === 'text-delta').map((part) => part.delta).join('');
const offered = { tools: [{ type: 'function', name: 'read_page', inputSchema: {} }] };

describe('the text-call middleware', () => {
	it('turns markup split across pieces into one tool-call, and the step finishes on tool-calls', async () => {
		const out = await through(stepOf(markupSplit), offered);
		assert.equal(shown(out), 'I will read it. ');
		const call = out.find((part) => part.type === 'tool-call');
		assert.equal(call?.toolName, 'read_page');
		assert.deepEqual(JSON.parse(String(call?.input)), { pageId: ID });
		assert.deepEqual(out.at(-1)?.finishReason, { unified: 'tool-calls', raw: 'stop' });
	});

	it('on a step that may not call a tool, drops the markup and calls nothing', async () => {
		const out = await through(stepOf(markupSplit), { ...offered, toolChoice: { type: 'none' } });
		assert.equal(shown(out), 'I will read it. ');
		assert.ok(!out.some((part) => part.type === 'tool-call'));
		assert.deepEqual(out.at(-1)?.finishReason, { unified: 'stop', raw: 'stop' });
	});

	it('passes a text with no markup through unchanged, a lone < included', async () => {
		const out = await through(stepOf(['a < b and ', '<tab> too']), offered);
		assert.equal(shown(out), 'a < b and <tab> too');
	});
});
