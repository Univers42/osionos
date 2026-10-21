/* ************************************************************************** */
/*                                                                            */
/*   score.ts                                          the numbers of a run    */
/*                                                                            */
/*   One question, and the groups of questions. The scoring is the same for  */
/*   every variant of the retrieval: the golden set does not change, only    */
/*   the way the chunks are picked.                                         */
/*                                                                            */
/*     - recall@5: the share of the expected pages the answer holds;         */
/*     - MRR@5: the rank of the first expected page;                         */
/*     - the leaks: a page the asker may not read, or an archived one.       */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { canReadPageRowAsMember } from '../../../scripts/bridge-page-read.mjs';
import { USER_IDS, pageId } from './lib.mjs';

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
	/** The milliseconds the retrieval took, the embedding included. */
	latencyMs: number;
	/** The score of the best chunk; null when the answer is empty. */
	topScore: number | null;
	/** The title of the best chunk. */
	topTitle: string | null;
	/** The raw cosine similarity of the best vector hit; null when there is none. */
	topCosine: number | null;
	/** The milliseconds the LLM took to rewrite the question; null when there was none. */
	llmMs: number | null;
}

/** The kinds of the golden set, in the order of the brief. */
export const KINDS = ['lexical', 'paraphrase', 'multi', 'fr', 'xl', 'negative', 'acl'];

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

/**
 * The questions whose expected page the asker may not read.
 *
 * No retrieval can answer them: the page is out of the answer whatever the
 * question is. They are a fixed zero in every bucket they sit in, and the
 * reader of a report has to know about them.
 */
export function blindQuestions(
	results: readonly QuestionResult[],
	pages: Map<string, PageRow>,
	workspaces: Map<string, string[]>,
): { id: string; asker: string; slug: string }[] {
	const blind: { id: string; asker: string; slug: string }[] = [];
	for (const result of results) {
		for (const slug of result.expected) {
			const row = pages.get(pageId(slug).toLowerCase());
			if (!row) continue;
			const userId = (USER_IDS as Record<string, string>)[result.asker];
			if (!userId) continue;
			if (!canReadPageRowAsMember(row, userId, workspaces.get(result.asker) ?? [])) {
				blind.push({ id: result.id, asker: result.asker, slug });
			}
		}
	}
	return blind;
}

/** One chunk of an answer, as the variants return it. */
export interface AnswerChunk {
	pageId: string;
	title: string;
	score: number;
}

/** What a variant answered. */
export interface VariantAnswer {
	chunks: AnswerChunk[];
	latencyMs: number;
	llmMs: number | null;
	topCosine: number | null;
}

/**
 * What one question answered, for one variant.
 *
 * The leak check is here: every page of the answer must be readable by the
 * asker, under the bridge's own rule, and it must not be archived.
 */
export function toResult(
	question: GoldenQuestion,
	answer: VariantAnswer,
	context: {
		pages: Map<string, PageRow>;
		slugByPageId: Map<string, string>;
	},
	askerUserId: string,
	workspaces: readonly string[],
): QuestionResult {
	const returned: string[] = [];
	for (const chunk of answer.chunks) {
		const id = String(chunk.pageId).toLowerCase();
		if (!returned.includes(id)) returned.push(id);
	}
	const leaks: { page: string; reason: string }[] = [];
	for (const id of returned) {
		const row = context.pages.get(id);
		if (!row) {
			leaks.push({ page: context.slugByPageId.get(id) ?? id, reason: 'the page is not in the database' });
			continue;
		}
		if (row.archived_at) {
			leaks.push({ page: context.slugByPageId.get(id) ?? id, reason: 'the page is archived' });
			continue;
		}
		if (!canReadPageRowAsMember(row, askerUserId, workspaces)) {
			leaks.push({ page: context.slugByPageId.get(id) ?? id, reason: 'the asker may not read the page' });
		}
	}
	// The expected pages, and the rank of the first one of them. The rank is
	// the rank of the PAGE in the answer (the answer is a list of pages: a
	// page may take three chunks of the five), so the MRR and the recall read
	// the same list.
	const expectedIds = question.expected.map((slug) => pageId(slug).toLowerCase());
	const found = expectedIds.filter((id) => returned.includes(id));
	const rank = returned.findIndex((id) => expectedIds.includes(id)) + 1;
	return {
		id: question.id,
		kind: question.kind,
		asker: question.asker,
		question: question.q,
		expected: question.expected,
		returned: returned.map((id) => context.slugByPageId.get(id) ?? id),
		chunks: answer.chunks.length,
		recall: expectedIds.length === 0 ? null : found.length / expectedIds.length,
		rank,
		leaks,
		latencyMs: answer.latencyMs,
		topScore: answer.chunks.length > 0 ? Number(answer.chunks[0]?.score ?? 0) : null,
		topTitle: answer.chunks.length > 0 ? String(answer.chunks[0]?.title ?? '') : null,
		topCosine: answer.topCosine,
		llmMs: answer.llmMs,
	};
}
