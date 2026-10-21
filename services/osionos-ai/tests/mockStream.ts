import type { ServerResponse } from 'node:http';

/**
 * The wire of the mock upstream: the SSE an OpenAI-compatible server sends.
 *
 * The server of the mock decides WHAT it answers; this module says HOW the
 * answer travels: the chunks of the text, the tool calls of a step, and the
 * usage the upstream reports.
 */

/**
 * The knobs the stream of the mock reads.
 *
 * They are the knobs of the answer: how long it takes, how many pieces it has,
 * what it costs, and how many tools it calls at once.
 */
export interface StreamOptions {
	/** The wait before the first chunk. */
	preDelayMs: number;
	/** The number of text chunks of one answer. */
	chunkCount: number;
	/** The wait between two chunks. */
	chunkGapMs: number;
	/** The usage the upstream reports, when it is not the default one.
	 *
	 * A test that needs a step to be expensive says so here: the loop of a
	 * run stops itself on the REAL usage of the steps, and the default usage
	 * (eleven tokens in, seven out) never crosses a reservation.
	 */
	usage: { promptTokens: number; completionTokens: number } | null;
	/** The number of tool calls the model makes at once in one step. */
	parallelToolCalls: number;
}

/** The text of the chunks: "part-0 part-1 …". */
export function chunkTexts(chunkCount: number): string[] {
	const chunks: string[] = [];
	for (let index = 0; index < chunkCount; index += 1) chunks.push(`part-${index} `);
	return chunks;
}

/**
 * The usage the upstream reports: the one of the test, or the default one.
 *
 * The default is eleven tokens in and seven out: it is small enough to be
 * free, and a test that needs a real number says so in its options.
 */
export function usagePayload(usage: StreamOptions['usage']): {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
} {
	const promptTokens = usage?.promptTokens ?? 11;
	const completionTokens = usage?.completionTokens ?? 7;
	return {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		total_tokens: promptTokens + completionTokens,
	};
}

/** One chunk of the OpenAI-compatible stream. */
export function serializeChunk(
	content: string,
	last: boolean,
	sendUsage: boolean,
	usage: StreamOptions['usage'],
): string {
	const payload = {
		id: 'chatcmpl-mock-0001',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'mock-model',
		choices: [{ index: 0, delta: { content }, finish_reason: last ? 'stop' : null }],
		...(last && sendUsage ? { usage: usagePayload(usage) } : {}),
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * One chunk of the tool calls of a step: the calls, one after the other.
 *
 * The wire is the OpenAI one: the arguments travel as a string, the provider
 * parses them when the call is complete, and every call carries its index —
 * that is what tells the provider that the calls are parallel.
 */
export function serializeToolCallChunk(
	calls: readonly { id: string; name: string; args: string }[],
	last: boolean,
	sendUsage: boolean,
	usage: StreamOptions['usage'],
): string {
	const payload = {
		id: 'chatcmpl-mock-0001',
		object: 'chat.completion.chunk',
		created: 0,
		model: 'mock-model',
		choices: [
			{
				index: 0,
				delta: last
					? {}
					: {
							tool_calls: calls.map((call, index) => ({
								index,
								id: call.id,
								type: 'function',
								function: { name: call.name, arguments: call.args },
							})),
						},
				finish_reason: last ? 'tool_calls' : null,
			},
		],
		...(last && sendUsage ? { usage: usagePayload(usage) } : {}),
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * The stream of one answer: the chunks, one after the other.
 *
 * The client that goes away before the end cuts the stream: the mock counts
 * it, and the test sees that the upstream was cut.
 */
export function streamAnswer(
	response: ServerResponse,
	chunks: string[],
	options: StreamOptions,
	sendUsage: boolean,
	usage: StreamOptions['usage'],
	onAbort: () => void,
): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	});
	let index = 0;
	const send = () => {
		if (response.writableEnded || response.destroyed) return;
		const last = index === chunks.length - 1;
		response.write(serializeChunk(chunks[index], last, sendUsage, usage));
		index += 1;
		if (last) {
			response.end('data: [DONE]\n\n');
			return;
		}
		setTimeout(send, options.chunkGapMs);
	};
	setTimeout(send, options.preDelayMs);
	response.on('close', () => {
		// The client went away before the end: the stream was cut.
		if (!response.writableEnded) {
			onAbort();
			response.destroy();
		}
	});
}

/**
 * The stream of one tool call: the call, then the end of the step.
 *
 * The step ends with `tool_calls`: the model asked for a tool, and the
 * answer comes after the tool has run. A step may ask for several tools at
 * once: they travel in the same chunk, one index each.
 *
 * The text of the step comes first, when there is one: a model that says
 * what it is about to do, and then does it, is one step with two parts.
 */
export function streamToolCall(
	response: ServerResponse,
	toolCall: { name: string; arguments: Record<string, unknown> },
	options: StreamOptions,
	sendUsage: boolean,
	usage: StreamOptions['usage'],
	onAbort: () => void,
	before: string = '',
): void {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	});
	const args = JSON.stringify(toolCall.arguments);
	const calls = Array.from({ length: Math.max(1, options.parallelToolCalls) }, (_, index) => ({
		id: `call_mock_${toolCall.name}_${index}`,
		name: toolCall.name,
		args,
	}));
	const send = () => {
		if (response.writableEnded || response.destroyed) return;
		// The words of the step come before the call: the step says what it
		// is about to do, and then does it.
		if (before) response.write(serializeChunk(before, false, false, usage));
		response.write(serializeToolCallChunk(calls, false, sendUsage, usage));
		response.write(serializeToolCallChunk(calls, true, sendUsage, usage));
		response.end('data: [DONE]\n\n');
	};
	setTimeout(send, options.preDelayMs);
	response.on('close', () => {
		if (!response.writableEnded) {
			onAbort();
			response.destroy();
		}
	});
}
