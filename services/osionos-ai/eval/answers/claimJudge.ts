import { z } from 'zod';
import { sourceBlock } from '../../src/runs/sources.ts';
import type { RetrievedChunk } from '../../src/retrieval/search.ts';
import type { Verdict } from './judge.ts';

/**
 * The claim-level judge: pure apart from an injected complete(prompt) -> string.
 *
 * The one-shot judge scores a whole answer on one bit, so one unsupported
 * claim hides inside an otherwise good answer. This judge asks the model for
 * every claim with a quote it must copy from a source, checks the quote is
 * really there, then asks a second, narrow question per claim: does the quote
 * state it?
 */

const claimSchema = z.object({
	claim: z.string(),
	source: z.number().int(),
	quote: z.string(),
});

const claimsSchema = z.object({
	abstained: z.boolean(),
	relevant: z.number().int().min(1).max(5),
	claims: z.array(claimSchema),
});

export type ClaimsResult = z.infer<typeof claimsSchema>;

/**
 * Build a minimal RetrievedChunk from a source text string.
 */
function toChunk(text: string, index: number): RetrievedChunk {
	return {
		pageId: `source-${index}`,
		blockId: null,
		title: `Source ${index + 1}`,
		headingPath: '',
		snippet: text,
		score: 1,
	};
}

/**
 * Build the first prompt: every factual statement becomes one claim, with the
 * number of the source that supports it and a quote copied word for word.
 *
 * The sources go in as quoted data, through the service's own sourceBlock.
 */
export function claimsPrompt(question: string, answer: string, sources: string[]): string {
	const sourceBlocks = sources.map((source, index) =>
		sourceBlock(toChunk(source, index), index + 1),
	);

	const rubric = [
		'You are checking an answer against the sources it was given.',
		'',
		'Question: ' + question,
		'',
		'Answer: ' + answer,
		'',
		'Sources:',
		...sourceBlocks,
		'',
		'List every factual statement in the answer as one claim. For each claim give:',
		'- claim: the statement, in the answer\'s own words;',
		'- source: the number of the one source that supports it (1-based);',
		'- quote: a passage copied word for word from that source, with no paraphrase, that states the claim.',
		'',
		'An abstention ("not found in your workspace") has no claims: reply with an empty claims list.',
		'relevant: 1-5, how well the answer addresses the question.',
		'abstained: true if the answer says the information was not found in the workspace.',
		'',
		'Reply with strict JSON only: {"abstained": true|false, "relevant": 1|2|3|4|5, "claims": [{"claim": "...", "source": 1, "quote": "..."}]}',
	].join('\n');

	return rubric;
}

/**
 * The first JSON object in the text, braces balanced and strings respected.
 * The answer may wrap it in prose or a code fence; its claims are objects
 * inside an array, so a flat non-greedy match would stop too early.
 */
function firstJsonObject(text: string): string | null {
	const start = text.indexOf('{');
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < text.length; index++) {
		const char = text[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return text.slice(start, index + 1);
		}
	}
	return null;
}

/**
 * Parse the claims from the judge's text.
 *
 * Takes the first JSON object in the text, even with prose around it.
 * Validates with zod. Returns null on any failure. Never coerces.
 */
export function parseClaims(text: string): ClaimsResult | null {
	const object = firstJsonObject(text);
	if (object === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(object);
	} catch {
		return null;
	}
	const result = claimsSchema.safeParse(parsed);
	if (!result.success) return null;
	return result.data;
}

/** Lowercase and collapse every run of whitespace to one space. */
function normalise(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

const LEADING_PUNCTUATION = /^[\s"'`“”‘’«».,;:!?()[\]{}<>—–-]+/;
const TRAILING_PUNCTUATION = /[\s"'`“”‘’«».,;:!?()[\]{}<>—–-]+$/;

/**
 * Is the quote, word for word, in the source?
 *
 * Caveat: a quote that spans two sources, or a source where the model changed
 * one word, is "not found", so the check is over-strict: a faithful answer
 * can be judged unfaithful by it.
 */
export function quoteFound(quote: string, source: string): boolean {
	const needle = normalise(quote)
		.replace(LEADING_PUNCTUATION, '')
		.replace(TRAILING_PUNCTUATION, '')
		.trim();
	if (needle.length === 0) return false;
	return normalise(source).includes(needle);
}

/**
 * Build the second prompt: one narrow question about one claim and its quote.
 */
export function entailPrompt(claim: string, quote: string): string {
	return [
		'Read this quote alone:',
		quote,
		'',
		'Does the quote state this claim: ' + claim,
		'',
		'Include every number, name, date, and who decided or owns something: if the quote leaves one of them out or says something different, the answer is no.',
		'Reply with yes or no only.',
	].join('\n');
}

/**
 * Parse the entailment answer: yes or no as the first word, else null.
 */
export function parseEntail(text: string): boolean | null {
	const match = text.match(/^\s*(yes|no)\b/i);
	if (!match) return null;
	return match[1].toLowerCase() === 'yes';
}

/**
 * Judge the answer claim by claim.
 *
 * A parse failure is null. An abstention with no claims is faithful.
 * Otherwise the answer is faithful iff every claim has a source in range, its
 * quote is found in that source, and the entailment call says yes (a null
 * entailment counts as unsupported). Relevant and abstained come from the
 * first call.
 */
export async function judgeClaims(
	question: string,
	answer: string,
	sources: string[],
	complete: (prompt: string) => Promise<string>,
): Promise<Verdict | null> {
	const parsed = parseClaims(await complete(claimsPrompt(question, answer, sources)));
	if (parsed === null) return null;

	const { abstained, relevant, claims } = parsed;
	let faithful = true;

	if (!(abstained && claims.length === 0)) {
		for (const claim of claims) {
			if (claim.source < 1 || claim.source > sources.length) {
				faithful = false;
				break;
			}
			if (!quoteFound(claim.quote, sources[claim.source - 1])) {
				faithful = false;
				break;
			}
			const entailed = parseEntail(await complete(entailPrompt(claim.claim, claim.quote)));
			if (entailed !== true) {
				faithful = false;
				break;
			}
		}
	}

	return { faithful, relevant, abstained };
}
