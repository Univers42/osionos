import { randomUUID } from 'node:crypto';
import { wrapLanguageModel } from 'ai';
import type { LanguageModel, LanguageModelMiddleware } from 'ai';
import { markupStart, parseTextToolCalls, TOOL_CALL_OPEN } from './textToolCalls.ts';

/**
 * The model of a run with tools, wrapped so a tool call written as text
 * (textToolCalls.ts) reaches the SDK as a real `tool-call` part: the SDK runs
 * the tool and asks the model again, exactly as for a call of the tool channel.
 * The markup itself never reaches the reader.
 *
 * On a step that may not call a tool (`toolChoice: 'none'`, the last step of
 * the loop) the markup is dropped and nothing is called: what is left is the
 * answer, possibly an empty one (src/runs/emptyAnswer.ts names that).
 *
 * Caveat: from the first `<tool_call>` of a step on, the rest of that step's
 * text is held and released at the end of the text part, so a model that
 * writes prose AFTER its call shows that prose in one piece instead of
 * streamed. A literal `<tool_call>` in a real answer (a doc about the
 * format) is taken for markup and dropped.
 */

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>;
type WrapStreamOptions = Parameters<WrapStream>[0];
type StreamResult = Awaited<ReturnType<WrapStreamOptions['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;
type Sink = TransformStreamDefaultController<StreamPart>;

/** The function tools the request offers, or none when the step may not call one. */
function callableTools(params: WrapStreamOptions['params']): Set<string> {
	if (params.toolChoice?.type === 'none') return new Set();
	return new Set((params.tools ?? []).flatMap((tool) => (tool.type === 'function' ? [tool.name] : [])));
}

/** The state of one step's text: what is held back, and the calls it held. */
interface Held {
	textId: string | null;
	pending: string;
	holding: boolean;
	called: boolean;
}

function emitText(sink: Sink, held: Held, text: string): void {
	if (text.length > 0 && held.textId !== null) sink.enqueue({ type: 'text-delta', id: held.textId, delta: text });
}

/** A piece of text: streamed until markup may begin, held from there. */
function onDelta(sink: Sink, held: Held, delta: string): void {
	held.pending += delta;
	if (held.holding) return;
	const at = markupStart(held.pending);
	if (at === -1) {
		emitText(sink, held, held.pending);
		held.pending = '';
		return;
	}
	emitText(sink, held, held.pending.slice(0, at));
	held.pending = held.pending.slice(at);
	held.holding = held.pending.startsWith(TOOL_CALL_OPEN);
}

/** The held text, parsed: the prose goes out, the calls become `tool-call` parts. */
function release(sink: Sink, held: Held, allowed: ReadonlySet<string>): void {
	if (held.pending.length === 0) return;
	const { text, calls } = parseTextToolCalls(held.pending, allowed);
	held.pending = '';
	held.holding = false;
	emitText(sink, held, text);
	for (const call of calls) {
		sink.enqueue({ type: 'tool-call', toolCallId: `textcall_${randomUUID()}`, toolName: call.toolName, input: JSON.stringify(call.input) });
		held.called = true;
	}
}

/** The transform of one step's stream. */
function textCallTransform(allowed: ReadonlySet<string>): TransformStream<StreamPart, StreamPart> {
	const held: Held = { textId: null, pending: '', holding: false, called: false };
	return new TransformStream<StreamPart, StreamPart>({
		transform(part, sink) {
			if (part.type === 'text-start') held.textId = part.id;
			if (part.type === 'text-delta') return onDelta(sink, held, part.delta);
			if (part.type === 'text-end' || part.type === 'finish') release(sink, held, allowed);
			if (part.type === 'finish' && held.called) {
				return sink.enqueue({ ...part, finishReason: { unified: 'tool-calls', raw: part.finishReason.raw } });
			}
			sink.enqueue(part);
		},
		flush(sink) {
			release(sink, held, allowed);
		},
	});
}

export const textToolCallMiddleware: LanguageModelMiddleware = {
	specificationVersion: 'v4',
	wrapStream: async ({ doStream, params }) => {
		const { stream, ...rest } = await doStream();
		return { stream: stream.pipeThrough(textCallTransform(callableTools(params))), ...rest };
	},
};

/** The model, reading text-form tool calls; a model given by id is the gateway's and left alone. */
export function withTextToolCalls(model: LanguageModel): LanguageModel {
	if (typeof model === 'string') return model;
	return wrapLanguageModel({ model, middleware: textToolCallMiddleware });
}
