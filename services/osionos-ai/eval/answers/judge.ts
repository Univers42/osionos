import { z } from 'zod';
import { quotedData, sourceBlock } from '../../src/runs/sources.ts';
import type { RetrievedChunk } from '../../src/retrieval/search.ts';

/**
 * The judge: pure apart from one injected complete(prompt) -> string.
 *
 * It scores an answer for faithfulness (every factual claim supported by
 * the quoted sources), relevance (1-5), and whether the answer abstained.
 */

export interface Verdict {
	faithful: boolean;
	relevant: number;
	abstained: boolean;
}

const verdictSchema = z.object({
	faithful: z.boolean(),
	relevant: z.number().int().min(1).max(5),
	abstained: z.boolean(),
});

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
 * Build the judge prompt.
 *
 * Caveat: one binary faithfulness per answer hides a single unsupported
 * claim inside an otherwise good answer.
 *
 * The sources go in as quoted data, with the same sourceBlock and quotedData
 * as the service.
 */
export function judgePrompt(question: string, answer: string, sources: string[]): string {
	const sourceBlocks = sources.map((source, index) =>
		sourceBlock(toChunk(source, index), index + 1),
	);

	const rubric = [
		'You are a judge evaluating an answer to a question.',
		'',
		'Question: ' + question,
		'',
		'Answer: ' + answer,
		'',
		'Sources:',
		...sourceBlocks,
		'',
		'Evaluate the answer on three dimensions:',
		'1. faithful: true if every factual claim in the answer is supported by at least one quoted source. An abstention ("not found in your workspace") is faithful.',
		'2. relevant: 1-5, how well the answer addresses the question.',
		'3. abstained: true if the answer says the information was not found in the workspace.',
		'',
		'Reply with strict JSON only: {"faithful": true|false, "relevant": 1|2|3|4|5, "abstained": true|false}',
	].join('\n');

	return rubric;
}

/**
 * Parse a verdict from the judge's text.
 *
 * Takes the first JSON object in the text. Validates with zod.
 * Returns null on any failure. Never coerces.
 */
export function parseVerdict(text: string): Verdict | null {
	const match = text.match(/\{[^}]*\}/);
	if (!match) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		return null;
	}
	const result = verdictSchema.safeParse(parsed);
	if (!result.success) return null;
	return result.data as Verdict;
}

/**
 * The judge function: calls complete and parses the result.
 */
export async function judge(
	question: string,
	answer: string,
	sources: string[],
	complete: (prompt: string) => Promise<string>,
): Promise<Verdict | null> {
	const prompt = judgePrompt(question, answer, sources);
	const response = await complete(prompt);
	return parseVerdict(response);
}