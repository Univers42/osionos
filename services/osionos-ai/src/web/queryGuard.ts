import { sanitizeText } from '../mcpClient/schema.ts';

/**
 * Keeps workspace text out of a web query (web C356).
 *
 * A search query leaves the building: it goes to engines we do not run. A
 * model that pastes a sentence of a private page into one leaks it. The run
 * adds every workspace text it read; `overlaps` then refuses a query that
 * repeats a verbatim run of 8 words or 40 characters of any of it, both sides
 * normalised the same way (case-folded, whitespace collapsed, control and
 * format characters dropped).
 *
 * Cost: `overlaps` is O(L + q) window hashes for L ledger chars and q query
 * chars (a Set of the query's windows, one pass over the ledger), never a
 * pairwise comparison. The ledger holds at most MAX_LEDGER_CHARS normalised
 * chars; the oldest text is dropped first.
 *
 * Caveat: a paraphrase, a translation, encoded text (base64, rot13, spelled
 * out letters) or a run shorter than both thresholds passes. Text dropped by
 * the bound, and the part of one text past the bound, is not guarded. Words
 * are split on spaces only, so punctuation glued to a word changes the token.
 */
export const MAX_LEDGER_CHARS = 200_000;
export const OVERLAP_WORDS = 8;
export const OVERLAP_CHARS = 40;

function normalise(text: string): string {
	return sanitizeText(text).toLowerCase().replace(/\s+/gu, ' ');
}

function* charWindows(text: string): Generator<string> {
	for (let start = 0; start + OVERLAP_CHARS <= text.length; start += 1) {
		yield text.slice(start, start + OVERLAP_CHARS);
	}
}

function* wordWindows(text: string): Generator<string> {
	const words = text.split(' ');
	for (let start = 0; start + OVERLAP_WORDS <= words.length; start += 1) {
		yield words.slice(start, start + OVERLAP_WORDS).join(' ');
	}
}

export class WorkspaceTextLedger {
	private texts: string[] = [];
	private size = 0;

	add(text: string): void {
		// UTF-16 units: a window may start mid-surrogate, which only misses an emoji-only run.
		const clean = normalise(text).slice(0, MAX_LEDGER_CHARS);
		if (!clean) return;
		this.texts.push(clean);
		this.size += clean.length;
		while (this.size > MAX_LEDGER_CHARS && this.texts.length > 1) {
			this.size -= this.texts.shift()!.length;
		}
	}

	overlaps(query: string): boolean {
		const clean = normalise(query);
		if (!clean || this.texts.length === 0) return false;
		const chars = new Set(charWindows(clean));
		const words = new Set(wordWindows(clean));
		if (chars.size === 0 && words.size === 0) return false;
		return this.texts.some(
			(text) => hits(charWindows(text), chars) || hits(wordWindows(text), words),
		);
	}
}

function hits(candidates: Iterable<string>, wanted: Set<string>): boolean {
	if (wanted.size === 0) return false;
	for (const candidate of candidates) if (wanted.has(candidate)) return true;
	return false;
}
