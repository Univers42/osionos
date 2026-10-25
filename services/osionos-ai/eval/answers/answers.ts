/* ************************************************************************** */
/*                                                                            */
/*   answers.ts                    the answer evaluation runner                */
/*                                                                            */
/*   Runs the full answer evaluation: retrieval, answering, judging.           */
/*   Writes RESULTS.md and fills labels.jsonl.                                */
/*                                                                            */
/*   Environment:                                                             */
/*     OSIONOS_AI_DATABASE_URL  the database of the stack                      */
/*     OSIONOS_AI_EMBED_URL     the embedding service (the local TEI)         */
/*     OSIONOS_AI_EMBED_MODEL   the model the service loads                    */
/*     OSIONOS_AI_LLM_URL       the local llama.cpp server                     */
/*     OSIONOS_AI_LLM_MODEL     the model that server loads                    */
/*     ANSWER_JUDGE             whole (default) or claims                      */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                        */
/* ************************************************************************** */

import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Embedder } from '../../src/indexer/embedder.ts';
import { retrieve } from '../../src/retrieval/search.ts';
import { sourceBlock, quotedData, SOURCE_INSTRUCTION, ABSTAIN_INSTRUCTION } from '../../src/runs/sources.ts';
import { SYSTEM_PROMPT } from '../../src/runs/prompt.ts';
import { startStack } from '../../eval/stack.ts';
import { readGolden } from '../../eval/lib.mjs';
import { readCorpus } from '../../eval/lib.mjs';
import { judge } from './judge.ts';
import { judgeClaims } from './claimJudge.ts';
import { score, scoreByOrigin } from './score.ts';
import type { LabeledAnswer } from './score.ts';
import { fillLabelFile } from './labels.ts';

interface GoldenQuestion {
	id: string;
	q: string;
	lang: string;
	kind: string;
	asker: string;
	expected: string[];
}

interface LabelData {
	id: string;
	answer: string;
	sources: string[];
	judge: { faithful: boolean; relevant: number; abstained: boolean } | null;
}

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANSWERS_DIR = EVAL_DIR; // this file is in eval/answers/

const databaseUrl = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const embedUrl = process.env.OSIONOS_AI_EMBED_URL ?? '';
const embedModel = process.env.OSIONOS_AI_EMBED_MODEL ?? 'intfloat/multilingual-e5-small';
const llmUrl = process.env.OSIONOS_AI_LLM_URL ?? '';
const llmModel = process.env.OSIONOS_AI_LLM_MODEL ?? 'qwen3-4b';
const judgeMode = process.env.ANSWER_JUDGE ?? 'whole';
if (judgeMode !== 'whole' && judgeMode !== 'claims') {
	console.error(`[answers] refusing to start: ANSWER_JUDGE is "${judgeMode}", expected whole or claims`);
	process.exit(2);
}
const runJudge = judgeMode === 'claims' ? judgeClaims : judge;

if (databaseUrl.length === 0 || embedUrl.length === 0) {
	console.error('[answers] refusing to start: OSIONOS_AI_DATABASE_URL and OSIONOS_AI_EMBED_URL are needed');
	process.exit(2);
}

// Load questions
function loadQuestions() {
	const golden = readGolden() as GoldenQuestion[];
	const goldenMap = new Map(golden.map((q) => [q.id, q]));
	const raw = readFileSync(path.join(ANSWERS_DIR, 'questions.jsonl'), 'utf8');
	const lines = raw.split(/\r?\n/).filter((l) => l.trim());
	return lines.map((line) => {
		const parsed = JSON.parse(line);
		if (parsed.ref === 'golden') {
			const g = goldenMap.get(parsed.id);
			if (!g) throw new Error(`Golden question ${parsed.id} not found`);
			return {
				id: parsed.id,
				q: g.q,
				lang: g.lang,
				kind: g.kind,
				asker: g.asker,
				expected: g.expected,
				// An acl question with expected pages is asked by someone who can read them.
				answerable: g.expected.length > 0,
				origin: 'human',
			};
		}
		return {
			id: parsed.id,
			q: parsed.q,
			lang: parsed.lang,
			kind: parsed.kind,
			asker: parsed.asker,
			expected: parsed.expected,
			answerable: parsed.answerable,
			origin: parsed.origin ?? 'llm-drafted',
		};
	});
}

