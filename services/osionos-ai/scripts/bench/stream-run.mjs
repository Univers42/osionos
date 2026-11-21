// One streamed chat completion of the LLM benchmark, timed. Its own module so
// tests import it with a fake fetch instead of slicing the bench source.

import { sseObjects } from './sse.mjs';
import { partKind } from './stream-stats.mjs';

const DEFAULT_TIMEOUT_MS = 180000;

async function postCompletion(body, { api, headers = {}, timeoutMs, fetchImpl }) {
	try {
		const res = await fetchImpl(`${api}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (res.ok) return { res };
		const text = await res.text();
		return { error: `http_${res.status}: ${text.slice(0, 300)}` };
	} catch (error) {
		return { error: `fetch_failed: ${error.message}` };
	}
}

function newTally() {
	return {
		firstAt: null, firstPartAt: null, sawReasoning: false, contentChars: 0,
		timings: null, usage: null, finishReason: null, contentTimes: [], completed: false,
	};
}

/** Folds one SSE object into the tally; returns an error string to stop the run. */
function foldObject(tally, object, now) {
	if (object?.error !== undefined) return `stream_error: ${JSON.stringify(object.error).slice(0, 300)}`;
	if (object.done) tally.completed = true;
	if (object.timings) tally.timings = object.timings;
	if (object.usage) tally.usage = object.usage;
	const choice = object.choices?.[0];
	if (!choice) return null;
	if (choice.finish_reason) { tally.finishReason = choice.finish_reason; tally.completed = true; }
	const kind = partKind(choice.delta);
	if (kind !== null && tally.firstPartAt === null) tally.firstPartAt = now;
	if (kind === 'reasoning') tally.sawReasoning = true;
	const delta = choice.delta?.content;
	if (typeof delta === 'string' && delta.length > 0) {
		if (tally.firstAt === null) tally.firstAt = now;
		tally.contentTimes.push(now);
		tally.contentChars += delta.length;
	}
	return null;
}

function summarize(tally, started) {
	if (!tally.completed) return { error: 'stream_incomplete: ended without completion' };
	// R24: a stream with no content part is not a success.
	if (tally.firstPartAt === null) return { error: 'no_content_part: the stream finished with nothing' };
	const times = tally.contentTimes;
	return {
		ttftMs: tally.firstAt === null ? NaN : tally.firstAt - started,
		firstPartMs: tally.firstPartAt - started,
		sawReasoning: tally.sawReasoning,
		totalMs: performance.now() - started,
		itlMs: times.slice(1).map((at, index) => at - times[index]),
		contentChunks: times.length,
		contentChars: tally.contentChars,
		finishReason: tally.finishReason,
		timings: tally.timings,
		usage: tally.usage,
	};
}

/**
 * @param {object} body the chat completion request
 * @param {{ api: string, headers?: object, timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
export async function runOne(body, { api, headers, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
	const started = performance.now();
	const posted = await postCompletion(body, { api, headers, timeoutMs, fetchImpl });
	if (posted.error) return { error: posted.error };
	const tally = newTally();
	try {
		for await (const object of sseObjects(posted.res)) {
			const error = foldObject(tally, object, performance.now());
			if (error) return { error };
		}
	} catch (error) {
		return { error: `stream_failed: ${error.message}` };
	}
	return summarize(tally, started);
}
