/* ************************************************************************** */
/*                                                                            */
/*   score.ts                                          the numbers of a run    */
/*                                                                            */
/*   One question, and the groups of questions. The scoring is the same for  */
/*   every question of the golden set: the recall is the share of the        */
/*   expected pages the answer holds, and the MRR is the rank of the first    */
/*   of them.                                                                 */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

/** One question of the golden set. */
export interface GoldenQuestion {
	id: string;
	q: string;
	lang: string;
	kind: string;
	asker: string;
	expected: string[];
}

/** One page of the corpus, as the database holds it. */
export interface PageRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
	archived_at: Date | null;
}

/** What one question answered. */
export interface QuestionResult {
	id: string;
	kind: string;
	asker: string;
	question: string;
	expected: string[];
	/** The pages of the answer, in the order of the fusion. */
	returned: string[];
	/** The number of chunks the answer holds (a page may take three of them). */
	chunks: number;
	/** The share of the expected pages the answer holds; null when there is none. */
	recall: number | null;
	/** The rank of the first expected page; zero when there is none. */
	rank: number;
	/** The pages the asker may not read, or that are archived. */
	leaks: { page: string; reason: string }[];
	/** The milliseconds retrieve() took, the embedding included. */
	latencyMs: number;
	/** The score of the best chunk; null when the answer is empty. */
	topScore: number | null;
	/** The title of the best chunk. */
	topTitle: string | null;
}

/** The kinds of the golden set, in the order of the brief. */
export const KINDS = ['lexical', 'paraphrase', 'multi', 'fr', 'negative', 'acl'];

/** The numbers of one group of questions. */
export interface Group {
	n: number;
	scored: number;
	recall: number;
	mrr: number;
}

/** The percentile of a sorted list, nearest rank. */
export function percentile(sorted: readonly number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const rank = Math.max(1, Math.ceil(fraction * sorted.length));
	return sorted[rank - 1] ?? 0;
}

/** A mean, with three decimals. */
export function mean(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sum = values.reduce((total, value) => total + value, 0);
	return sum / values.length;
}

/** A share, with two decimals. */
export function share(value: number): string {
	return value.toFixed(2);
}

/**
 * The numbers of a group: the recall and the MRR of the questions that have
 * an expected page. The negative questions and the refused acl questions have
 * none, and they are counted in n only.
 */
export function group(results: readonly QuestionResult[]): Group {
	const scored = results.filter((result) => result.recall !== null);
	return {
		n: results.length,
		scored: scored.length,
		recall: mean(scored.map((result) => result.recall ?? 0)),
		mrr: mean(scored.map((result) => (result.rank > 0 ? 1 / result.rank : 0))),
	};
}

/** The table of the groups. */
export function groupTable(groups: readonly { label: string; group: Group }[]): string {
	const rows = groups.map(({ label, group: value }) => {
		const recall = value.scored === 0 ? '—' : share(value.recall);
		const mrr = value.scored === 0 ? '—' : value.mrr.toFixed(3);
		return `| ${label} | ${value.n} | ${value.scored} | ${recall} | ${mrr} |`;
	});
	return ['| kind | n | scored | recall@5 | MRR@5 |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}
