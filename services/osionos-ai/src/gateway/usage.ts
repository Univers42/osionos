/**
 * The usage a call is settled with: the tokens, and where they come from.
 *
 * There is ONE function here, and the runs and the inline completions both
 * settle with it. A second copy would drift, and a drift would show up as a
 * free run in the ledger.
 */

/** The usage of a call, in tokens, and whether it was estimated. */
export interface SettledUsage {
	inputTokens: number;
	outputTokens: number;
	/** True when the provider reported nothing: the numbers are an estimate. */
	estimated: boolean;
}

/** The characters of a token, as a rule of thumb: four. */
const CHARS_PER_TOKEN = 4;

/** The tokens of a text, estimated: one token every four characters. */
export function estimateTokens(chars: number): number {
	return Math.ceil(Math.max(chars, 0) / CHARS_PER_TOKEN);
}

/**
 * The usage a call is settled with: what the provider reported, or an estimate.
 *
 * An OpenAI-compatible upstream reports the tokens of a stream only when it is
 * asked to (`stream_options: { include_usage: true }`), and most servers that
 * do not know the option send nothing at all. A run that settled on that
 * would be free: the reservation would be given back and the daily cap would
 * never trip. So the numbers are estimated from the text that went in and the
 * text that came out, and the estimate is priced like a real usage.
 *
 * Caveat: chars/4 under-counts CJK and code, and over-counts short words. It
 * only applies when the provider reports nothing at all.
 *
 * The log line belongs to the settlement: a caller that only measures (the
 * stop condition of the loop) asks for the estimate without the line, so the
 * ledger is not told twice that the same run was not measured.
 */
export function usageForSettlement(
	runId: string,
	reported: { inputTokens?: number; outputTokens?: number } | undefined,
	{ promptChars, outputChars }: { promptChars: number; outputChars: number },
	options: { log?: boolean } = {},
): SettledUsage {
	const inputTokens = reported?.inputTokens ?? 0;
	const outputTokens = reported?.outputTokens ?? 0;
	if (inputTokens > 0 || outputTokens > 0) {
		return { inputTokens, outputTokens, estimated: false };
	}
	// One line, so the ledger can be read: this run was not measured.
	if (options.log !== false) {
		console.info(JSON.stringify({ event: 'usage_estimated', runId, usageEstimated: true }));
	}
	return {
		inputTokens: estimateTokens(promptChars),
		outputTokens: estimateTokens(outputChars),
		estimated: true,
	};
}
