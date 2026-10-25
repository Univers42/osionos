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

/** What lenientWording adds before the yes-or-no line of both check prompts. */
const LENIENT_LINES = [
	'The source may name its subject only in its heading or in an earlier sentence: a claim about that subject is not unsupported just because this sentence leaves the name out.',
	'A number written in digits and the same number written in words are the same number (340,000 = three hundred and forty thousand).',
	'The claim and the source may be in different languages: compare what they mean.',
];

/**
 * Build the second prompt: one narrow question about one claim and its quote.
 */
export function entailPrompt(claim: string, quote: string, lenient = false): string {
	const lines = [
		'Read this quote alone:',
		quote,
		'',
		'Does the quote state this claim: ' + claim,
		'',
		'Include every number, name, date, and who decided or owns something: if the quote leaves one of them out or says something different, the answer is no.',
	];
	if (lenient) lines.push(...LENIENT_LINES);
	lines.push('Reply with yes or no only.');
	return lines.join('\n');
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
 * Build the fallback prompt: one narrow question about one claim and the whole
 * source it cites, for when the model paraphrased instead of quoting.
 *
 * Same wording rules as entailPrompt: every number, name, date, and who
 * decided or owns something must be present and must agree.
 */
export function supportPrompt(claim: string, source: string, lenient = false): string {
	const lines = [
		'Read this source alone:',
		source,
		'',
		'Does the source support this claim: ' + claim,
		'',
		'Include every number, name, date, and who decided or owns something: if the source leaves one of them out or says something different, the answer is no.',
	];
	if (lenient) lines.push(...LENIENT_LINES);
	lines.push('Reply with yes or no only.');
	return lines.join('\n');
}

/** The languages and phrasings abstainRule recognises, and nothing else. */
const NOT_IN_SOURCES: RegExp[] = [
	/not found in (your|the) workspace/i,
	/not (specified|mentioned|provided|given|stated|found|available) in the (provided |given )?(sources|documents|context|workspace)/i,
	/the sources do not (say|mention|specify|contain)/i,
	/n['’]est pas (précisé|mentionné|indiqué)/i,
	/ne (précisent|mentionnent|contiennent) pas/i,
	/pas trouvé dans votre espace/i,
	/no se (especifica|menciona|indica)/i,
	/no (aparece|figura) en las fuentes/i,
];

/** How many sentences the text has: a run of .!? followed by a space or the end. */
function sentenceCount(text: string): number {
	return (text.match(/[.!?]+(?=\s|$)/g) ?? []).length;
}

/**
 * Does the answer say, in so many words, that the information was not in the
 * sources it was given?
 *
 * Only a short answer counts: a trailing citation such as `[n]` or `[1]` is
 * stripped first, and the rest must be at most two sentences.
 *
 * Caveat: it covers only the phrasings and languages in NOT_IN_SOURCES, so an
 * abstention worded otherwise is still judged claim by claim. A short answer
 * that states a fact and then says one detail is missing counts as an
 * abstention, and that stated fact is then never checked.
 */
export function saysNotInSources(answer: string): boolean {
	const withoutCitation = answer.replace(/\s*\[[^\]]*\]\s*[.!?]?\s*$/, '').trim();
	if (withoutCitation.length === 0) return false;
	if (sentenceCount(withoutCitation) > 2) return false;
	return NOT_IN_SOURCES.some((pattern) => pattern.test(withoutCitation));
}

/** The punctuation stripped before quoteNear compares word tokens. */
const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;

/** Lowercase, strip punctuation, collapse whitespace, and split on spaces. */
function wordTokens(text: string): string[] {
	return normalise(text)
		.replace(PUNCTUATION, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter((token) => token.length > 0);
}

/**
 * Is the quote close enough to a run of the source?
 *
 * Both texts are lowercased, punctuation-stripped and split into word tokens.
 * A window of ceil(quoteTokens * 1.5) source tokens passes when at least
 * `ratio` of the quote's tokens appear in it (counted as a multiset) and every
 * quote token containing a digit appears exactly.
 *
 * Caveat: word order is ignored inside the window, so a quote that swaps who
 * did what can still pass; the entailment step is the only guard against that.
 * A number written in words is not protected by rule (b).
 */
export function quoteNear(quote: string, source: string, ratio: number): boolean {
	const quoteTokens = wordTokens(quote);
	if (quoteTokens.length === 0) return false;
	const sourceTokens = wordTokens(source);
	if (sourceTokens.length === 0) return false;

	const quoteCounts = new Map<string, number>();
	for (const token of quoteTokens) {
		quoteCounts.set(token, (quoteCounts.get(token) ?? 0) + 1);
	}
	const digitTokens = [...quoteCounts.entries()].filter(([token]) => /\d/.test(token));
	const needed = ratio * quoteTokens.length;
	const windowSize = Math.min(Math.ceil(quoteTokens.length * 1.5), sourceTokens.length);

	for (let start = 0; start + windowSize <= sourceTokens.length; start++) {
		const windowCounts = new Map<string, number>();
		for (let index = start; index < start + windowSize; index++) {
			const token = sourceTokens[index];
			windowCounts.set(token, (windowCounts.get(token) ?? 0) + 1);
		}

		let matched = 0;
		for (const [token, count] of quoteCounts) {
			matched += Math.min(count, windowCounts.get(token) ?? 0);
		}
		if (matched < needed) continue;

		let numbersExact = true;
		for (const [token, count] of digitTokens) {
			if ((windowCounts.get(token) ?? 0) < count) {
				numbersExact = false;
				break;
			}
		}
		if (numbersExact) return true;
	}

	return false;
}

/**
 * Caveat: two different claims with the same wording after normalisation are
 * treated as one, so the weaker one can hide behind the other; and a claim
 * reworded between its two entries is not grouped, so `anySource` does not
 * help it.
 */
export function claimKey(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

/** One claim as the judge checked it: what ran and what it found. */
export interface ClaimTrace {
	claim: string;
	source: number;
	quote: string;
	inRange: boolean;
	quoteFound: boolean;
	entailed: boolean | null;
	/** The source fallback's answer, or null when the fallback did not run. */
	supported: boolean | null;
}

/** Options for judgeClaimsTraced; every option is off by default. */
export interface ClaimJudgeOptions {
	/** quoteRatio defaults to 1 (exact quote). */
	quoteRatio?: number;
	/** Treat a short not-in-sources answer as an abstention, whatever claims it lists. */
	abstainRule?: boolean;
	/** Ask whether the whole source supports a claim its quote does not carry. */
	sourceFallback?: boolean;
	/** A claim listed with several sources is faithful if any one source passes. */
	anySource?: boolean;
	/** Wording-tolerant prompts: names in headings, digits vs words, cross-language. */
	lenientWording?: boolean;
}

/**
 * Judge the answer claim by claim, and trace every claim.
 *
 * A parse failure is null. An abstention with no claims is faithful.
 * Otherwise the answer is faithful iff every claim has a source in range, its
 * quote is found in that source, and the entailment call says yes (a null
 * entailment counts as unsupported). Relevant and abstained come from the
 * first call.
 *
 * With abstainRule, a short not-in-sources answer is an abstention too, and an
 * abstention skips the claim checks whatever claims it lists. With
 * sourceFallback, a claim in range whose quote check fails (the quote is not
 * found, or it is found but does not entail the claim) is decided by
 * supportPrompt over the whole cited source instead of failing at once: a claim
 * often joins two sentences of one source and quotes only one of them.
 * With anySource, claims whose claim text is equal after normalisation form one
 * group, and the answer is faithful if every group has at least one entry that
 * passes the per-claim rule. With lenientWording, entailPrompt and supportPrompt
 * add three wording-tolerance lines before their yes-or-no line.
 *
 * It visits every claim rather than stopping at the first failure, so the
 * trace is complete; the entailment call runs only for a claim in range whose
 * quote was found. A failing answer can therefore cost more calls than before,
 * never a different verdict.
 */
export async function judgeClaimsTraced(
	question: string,
	answer: string,
	sources: string[],
	complete: (prompt: string) => Promise<string>,
	options?: ClaimJudgeOptions,
): Promise<{ verdict: Verdict; claims: ClaimTrace[] } | null> {
	const parsed = parseClaims(await complete(claimsPrompt(question, answer, sources)));
	if (parsed === null) return null;

	const ratio = options?.quoteRatio ?? 1;
	const abstainRule = options?.abstainRule === true;
	const sourceFallback = options?.sourceFallback === true;
	const anySource = options?.anySource === true;
	const lenientWording = options?.lenientWording === true;
	const { relevant, claims } = parsed;
	const abstained = parsed.abstained || (abstainRule && saysNotInSources(answer));
	const traces: ClaimTrace[] = [];
	let faithful = true;

	const skipClaims = abstainRule ? abstained : abstained && claims.length === 0;
	if (!skipClaims) {
		const passes: boolean[] = [];
		for (const claim of claims) {
			const inRange = claim.source >= 1 && claim.source <= sources.length;
			const source = inRange ? sources[claim.source - 1] : '';
			const found =
				inRange && (quoteFound(claim.quote, source) || (ratio < 1 && quoteNear(claim.quote, source, ratio)));
			const entailed =
				inRange && found
					? parseEntail(await complete(entailPrompt(claim.claim, claim.quote, lenientWording)))
					: null;
			const quoteHolds = found && entailed === true;
			const supported =
				inRange && !quoteHolds && sourceFallback
					? parseEntail(await complete(supportPrompt(claim.claim, source, lenientWording)))
					: null;

			traces.push({
				claim: claim.claim,
				source: claim.source,
				quote: claim.quote,
				inRange,
				quoteFound: found,
				entailed,
				supported,
			});

			passes.push(inRange && (quoteHolds || supported === true));
		}

		if (anySource) {
			const groupPass = new Map<string, boolean>();
			claims.forEach((claim, index) => {
				const key = claimKey(claim.claim);
				if (!groupPass.has(key)) groupPass.set(key, false);
				if (passes[index]) groupPass.set(key, true);
			});
			faithful = [...groupPass.values()].every((value) => value);
		} else {
			faithful = passes.every((value) => value);
		}
	}

	return { verdict: { faithful, relevant, abstained }, claims: traces };
}

/**
 * Judge the answer claim by claim; the verdict alone, without the trace.
 */
export async function judgeClaims(
	question: string,
	answer: string,
	sources: string[],
	complete: (prompt: string) => Promise<string>,
): Promise<Verdict | null> {
	return (await judgeClaimsTraced(question, answer, sources, complete))?.verdict ?? null;
}
