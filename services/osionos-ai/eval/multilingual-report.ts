/* ************************************************************************** */
/*                                                                            */
/*   multilingual-report.ts             the comparison of the variants      */
/*                                                                            */
/*   The report of the multilingual experiment: the table of every variant,   */
/*   the gate of the brief, the latency, and the cosine separation of the    */
/*   negative questions. It reads the numbers of the run; it never computes  */
/*   a number of its own.                                                   */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import type { Group, QuestionResult } from './score.ts';
import { groupTable, percentile, share } from './score.ts';
import { VARIANT_NAMES } from './variants.ts';
import type { VariantId } from './variants.ts';

/** What one variant did in the run. */
export interface VariantRun {
	variant: VariantId;
	results: QuestionResult[];
	groups: { label: string; group: Group }[];
	overall: Group;
	leaks: number;
	latency: { p50: number; p95: number };
	latencyWithLlm: { p50: number; p95: number };
}

/** What the report needs to know about the run. */
export interface MultilingualInput {
	runs: VariantRun[];
	/** The milliseconds of every call of the LLM. */
	llm: number[];
	index: { ms: number; workMs: number; pages: number; chunks: number; embedded: number; withVector: number; bytes: number };
	titleBySlug: Map<string, string>;
	embedModel: string;
	/** The questions whose expected page the asker may not read. */
	blind: { id: string; asker: string; slug: string }[];
}

/** The gate of the brief: xl and fr at 0.8, no kind down by more than 0.07, no leak. */
const GATE_RECALL = 0.8;

/** The share a kind may lose against the baseline. */
const GATE_DROP = 0.07;

/** The group of a kind, by its label. */
function groupOf(run: VariantRun, kind: string): Group {
	return run.groups.find((entry) => entry.label === kind)?.group ?? { n: 0, scored: 0, recall: 0, mrr: 0 };
}

/** Does the variant win? */
function wins(run: VariantRun, baseline: VariantRun): { wins: boolean; why: string } {
	if (run.leaks > 0) return { wins: false, why: `${run.leaks} leaks` };
	const xl = groupOf(run, 'xl').recall;
	const fr = groupOf(run, 'fr').recall;
	if (xl < GATE_RECALL) return { wins: false, why: `xl recall ${share(xl)} < ${GATE_RECALL}` };
	if (fr < GATE_RECALL) return { wins: false, why: `fr recall ${share(fr)} < ${GATE_RECALL}` };
	let worst = 0;
	let worstKind = '';
	for (const entry of run.groups) {
		const before = groupOf(baseline, entry.label);
		if (before.scored === 0 || entry.group.scored === 0) continue;
		const drop = before.recall - entry.group.recall;
		if (drop > worst) {
			worst = drop;
			worstKind = entry.label;
		}
	}
	if (worst > GATE_DROP) return { wins: false, why: `${worstKind} drops ${share(worst)} against A` };
	return { wins: true, why: 'xl and fr at 0.8, no kind down by more than 0.07, no leak' };
}

/** The cosine separation of the negative questions (variant A). */
function cosineSection(results: readonly QuestionResult[]): string[] {
	const answered = results.filter((result) => result.recall !== null && result.recall > 0 && result.topCosine !== null);
	const negatives = results.filter((result) => result.kind === 'negative' && result.topCosine !== null);
	if (answered.length === 0 || negatives.length === 0) return ['No cosine was measured.'];
	const lowest = answered.reduce((low, result) => ((result.topCosine ?? 0) < (low.topCosine ?? 0) ? result : low));
	const highest = negatives.reduce((high, result) => ((result.topCosine ?? 0) > (high.topCosine ?? 0) ? result : high));
	const lines: string[] = [];
	lines.push('| id | kind | question | cosine | answered |');
	lines.push('| --- | --- | --- | --- | --- |');
	for (const result of results) {
		if (result.topCosine === null) continue;
		const isNegative = result.kind === 'negative';
		lines.push(
			`| ${result.id} | ${result.kind} | ${result.question} | ${result.topCosine.toFixed(4)} | ${isNegative ? 'no — nothing answers it' : 'yes'} |`,
		);
	}
	lines.push('');
	lines.push(
		`- The lowest cosine of a question that found its page: ${(lowest.topCosine ?? 0).toFixed(4)} (${lowest.id}).`,
	);
	lines.push(`- The highest cosine of a negative question: ${(highest.topCosine ?? 0).toFixed(4)} (${highest.id}).`);
	const separates = (highest.topCosine ?? 0) < (lowest.topCosine ?? 0);
	lines.push(
		separates
			? `- A threshold between ${(highest.topCosine ?? 0).toFixed(4)} and ${(lowest.topCosine ?? 0).toFixed(4)} WOULD separate them in THIS run.`
			: `- A threshold would NOT separate them in this run: a negative question is at least as close to a chunk as an answered one.`,
	);
	lines.push(
		'- Caveat: the cosine is the similarity of the best VECTOR hit, which is not the page the answer holds.',
	);
	lines.push('  The vector side always has a neighbour, even for a question nothing answers.');
	return lines;
}

