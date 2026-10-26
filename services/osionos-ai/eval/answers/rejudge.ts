/* ************************************************************************** */
/*                                                                            */
/*   rejudge.ts                    re-judge the stored label answers          */
/*                                                                            */
/*   Reads LABELS_FILE, re-judges each row's answer and sources with the       */
/*   judge named by JUDGE (whole = judge.ts, claims = claimJudge.ts), and       */
/*   writes the same rows with the new judge field to argv[2]. It never        */
/*   writes either label file.                                                 */
/*                                                                            */
/*   Environment:                                                             */
/*     LABELS_FILE          labels.jsonl (default, calibration) or             */
/*                          heldout.jsonl, or fresh7b-labels.jsonl /           */
/*                          fresh7b-heldout.jsonl (the confirmation set)       */
/*     JUDGE                whole | claims                                     */
/*     CLAIM_QUOTE_RATIO    how much of a claim's quote must appear in its     */
/*                          source, in (0, 1]; default 1 (exact quote)         */
/*     CLAIM_ABSTAIN_RULE   0 (default) or 1: treat a short not-in-sources     */
/*                          answer as an abstention, whatever claims it lists   */
/*     CLAIM_SOURCE_FALLBACK 0 (default) or 1: ask whether the source supports */
/*                          a claim whose quote check fails                    */
/*     CLAIM_ANY_SOURCE     0 (default) or 1: a claim is faithful if any of    */
/*                          its listed sources passes                          */
/*     CLAIM_LENIENT_WORDING 0 (default) or 1: tolerant wording in prompts     */
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
import { judgeClaimsTraced } from './claimJudge.ts';
import type { Verdict } from './judge.ts';
import type { ClaimTrace } from './claimJudge.ts';
import type { LabelRow } from './labels.ts';

interface QuestionRow {
	id: string;
	ref?: string;
	q?: string;
}

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANSWERS_DIR = EVAL_DIR; // this file is in eval/answers/
// fresh7b-*: the same questions answered by Qwen2.5-Coder-7B, the set the frozen claim judge was confirmed on.
const LABEL_FILES = ['labels.jsonl', 'heldout.jsonl', 'fresh7b-labels.jsonl', 'fresh7b-heldout.jsonl'];
const labelsFile = process.env.LABELS_FILE ?? 'labels.jsonl';
if (!LABEL_FILES.includes(labelsFile)) {
	console.error(`[rejudge] LABELS_FILE must be one of ${LABEL_FILES.join(', ')}, not "${labelsFile}"`);
	process.exit(2);
}
const LABELS_PATH = path.join(ANSWERS_DIR, labelsFile);

const llmUrl = process.env.OSIONOS_AI_LLM_URL ?? '';
const llmModel = process.env.OSIONOS_AI_LLM_MODEL ?? 'qwen3-4b';
const judgeName = process.env.JUDGE ?? 'whole';
const quoteRatio = Number(process.env.CLAIM_QUOTE_RATIO ?? '1');

function readFlag(name: string): boolean {
	const raw = process.env[name] ?? '0';
	if (raw !== '0' && raw !== '1') {
		console.error(`[rejudge] ${name} must be 0 or 1, not "${raw}"`);
		process.exit(2);
	}
	return raw === '1';
}

const abstainRule = readFlag('CLAIM_ABSTAIN_RULE');
const sourceFallback = readFlag('CLAIM_SOURCE_FALLBACK');
const anySource = readFlag('CLAIM_ANY_SOURCE');
const lenientWording = readFlag('CLAIM_LENIENT_WORDING');

if (llmUrl.length === 0) {
	console.error('[rejudge] refusing to start: OSIONOS_AI_LLM_URL is needed');
	process.exit(2);
}
if (judgeName !== 'whole' && judgeName !== 'claims') {
	console.error(`[rejudge] JUDGE must be whole or claims, not "${judgeName}"`);
	process.exit(2);
}
if (!Number.isFinite(quoteRatio) || quoteRatio <= 0 || quoteRatio > 1) {
	console.error(
		`[rejudge] CLAIM_QUOTE_RATIO must be a number in (0, 1], not "${process.env.CLAIM_QUOTE_RATIO ?? ''}"`,
	);
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
	if (LABEL_FILES.some((name) => path.resolve(outPath) === path.join(ANSWERS_DIR, name))) {
		console.error('[rejudge] refusing to write a label file');
		process.exit(2);
	}

	const labels = readLabels();
	const questions = loadQuestions();
	const rows: string[] = [];
	const traceRows: string[] = [];

	for (const row of labels) {
		let verdict: Verdict | null = null;
		let claims: ClaimTrace[] = [];
		if (row.answer !== null && row.sources !== null) {
			const question = questions.get(row.id);
			if (question === undefined) throw new Error(`no question for ${row.id}`);
			if (judgeName === 'claims') {
				const traced = await judgeClaimsTraced(question, row.answer, row.sources, callLlm, {
					quoteRatio,
					abstainRule,
					sourceFallback,
					anySource,
					lenientWording,
				});
				verdict = traced?.verdict ?? null;
				claims = traced?.claims ?? [];
			} else {
				verdict = await judge(question, row.answer, row.sources, callLlm);
			}
		}
		rows.push(JSON.stringify({ ...row, judge: verdict }));
		if (judgeName === 'claims') {
			traceRows.push(JSON.stringify({ id: row.id, faithful: verdict?.faithful ?? null, claims }));
		}
		console.log(`[rejudge] ${row.id} ${verdict ? (verdict.faithful ? 'faithful' : 'unfaithful') : 'null'}`);
	}

	writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');
	console.log(`[rejudge] wrote ${rows.length} rows to ${outPath}`);
	if (judgeName === 'claims') {
		const tracePath = `${outPath}.trace.jsonl`;
		writeFileSync(tracePath, traceRows.join('\n') + '\n', 'utf8');
		console.log(`[rejudge] wrote ${traceRows.length} trace rows to ${tracePath}`);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
