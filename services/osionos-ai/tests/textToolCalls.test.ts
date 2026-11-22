import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { markupStart, MAX_TEXT_CALLS, parseTextToolCalls } from '../src/runs/textToolCalls.ts';
import { textToolCallMiddleware } from '../src/runs/textToolCallMiddleware.ts';
import { createStreamClock } from '../src/runs/streamClock.ts';
import type { TimeoutPhase, Timers } from '../src/runs/streamClock.ts';
import { IDLE_TIMEOUT_MS } from '../src/runs/streamPump.ts';

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
	const out: Part[] = [];
	for await (const part of await wrapped(stream, params)) out.push(part);
	return out;
}

/** A source stream through the middleware; `onModelText` hears every piece of text the model sent. */
async function wrapped(stream: ReadableStream<Part>, params: Record<string, unknown>, onModelText?: () => void): Promise<ReadableStream<Part>> {
	const wrap = textToolCallMiddleware(onModelText).wrapStream as unknown as (options: unknown) => Promise<{ stream: ReadableStream<Part> }>;
	return (await wrap({ doStream: async () => ({ stream }), doGenerate: async () => ({}), params, model: {} })).stream;
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
const callsOf = (parts: Part[]) => parts.filter((part) => part.type === 'tool-call').map((part) => [part.toolName, JSON.parse(String(part.input))]);
const glm = (id: string) => `<tool_call>read_page<arg_key>pageId</arg_key><arg_value>${id}</arg_value></tool_call>`;

/** Fake timers: time moves only when the test says so. */
function fakeTimers() {
	let now = 0;
	let due: { at: number; fire: () => void } | undefined;
	const timers: Timers = {
		setTimeout: (fire, ms) => { due = { at: now + ms, fire }; return 0 as unknown as ReturnType<typeof setTimeout>; },
		clearTimeout: () => { due = undefined; },
		now: () => now,
	};
	const advance = (ms: number) => {
		now += ms;
		if (due && due.at <= now) { const { fire } = due; due = undefined; fire(); }
	};
	return { timers, advance };
}

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

	it('once </tool_call> closes, the call goes out and the prose after it streams again', async () => {
		const out = await through(stepOf([`Reading. ${glm(ID)}`, 'Then ', 'more.']), offered);
		const at = (match: (part: Part) => boolean) => out.findIndex(match);
		assert.ok(at((part) => part.type === 'tool-call') < at((part) => part.delta === 'Then '), 'the call is not held to the end of the text');
		assert.ok(at((part) => part.delta === 'more.') > at((part) => part.delta === 'Then '), 'the prose after it streams piece by piece');
	});

	it('markup held for longer than the idle window still keeps the run alive', async () => {
		const { timers, advance } = fakeTimers();
		const fired: TimeoutPhase[] = [];
		const clock = createStreamClock({ onTimeout: (phase) => fired.push(phase), firstPartMs: 90_000, idleMs: IDLE_TIMEOUT_MS, timers });
		let feed!: ReadableStreamDefaultController<Part>;
		const source = new ReadableStream<Part>({ start(controller) { feed = controller; } });
		const out = await wrapped(source, offered, () => clock.onPart('text-delta'));
		const read = (async () => { for await (const part of out) clock.onPart(part.type); })();
		// 8 pieces of one call, 20 s apart: 160 s held, with no part reaching the pump.
		const pieces = ['A. <tool_call>read_page<arg_key>pageId</arg_key><arg_value>', ...ID.match(/.{1,6}/g)!, '</arg_value></tool_call>'];
		for (const part of stepOf(pieces)) {
			advance(20_000);
			feed.enqueue(part);
			await new Promise((resolve) => setImmediate(resolve));
		}
		feed.close();
		await read;
		clock.stop();
		assert.deepEqual(fired, []);
	});

	it('runs no web, memory, view, MCP or write tool written as text, even when offered: the markup is dropped', async () => {
		const names = ['web_fetch', 'web_search', 'remember', 'open_page', 'open_panel', 'mcp_call', 'create_page', 'archive_page'];
		const all = { tools: [...names, 'read_page'].map((name) => ({ type: 'function', name, inputSchema: {} })) };
		for (const name of names) {
			const out = await through(stepOf([`Quoted: <tool_call>${name}<arg_key>url</arg_key><arg_value>https://x.test</arg_value></tool_call> end`]), all);
			assert.deepEqual(callsOf(out), [], name);
			assert.equal(shown(out), 'Quoted:  end', name);
		}
	});

	it('the same markup cut at any offsets gives the same calls and the same text (seeded)', async () => {
		const whole = `Before. ${glm(ID)} middle <tool_call>{"name": "read_page", "arguments": {"pageId": "x"}}</tool_call> after <b>.`;
		const reference = await through(stepOf([whole]), offered);
		assert.equal(callsOf(reference).length, 2);
		const cuts = fc.uniqueArray(fc.integer({ min: 1, max: whole.length - 1 }), { maxLength: 20 });
		await fc.assert(
			fc.asyncProperty(cuts, async (offsets) => {
				const edges = [0, ...offsets.sort((a, b) => a - b), whole.length];
				const out = await through(stepOf(edges.slice(1).map((end, i) => whole.slice(edges[i], end))), offered);
				assert.equal(shown(out), shown(reference));
				assert.deepEqual(callsOf(out), callsOf(reference));
			}),
			{ seed: 20261122, numRuns: 300 },
		);
	});
});
