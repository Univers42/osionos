/**
 * The tool calls a model wrote in its TEXT instead of the tool channel.
 *
 * Some open models answer the OpenAI wire with their own chat-template markup
 * in `content`: GLM writes `<tool_call>name<arg_key>k</arg_key><arg_value>v
 * </arg_value></tool_call>`, Hermes/Qwen write `<tool_call>{"name": …,
 * "arguments": {…}}</tool_call>`. Read as an answer, that markup was shown raw
 * and ended the run with no answer (live run 2026-11-22, model
 * `openrouter/free`). Parsed here, it becomes the call the model meant.
 *
 * Caveat: only the `<tool_call>` wrapper is recognised. Mistral's
 * `[TOOL_CALLS]`, Llama's `<|python_tag|>` or a bare JSON object stay text.
 * A GLM value is JSON-decoded when it parses (the template dumps non-strings
 * as JSON), so a string value that happens to be valid JSON (`"12"`, `true`)
 * reaches the tool as a number or a boolean: the tool schemas are loose and
 * answer a wrong type with their own refusal. At most MAX_TEXT_CALLS calls of
 * MAX_CALL_CHARS characters each are read per step; the rest is dropped.
 */

export const TOOL_CALL_OPEN = '<tool_call>';
const BLOCK = /<tool_call>([\s\S]*?)(<\/tool_call>|$)/g;
const GLM_ARG = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

/** Bounds of one step: a model that loops on markup cannot flood the tools. */
export const MAX_TEXT_CALLS = 8;
export const MAX_CALL_CHARS = 8_000;

/** A call read from the text: the tool it names and its arguments. */
export interface TextToolCall {
	toolName: string;
	input: Record<string, unknown>;
}

/** The text without its markup, and the calls the markup held. */
export interface ParsedText {
	text: string;
	calls: TextToolCall[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonOrNull(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** `{"name": …, "arguments": {…}}`; the arguments may be a JSON string, as on the wire. */
function hermesCall(body: string): TextToolCall | null {
	const parsed = jsonOrNull(body);
	if (!isRecord(parsed) || typeof parsed.name !== 'string') return null;
	const raw = parsed.arguments ?? parsed.parameters ?? {};
	const input = typeof raw === 'string' ? jsonOrNull(raw) : raw;
	return isRecord(input) ? { toolName: parsed.name.trim(), input } : null;
}

/** `name<arg_key>k</arg_key><arg_value>v</arg_value>…`. */
function glmCall(body: string): TextToolCall | null {
	const cut = body.indexOf('<arg_key>');
	const toolName = (cut === -1 ? body : body.slice(0, cut)).trim();
	const input: Record<string, unknown> = {};
	for (const [, key, value] of body.matchAll(GLM_ARG)) {
		const decoded = jsonOrNull(value.trim());
		input[key.trim()] = decoded === null ? value.trim() : decoded;
	}
	return { toolName, input };
}

/** One closed block: a call to a tool the request offered, or nothing. */
function blockCall(body: string, allowed: ReadonlySet<string>): TextToolCall | null {
	if (body.length > MAX_CALL_CHARS) return null;
	const trimmed = body.trim();
	const call = trimmed.startsWith('{') ? hermesCall(trimmed) : glmCall(trimmed);
	if (!call || !TOOL_NAME.test(call.toolName) || !allowed.has(call.toolName)) return null;
	return call;
}

/**
 * The calls of a text, and the text without any `<tool_call>` block. A block
 * left open (the output was cut) is markup too: it is dropped, never called.
 */
export function parseTextToolCalls(text: string, allowed: ReadonlySet<string>): ParsedText {
	const calls: TextToolCall[] = [];
	const rest = text.replace(BLOCK, (_block, body: string, close: string) => {
		const call = close && calls.length < MAX_TEXT_CALLS ? blockCall(body, allowed) : null;
		if (call) calls.push(call);
		return '';
	});
	return { text: rest.trim().length === 0 ? '' : rest, calls };
}

/**
 * Where markup may begin in `text`: the index of `<tool_call>`, or of a tail
 * that is the start of it (`<tool`), or -1. The stream holds from there.
 */
export function markupStart(text: string): number {
	const at = text.indexOf(TOOL_CALL_OPEN);
	if (at !== -1) return at;
	for (let size = Math.min(TOOL_CALL_OPEN.length - 1, text.length); size > 0; size -= 1) {
		if (TOOL_CALL_OPEN.startsWith(text.slice(-size))) return text.length - size;
	}
	return -1;
}