async function callLlm(prompt: string): Promise<string> {
	const response = await fetch(`${llmUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: llmModel,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0,
			max_tokens: 400,
		}),
	});
	const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
	return payload.choices?.[0]?.message?.content ?? '';
}

async function main() {
	const questions = loadQuestions();
	const { stack, index } = await startStack({
		databaseUrl,
		embedUrl,
		embedModel,
		indexTimeoutMs: 600_000,
		skipAclFilter: false,
	});

	const embedder = new Embedder({ baseUrl: embedUrl, model: embedModel });

	const labeledAnswers: LabeledAnswer[] = [];
	const labelsData: LabelData[] = [];

	for (const question of questions) {
		const asker = stack.authUser(question.asker);
		const workspaces = stack.workspaces.get(question.asker) ?? [];
		const retrievalUser = stack.retrievalUser(question);

		// Retrieve
		const chunks = await retrieve(stack.db, retrievalUser, { query: question.q, limit: 5 });

		// Build sources
		const sources = chunks.map((c) => c.snippet);
		const sourceBlocks = chunks.map((c, i) => sourceBlock(c, i + 1));

		// Build prompt
		const abstained = chunks.length === 0;
		const userTurn = [
			...sourceBlocks,
			abstained ? ABSTAIN_INSTRUCTION : SOURCE_INSTRUCTION,
			question.q,
		].join('\n\n');

		const prompt = `${SYSTEM_PROMPT}\n\n${userTurn}`;

		// Answer
		const answer = await callLlm(prompt);

		// Judge
		const verdict = await runJudge(question.q, answer, sources, callLlm);

		labeledAnswers.push({
			questionId: question.id,
			answerable: question.answerable,
			origin: question.origin,
			verdict: verdict ? { faithful: verdict.faithful, relevant: verdict.relevant, abstained: verdict.abstained } : null,
		});

		// Update labels for the 30 selected
		labelsData.push({ id: question.id, answer, sources, judge: verdict });

		console.log(`[answers] ${question.id} done`);
	}

	// Compute scores
	const overall = score(labeledAnswers);
	const byOrigin = scoreByOrigin(labeledAnswers);

	// Write RESULTS.md
	const lines = [
		'# Answer evaluation results',
		'',
		`Overall: faithfulness=${overall.faithfulnessRate.toFixed(3)}, relevance=${overall.meanRelevance.toFixed(3)}, abstention_precision=${overall.abstentionPrecision.toFixed(3)}, abstention_recall=${overall.abstentionRecall.toFixed(3)}`,
		'',
		'By origin:',
		...byOrigin.map((s) => `- ${s.origin}: n=${s.count}, faithfulness=${s.faithfulnessRate.toFixed(3)}, relevance=${s.meanRelevance.toFixed(3)}, abstention_precision=${s.abstentionPrecision.toFixed(3)}, abstention_recall=${s.abstentionRecall.toFixed(3)}`),
		'',
		'Command: node --experimental-strip-types eval/answers/answers.ts',
		`Judge: ${judgeMode}`,
	];
	writeFileSync(path.join(ANSWERS_DIR, 'RESULTS.md'), lines.join('\n'), 'utf8');

	// Fill labels.jsonl and heldout.jsonl
	fillLabelFile(path.join(ANSWERS_DIR, 'labels.jsonl'), labelsData);
	fillLabelFile(path.join(ANSWERS_DIR, 'heldout.jsonl'), labelsData);

	await stack.db.end();
	console.log('[answers] done');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});