/* ************************************************************************** */
/*                                                                            */
/*   rejudge.ts                    re-judge the stored label answers          */
/*                                                                            */
/*   Reads labels.jsonl, re-judges each row's answer and sources with the       */
/*   judge named by JUDGE (whole = judge.ts, claims = claimJudge.ts), and       */
/*   writes the same rows with the new judge field to argv[2]. It never        */
/*   writes labels.jsonl.                                                      */
/*                                                                            */
/*   Environment:                                                             */
/*     JUDGE                whole | claims                                     */
/*     OSIONOS_AI_LLM_URL   the local llama.cpp server                         */
/*     OSIONOS_AI_LLM_MODEL the model that server loads                        */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                        */
/* ************************************************************************** */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGolden } from '../../eval/lib.mjs';
import { judge } from './judge.ts';
import { judgeClaims } from './claimJudge.ts';
import type { Verdict } from './judge.ts';
import type { LabelRow } from './labels.ts';

interface QuestionRow {
	id: string;
	ref?: string;
	q?: string;
}

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANSWERS_DIR = EVAL_DIR; // this file is in eval/answers/
const LABELS_PATH = path.join(ANSWERS_DIR, 'labels.jsonl');

const llmUrl = process.env.OSIONOS_AI_LLM_URL ?? '';
const llmModel = process.env.OSIONOS_AI_LLM_MODEL ?? 'qwen3-4b';
const judgeName = process.env.JUDGE ?? 'whole';

if (llmUrl.length === 0) {
	console.error('[rejudge] refusing to start: OSIONOS_AI_LLM_URL is needed');
	process.exit(2);
}
if (judgeName !== 'whole' && judgeName !== 'claims') {
	console.error(`[rejudge] JUDGE must be whole or claims, not "${judgeName}"`);
	process.exit(2);
}

function readLabels(): LabelRow[] {
	const raw = readFileSync(LABELS_PATH, 'utf8');
	return raw
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as LabelRow);
}

/** The question of each row: questions.jsonl, with golden ids from golden.jsonl. */
function loadQuestions(): Map<string, string> {
	const golden = readGolden() as { id: string; q: string }[];
	const goldenMap = new Map(golden.map((question) => [question.id, question.q]));
	const raw = readFileSync(path.join(ANSWERS_DIR, 'questions.jsonl'), 'utf8');
	const lines = raw.split(/\r?\n/).filter((line) => line.trim());
	const questions = new Map<string, string>();
	for (const line of lines) {
		const parsed = JSON.parse(line) as QuestionRow;
		const text = parsed.ref === 'golden' ? goldenMap.get(parsed.id) : parsed.q;
		if (text === undefined) throw new Error(`no question text for ${parsed.id}`);
		questions.set(parsed.id, text);
	}
	return questions;
}

async function callLlm(prompt: string): Promise<string> {
	const response = await fetch(`${llmUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: llmModel,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0,
			max_tokens: 600,
		}),
	});
	const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
	return payload.choices?.[0]?.message?.content ?? '';
}

async function main() {
	const outPath = process.argv[2];
	if (!outPath) {
		console.error('usage: node eval/answers/rejudge.ts <out.jsonl>');
		process.exit(2);
	}
	if (path.resolve(outPath) === path.resolve(LABELS_PATH)) {
		console.error('[rejudge] refusing to write labels.jsonl');
		process.exit(2);
	}

	const runner = judgeName === 'claims' ? judgeClaims : judge;
	const labels = readLabels();
	const questions = loadQuestions();
	const rows: string[] = [];

	for (const row of labels) {
		let verdict: Verdict | null = null;
		if (row.answer !== null && row.sources !== null) {
			const question = questions.get(row.id);
			if (question === undefined) throw new Error(`no question for ${row.id}`);
			verdict = await runner(question, row.answer, row.sources, callLlm);
		}
		rows.push(JSON.stringify({ ...row, judge: verdict }));
		console.log(`[rejudge] ${row.id} ${verdict ? (verdict.faithful ? 'faithful' : 'unfaithful') : 'null'}`);
	}

	writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
	console.log(`[rejudge] wrote ${rows.length} rows to ${outPath}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
