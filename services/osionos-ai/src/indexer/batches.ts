/**
 * The cross-page batches: the chunks of the pages of a round, packed into the
 * calls of the embedder.
 *
 * Pure: the chunks in, the calls out. The worker collects the chunks that
 * changed on EVERY page of the round, and this module packs them into calls
 * that are bounded by a TOKEN budget (and by a number of inputs).
 *
 * Why a round at all: the embedder is happier with big batches than with many
 * small ones, and a page is a small batch — a page of four chunks is a call of
 * four inputs, and the bulk backfill then runs on tiny calls. Packing the
 * pages of a round together fills the calls.
 *
 * The chunks are sorted by length before they are packed: a call is then made
 * of chunks of the same size, and the service pads less.
 *
 * Caveat: the token budget is an ESTIMATE (four characters per token), and it
 * is the estimate of the chunks of this corpus that the packing is tuned for.
 * A corpus of CJK text or of code is under-counted, and a call can then be
 * bigger than the service wanted.
 */

/** The default token budget of one call: eight thousand tokens. */
export const EMBED_TOKEN_BUDGET = 8192;

/** The most inputs of one call. */
export const EMBED_MAX_INPUTS = 64;

/** One chunk to embed: the page it belongs to, its hash, and its text. */
export interface EmbedItem {
	/** The page the chunk belongs to: the vector goes back to it. */
	pageId: string;
	/** The hash of the chunk: the key of its vector. */
	hash: string;
	/** The text of the chunk, ready for the service. */
	input: string;
	/** The estimated tokens of the text. */
	tokens: number;
}

/** One call of the embedder: the items, and the tokens they take. */
export interface EmbedBatch {
	items: EmbedItem[];
	tokens: number;
}

/**
 * The calls of a round: the items packed into calls.
 *
 * The items are sorted by length, and each call is filled until the next item
 * would pass the budget (or the number of inputs). An item that is bigger
 * than the budget goes alone: it is cut short by the service, not by us.
 */
export function packBatches(
	items: readonly EmbedItem[],
	budgetTokens: number = EMBED_TOKEN_BUDGET,
	maxInputs: number = EMBED_MAX_INPUTS,
): EmbedBatch[] {
	const budget = Math.max(1, Math.floor(budgetTokens));
	const inputs = Math.max(1, Math.floor(maxInputs));
	const batches: EmbedBatch[] = [];
	let current: EmbedItem[] = [];
	let tokens = 0;

	const sorted = [...items].sort((left, right) => left.tokens - right.tokens);
	for (const item of sorted) {
		const full = current.length >= inputs;
		const tooLong = current.length > 0 && tokens + item.tokens > budget;
		if (full || tooLong) {
			batches.push({ items: current, tokens });
			current = [];
			tokens = 0;
		}
		current.push(item);
		tokens += item.tokens;
	}
	if (current.length > 0) batches.push({ items: current, tokens });
	return batches;
}
