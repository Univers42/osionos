import { randomUUID } from 'node:crypto';
import { wrapLanguageModel } from 'ai';
import type { LanguageModel, LanguageModelMiddleware } from 'ai';
import { READ_TOOLS } from '../tools/readTools.ts';
import { markupStart, MAX_TEXT_CALLS, parseTextToolCalls, TOOL_CALL_OPEN } from './textToolCalls.ts';

/**
 * The model of a run, wrapped so a tool call written as text
 * (textToolCalls.ts) reaches the SDK as a real `tool-call` part: the SDK runs
 * the tool and asks the model again, exactly as for a call of the tool channel.
 * The markup itself never reaches the reader.
 *
 * Only the READ tools of the workspace (READ_TOOLS: search_workspace,
 * read_page, graph_neighbors) are run from text, and only when the step offers
 * them. Markup is quoted text as easily as a call: a page that contains
 * `<tool_call>web_fetch…` must not fetch, so no web, view, memory, skill, MCP
 * or write tool is ever run from text, and none skips its approval. Their
 * markup is dropped, like every block on a step that may call no tool
 * (`toolChoice: 'none'`, the last step of the loop).
 *
 * Caveat: from a `<tool_call>` to its `</tool_call>` the text is held, not
 * streamed; the pump's idle clock hears it through `onModelText`, and the
 * prose after the block streams again. A block never closed is dropped at
 * the end of the text, and a literal `<tool_call>` in a real answer (a doc
 * about the format) is taken for markup and dropped. At most MAX_TEXT_CALLS
 * calls are run per step.
 */

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>;
type WrapStreamOptions = Parameters<WrapStream>[0];
type StreamResult = Awaited<ReturnType<WrapStreamOptions['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;
type Sink = TransformStreamDefaultController<StreamPart>;

const TOOL_CALL_CLOSE = '</tool_call>';

/** The tools a text call may run: the workspace reads, never a tool with an effect or a way out. */
const TEXT_CALL_TOOLS: ReadonlySet<string> = new Set(READ_TOOLS.map((tool) => tool.name));

/** The read tools the step offers, or none when the step may not call one. */
function callableTools(params: WrapStreamOptions['params']): Set<string> {
	if (params.toolChoice?.type === 'none') return new Set();
	const offered = (params.tools ?? []).flatMap((tool) => (tool.type === 'function' ? [tool.name] : []));
	return new Set(offered.filter((name) => TEXT_CALL_TOOLS.has(name)));
}

/** The state of one step's text: what is held back, and the calls it ran. */
interface Held {
	textId: string | null;
	pending: string;
	holding: boolean;
	calls: number;
	allowed: ReadonlySet<string>;
}

function emitText(sink: Sink, held: Held, text: string): void {
	if (text.length > 0 && held.textId !== null) sink.enqueue({ type: 'text-delta', id: held.textId, delta: text });
}

/** A text, parsed: the prose goes out, the calls become `tool-call` parts. */
function emitParsed(sink: Sink, held: Held, raw: string): void {
	const { text, calls } = parseTextToolCalls(raw, held.allowed);
	emitText(sink, held, text);
	for (const call of calls) {
		if (held.calls >= MAX_TEXT_CALLS) return;
		sink.enqueue({ type: 'tool-call', toolCallId: `textcall_${randomUUID()}`, toolName: call.toolName, input: JSON.stringify(call.input) });
		held.calls += 1;
	}
}

/** The held block, once closed: parsed and sent; false while it is still open. */
function closeBlock(sink: Sink, held: Held): boolean {
	const end = held.pending.indexOf(TOOL_CALL_CLOSE);
	if (end === -1) return false;
	const cut = end + TOOL_CALL_CLOSE.length;
	emitParsed(sink, held, held.pending.slice(0, cut));
	held.pending = held.pending.slice(cut);
	held.holding = false;
	return true;
}

/** A piece of text: streamed until markup may begin, held from there to the close of the block. */
function onDelta(sink: Sink, held: Held, delta: string): void {
	held.pending += delta;
	for (;;) {
		if (held.holding && !closeBlock(sink, held)) return;
		const at = markupStart(held.pending);
		emitText(sink, held, at === -1 ? held.pending : held.pending.slice(0, at));
		held.pending = at === -1 ? '' : held.pending.slice(at);
		held.holding = held.pending.startsWith(TOOL_CALL_OPEN);
		if (!held.holding) return;
	}
}

/** What is still held at the end of the text: an open block is dropped, a partial tag is text. */
function release(sink: Sink, held: Held): void {
	if (held.pending.length === 0) return;
	emitParsed(sink, held, held.pending);
	held.pending = '';
	held.holding = false;
}

/** The transform of one step's stream. */
function textCallTransform(allowed: ReadonlySet<string>, onModelText: () => void): TransformStream<StreamPart, StreamPart> {
	const held: Held = { textId: null, pending: '', holding: false, calls: 0, allowed };
	return new TransformStream<StreamPart, StreamPart>({
		transform(part, sink) {
			if (part.type === 'text-start') held.textId = part.id;
			if (part.type === 'text-delta') {
				onModelText();
				return onDelta(sink, held, part.delta);
			}
			if (part.type === 'text-end' || part.type === 'finish') release(sink, held);
			if (part.type === 'finish' && held.calls > 0) {
				return sink.enqueue({ ...part, finishReason: { unified: 'tool-calls', raw: part.finishReason.raw } });
			}
			sink.enqueue(part);
		},
		flush(sink) {
			release(sink, held);
		},
	});
}

/** The middleware; `onModelText` hears every piece of text, held or not (the pump's idle clock). */
export function textToolCallMiddleware(onModelText: () => void = () => undefined): LanguageModelMiddleware {
	return {
		specificationVersion: 'v4',
		wrapStream: async ({ doStream, params }) => {
			const { stream, ...rest } = await doStream();
			return { stream: stream.pipeThrough(textCallTransform(callableTools(params), onModelText)), ...rest };
		},
	};
}

/** The model, reading text-form tool calls; a model given by id is the gateway's and left alone. */
export function withTextToolCalls(model: LanguageModel, onModelText?: () => void): LanguageModel {
	if (typeof model === 'string') return model;
	return wrapLanguageModel({ model, middleware: textToolCallMiddleware(onModelText) });
}
