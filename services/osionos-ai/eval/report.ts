/* ************************************************************************** */
/*                                                                            */
/*   report.ts                                 the markdown of the results     */
/*                                                                            */
/*   The report of one run: the index, the table of the groups, the leaks,   */
/*   the latency, the negative questions, and the worst misses. It reads     */
/*   the numbers; it never computes them and it never edits them.            */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import type { Group, QuestionResult } from './score.ts';
import { groupTable } from './score.ts';

/** What the report needs to know about a run. */
export interface ReportInput {
	results: QuestionResult[];
	groups: { label: string; group: Group }[];
	overall: Group;
	leaks: number;
	latency: { p50: number; p95: number };
	index: { ms: number; workMs: number; pages: number; chunks: number; embedded: number; withVector: number; bytes: number };
	mode: string;
	/** The title of a corpus page, by its slug. */
	titleBySlug: Map<string, string>;
	/** The model the embedder loads. */
	embedModel: string;
	/** The questions whose expected page the asker may not read. */
	blind: { id: string; asker: string; slug: string }[];
}

/** The size of the index, in the unit that reads well. */
function size(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** The results of one run, as the markdown of the report. */
export function report(input: ReportInput): string {
	const { results, groups, overall, leaks, latency, index, mode, titleBySlug, embedModel, blind } = input;
	const negatives = results.filter((result) => result.kind === 'negative');
	// The top score of the negatives, and the lowest top score of a question
	// that found its page: the two are what a threshold would have to tell
	// apart.
	const negativeScores = negatives
		.map((result) => result.topScore)
		.filter((score): score is number => score !== null);
	const negativeTop = negativeScores.length > 0 ? Math.max(...negativeScores) : null;
	const answered = results.filter((result) => result.recall !== null && result.recall > 0 && result.topScore !== null);
	const answeredLow =
		answered.length > 0
			? answered.reduce((lowest, result) =>
					(result.topScore ?? 0) < (lowest.topScore ?? 0) ? result : lowest,
				)
			: null;
	const misses = results
		.filter((result) => result.recall !== null && result.recall < 1)
		.sort((left, right) => (left.recall ?? 0) - (right.recall ?? 0) || right.rank - left.rank);
	const worst = misses.slice(0, 5);
	const leakLines = results.flatMap((result) =>
		result.leaks.map((leak) => `- ${result.id} (${result.asker}): ${leak.page} — ${leak.reason}`),
	);

	const lines: string[] = [];
	lines.push('# The golden set, measured — hybrid retrieval with the real embedder');
	lines.push('');
	lines.push(`- Date: ${process.env.AI_EVAL_DATE ?? new Date().toISOString()}`);
	lines.push(`- Commit: \`${process.env.AI_EVAL_COMMIT ?? 'unknown'}\``);
	lines.push(`- Command: \`${process.env.AI_EVAL_COMMAND ?? 'unknown'}\``);
	lines.push(
		`- Images: \`${process.env.AI_EVAL_DB_IMAGE ?? 'pgvector/pgvector:0.8.0-pg16'}\`, ` +
			`\`${process.env.AI_EVAL_TEI_IMAGE ?? 'ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4'}\` ` +
			`(model \`${embedModel}\`), \`${process.env.AI_EVAL_NODE_IMAGE ?? 'node:22-bookworm-slim'}\``,
	);
	lines.push(`- Mode: ${mode}`);
	lines.push('');
	lines.push('## The index');
	lines.push('');
	lines.push(`- Pages indexed: ${index.pages} (the two archived pages are dropped by the indexer)`);
	lines.push(`- Chunks in the index: ${index.chunks}, of which ${index.withVector} carry a vector`);
	lines.push(
		`- Indexing time: ${(index.ms / 1000).toFixed(1)} s (the indexer's own 10 s debounce included; ` +
			`${(index.workMs / 1000).toFixed(1)} s of page work)`,
	);
	lines.push(
		`- The index in the database: ${size(index.bytes)}; ` +
			`${index.workMs > 0 ? (index.chunks / (index.workMs / 1000)).toFixed(1) : '—'} chunks embedded per second`,
	);
	lines.push('');
	lines.push('## The results');
	lines.push('');
	lines.push('`scored` is the number of questions with a non-empty `expected`: the negative and the refused acl');
	lines.push('questions have none, and they are counted in `n` only.');
	lines.push('');
	lines.push(groupTable(groups));
	lines.push('');
	lines.push(
		`- Overall: n=${overall.n}, scored=${overall.scored}, recall@5=${overall.recall.toFixed(2)}, MRR@5=${overall.mrr.toFixed(3)}`,
	);
	lines.push(`- Leaks: ${leaks}${leaks === 0 ? ' (none)' : ''}`);
	if (blind.length > 0) {
		lines.push(
			`- Questions no retrieval can answer (the asker may not read the page): ${blind
				.map((entry) => `${entry.id} (${entry.asker} → ${entry.slug})`)
				.join(', ')}`,
		);
	}
	lines.push(
		`- Latency of retrieve(): p50 ${latency.p50.toFixed(0)} ms, p95 ${latency.p95.toFixed(0)} ms (the embedding included)`,
	);
	lines.push('');
	lines.push('## The negative questions');
	lines.push('');
	lines.push('The top fused score of a question nothing answers. A threshold that separates them from the');
	lines.push('answered ones would have to sit between the numbers below and the lowest score of an answered');
	lines.push('question; no threshold is added here.');
	lines.push('');
	lines.push('| id | question | top score | top page |');
	lines.push('| --- | --- | --- | --- |');
	for (const negative of negatives) {
		lines.push(
			`| ${negative.id} | ${negative.question} | ${negative.topScore === null ? '—' : negative.topScore.toFixed(5)} | ${negative.topTitle ?? '—'} |`,
		);
	}
	lines.push('');
	if (negativeTop !== null && answeredLow !== null && answeredLow.topScore !== null) {
		lines.push(
			`- The lowest top score of a question that found its page: ${answeredLow.topScore.toFixed(5)} (${answeredLow.id}).`,
		);
		lines.push(
			`- The highest top score of a negative question: ${negativeTop.toFixed(5)}.` +
				(negativeTop < answeredLow.topScore
					? ' A threshold between the two would separate them in THIS run.'
					: ' A threshold between the two would NOT separate them in this run.'),
		);
		lines.push(
			'- Caveat: the fused score is a reciprocal rank, not a magnitude. A chunk that is first in ONE of the',
		);
		lines.push('  two lists scores 1/61 ≈ 0.01639 whatever the question is, so the gap above is a property of');
		lines.push('  this run, not a property of the questions.');
	}
	lines.push('');
	lines.push('## The five worst misses');
	lines.push('');
	if (worst.length === 0) {
		lines.push('None: every question with an expected page found it.');
	} else {
		lines.push('| id | kind | question | expected | returned |');
		lines.push('| --- | --- | --- | --- | --- |');
		for (const miss of worst) {
			const expected = miss.expected.map((slug) => `${slug} (${titleBySlug.get(slug) ?? ''})`).join(', ');
			const returned = miss.returned.map((slug) => `${slug} (${titleBySlug.get(slug) ?? ''})`).join(', ');
			lines.push(`| ${miss.id} | ${miss.kind} | ${miss.question} | ${expected} | ${returned} |`);
		}
	}
	lines.push('');
	if (leakLines.length > 0) {
		lines.push('## The leaks');
		lines.push('');
		lines.push(...leakLines);
		lines.push('');
	}
	lines.push('## The caveat');
	lines.push('');
	lines.push('The corpus is synthetic, written by a model: the recall measured on it is a regression gate, not a');
	lines.push('quality claim about real workspaces. Sixty-eight questions: ±0.07 on recall is noise. The embedder runs');
	lines.push('on the CPU of this machine, shared with the other work that is running.');
	lines.push('');
	return lines.join('\n');
}