/** Does the variant pay for the LLM? */
function usesLlm(run: VariantRun): boolean {
	return run.results.some((result) => result.llmMs !== null);
}

/** The size of the index, in the unit that reads well. */
function size(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** The cross-lingual questions, one by one: the rank of the answer, per variant. */
function crossLingualTable(runs: readonly VariantRun[]): string[] {
	const baseline = runs.find((run) => run.variant === 'A') ?? runs[0];
	const ids = [...new Set((baseline?.results ?? []).filter((result) => result.kind === 'xl').map((result) => result.id))];
	const lines: string[] = [];
	lines.push('| id | question | expected | ' + runs.map((run) => run.variant).join(' | ') + ' |');
	lines.push('| --- | --- | --- | ' + runs.map(() => '---').join(' | ') + ' |');
	for (const id of ids) {
		const question = baseline?.results.find((result) => result.id === id);
		const cells = runs.map((run) => {
			const result = run.results.find((entry) => entry.id === id);
			if (!result) return '—';
			if (result.rank === 0) return 'miss';
			return `${result.rank}`;
		});
		lines.push(
			`| ${id} | ${question?.question ?? ''} | ${(question?.expected ?? []).join(', ')} | ${cells.join(' | ')} |`,
		);
	}
	lines.push('');
	lines.push('The cell is the rank of the answer page in the answer of the variant, or `miss`.');
	return lines;
}

/** The comparison of the variants, as the markdown of the report. */
export function multilingualReport(input: MultilingualInput): string {
	const { runs, llm, index, titleBySlug, embedModel, blind } = input;
	const baseline = runs.find((run) => run.variant === 'A') ?? runs[0];
	const lines: string[] = [];

	lines.push('# Cross-lingual retrieval on the golden set — four variants, measured');
	lines.push('');
	lines.push(`- Date: ${process.env.AI_EVAL_DATE ?? new Date().toISOString()}`);
	lines.push(`- Commit: \`${process.env.AI_EVAL_COMMIT ?? 'unknown'}\``);
	lines.push(`- Command: \`${process.env.AI_EVAL_COMMAND ?? 'unknown'}\``);
	lines.push(
		`- Images: \`${process.env.AI_EVAL_DB_IMAGE ?? 'pgvector/pgvector:0.8.0-pg16'}\`, ` +
			`\`${process.env.AI_EVAL_TEI_IMAGE ?? 'ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4'}\` ` +
			`(model \`${embedModel}\`), \`${process.env.AI_EVAL_NODE_IMAGE ?? 'node:22-bookworm-slim'}\``,
	);
	lines.push(`- Variants: ${runs.map((run) => run.variant).join(', ')}`);
	lines.push(
		`- The index: ${index.pages} pages, ${index.chunks} chunks, ${index.withVector} of them with a vector ` +
			`(${(index.ms / 1000).toFixed(1)} s, ${(index.workMs / 1000).toFixed(1)} s of page work), ` +
			`${size(index.bytes)} in the database, ` +
			`${index.workMs > 0 ? (index.chunks / (index.workMs / 1000)).toFixed(1) : '—'} chunks embedded per second`,
	);
	lines.push('');
	lines.push('## The gate');
	lines.push('');
	lines.push('A variant wins when xl recall@5 ≥ 0.8 AND fr recall@5 ≥ 0.8, no other kind drops more than 0.07');
	lines.push('against A, and the leaks are zero.');
	lines.push('');
	lines.push('| variant | xl recall@5 | fr recall@5 | the worst drop against A | leaks | wins |');
	lines.push('| --- | --- | --- | --- | --- | --- |');
	for (const run of runs) {
		const verdict = wins(run, baseline);
		let worst = 0;
		let worstKind = '';
		for (const entry of run.groups) {
			const before = groupOf(baseline, entry.label);
			if (before.scored === 0 || entry.group.scored === 0) continue;
			const drop = before.recall - entry.group.recall;
			if (drop > worst) {
				worst = drop;
				worstKind = entry.label;
			}
		}
		lines.push(
			`| ${run.variant} | ${share(groupOf(run, 'xl').recall)} | ${share(groupOf(run, 'fr').recall)} | ` +
				`${worstKind ? `${worstKind} ${share(worst)}` : '—'} | ${run.leaks} | ${verdict.wins ? 'yes' : `no — ${verdict.why}`} |`,
		);
	}
	lines.push('');
	for (const run of runs) {
		lines.push(`## ${VARIANT_NAMES[run.variant]}`);
		lines.push('');
		lines.push(groupTable(run.groups));
		lines.push('');
		lines.push(
			`- Overall: n=${run.overall.n}, scored=${run.overall.scored}, recall@5=${share(run.overall.recall)}, MRR@5=${run.overall.mrr.toFixed(3)}`,
		);
		lines.push(`- Leaks: ${run.leaks}${run.leaks === 0 ? ' (none)' : ''}`);
		lines.push(
			`- Latency: p50 ${run.latency.p50.toFixed(0)} ms, p95 ${run.latency.p95.toFixed(0)} ms ` +
				`(the LLM excluded)`,
		);
		lines.push(
			usesLlm(run)
				? `- Latency with the LLM: p50 ${run.latencyWithLlm.p50.toFixed(0)} ms, p95 ${run.latencyWithLlm.p95.toFixed(0)} ms`
				: '- Latency with the LLM: — (this variant does not call the LLM)',
		);
		const misses = run.results.filter((result) => result.kind === 'xl' && (result.recall ?? 0) < 1);
		lines.push(
			misses.length === 0
				? '- The cross-lingual questions: all of them found their page.'
				: `- The cross-lingual questions missed: ${misses.map((miss) => miss.id).join(', ')}.`,
		);
		lines.push('');
	}
	lines.push('## The latency');
	lines.push('');
	lines.push('| variant | p50 retrieval | p95 retrieval | p50 with the LLM | p95 with the LLM |');
	lines.push('| --- | --- | --- | --- | --- |');
	for (const run of runs) {
		lines.push(
			`| ${run.variant} | ${run.latency.p50.toFixed(0)} ms | ${run.latency.p95.toFixed(0)} ms | ` +
				`${usesLlm(run) ? `${run.latencyWithLlm.p50.toFixed(0)} ms` : '—'} | ` +
				`${usesLlm(run) ? `${run.latencyWithLlm.p95.toFixed(0)} ms` : '—'} |`,
		);
	}
	lines.push('');
	if (llm.length > 0) {
		const sorted = [...llm].sort((left, right) => left - right);
		lines.push(
			`- The LLM alone: p50 ${percentile(sorted, 0.5).toFixed(0)} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms ` +
				`over ${sorted.length} calls (one per question).`,
		);
	}
	lines.push('');
	lines.push('## The questions no retrieval can answer');
	lines.push('');
	if (blind.length === 0) {
		lines.push('None: every question with an expected page has an asker who may read it.');
	} else {
		lines.push('| id | asker | expected page | why |');
		lines.push('| --- | --- | --- | --- |');
		for (const entry of blind) {
			lines.push(
				`| ${entry.id} | ${entry.asker} | ${entry.slug} (${titleBySlug.get(entry.slug) ?? ''}) | the asker may not read the page |`,
			);
		}
		lines.push('');
		lines.push(
			'These are a fixed zero in every variant, and every number of the `fr` bucket is read with them in it.',
		);
	}
	lines.push('');
	lines.push('## The cross-lingual questions, one by one');
	lines.push('');
	lines.push(...crossLingualTable(runs));
	lines.push('');
	lines.push('## The negative questions — the raw cosine of the best vector hit (variant A)');
	lines.push('');
	lines.push(...cosineSection(baseline?.results ?? []));
	lines.push('');
	lines.push('## The recommendation');
	lines.push('');
	lines.push('(filled in by hand after the run)');
	lines.push('');
	lines.push('## Caveat');
	lines.push('');
	lines.push('The corpus is synthetic, written by a model: the recall measured on it is a regression gate, not');
	lines.push('a quality claim about real workspaces. Sixty-eight questions over forty pages: one question is');
	lines.push('0.07 of the cross-lingual bucket, so ±0.07 on recall is noise. The embedder and the LLM run on the');
	lines.push('CPU of this machine, shared with the other work that is running, and the LLM latency is the');
	lines.push('latency of a 4B model on eight shared cores, not the latency of a hosted one.');
	lines.push('');
	return lines.join('\n');
}
