// The small statistics and the seeded generator of the LLM benchmark.

export function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		a = Math.imul(a ^ (a >>> 15), 1 | a);
		a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
		return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
	};
}

/** The percentile of a sorted list, nearest rank (the convention of P0a/P0c). */
export function pct(sorted, p) {
	if (sorted.length === 0) return NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[index];
}
export const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/**
 * Whether a streamed delta is a "first content part" (R20): non-empty content,
 * reasoning, or tool calls. Mirrors CONTENT_PARTS in src/runs/streamClock.ts.
 */
export function partKind(delta) {
	if (typeof delta?.content === 'string' && delta.content.length > 0) return 'content';
	const reasoning = delta?.reasoning_content ?? delta?.reasoning;
	if (typeof reasoning === 'string' && reasoning.length > 0) return 'reasoning';
	if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) return 'tool';
	return null;
}
