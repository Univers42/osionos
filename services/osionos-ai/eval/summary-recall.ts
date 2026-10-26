/* ************************************************************************** */
/*                                                                            */
/*   summary-recall.ts            the quality gate of the summary (C392)      */
/*                                                                            */
/*   For each synthetic thread, the runs are replayed in order with the      */
/*   service's own pieces: the history window (pickHistoryWindow), the        */
/*   summariser's prompt and cleaning (summaryPrompt, cleanSummary), the      */
/*   system prompt and the user turn with its <conversation_summary> block.  */
/*   After every run whose window dropped turns the summary does not cover,  */
/*   the summary is brought up to date, as the service does after `done`.    */
/*   The last question is then asked twice: without the summary (the flag    */
/*   off) and with it. The gate: recall of the early facts improves by at    */
/*   least 0.3 absolute.                                                     */
/*                                                                            */
/*   Caveat: the user turn carries no <account>, <view> or <workspace>       */
/*   block, no tools and no retrieval, so a real run's prompt is longer;     */
/*   recall is a substring match of a normalised key (a codename, the        */
/*   digits of a budget, a surname), so a model that spells a surname        */
/*   differently is scored as forgetting it (under-reporting), and the model */
/*   is the local Qwen3-4B, smaller than the platform's: a larger model is   */
/*   expected to do at least as well, which is not measured here.            */
/*                                                                            */
/*   Node 22, the service's own modules, a llama.cpp server at LLM_URL.      */
/* ************************************************************************** */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { buildUserTurn, conversationSummaryBlock, historyMessages, pickHistoryWindow, SYSTEM_PROMPT } from '../src/runs/prompt.ts';
import { cleanSummary, SUMMARY_OUTPUT_TOKENS, SUMMARY_SYSTEM, summaryPrompt } from '../src/summary/summarize.ts';
import { recalled, thread, type Thread } from './summary-threads.ts';

const THREADS = Number(process.env.AI_EVAL_THREADS ?? 20);
const CONCURRENCY = Number(process.env.AI_EVAL_CONCURRENCY ?? 2);
const GATE_DELTA = 0.3;
const ANSWER_TOKENS = 200;
const LLM_URL = (process.env.LLM_URL ?? '').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL ?? 'local';

/** The system prompt with the flag off: the summary's tag is not named (C389). */
const SYSTEM_FLAG_OFF = SYSTEM_PROMPT.replace(', <workspace> or <conversation_summary> tags', ' or <workspace> tags');
if (SYSTEM_FLAG_OFF === SYSTEM_PROMPT) throw new Error('run with OSIONOS_AI_SUMMARY=on: the flag-on system prompt was expected');

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

const summaryMs: number[] = [];

async function chat(messages: ChatMessage[], maxTokens: number): Promise<string> {
	const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0, seed: 7, max_tokens: maxTokens }),
		signal: AbortSignal.timeout(300_000),
	});
	if (!response.ok) throw new Error(`llm ${response.status}: ${(await response.text()).slice(0, 200)}`);
	const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
	return body.choices?.[0]?.message?.content ?? '';
}

const rowsOf = (messages: Thread['messages']) => messages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.text }] }));
const THROUGH = new Date('2026-10-26T12:00:00Z');

interface ThreadResult {
	index: number;
	without: boolean[];
	with: boolean[];
	/** What the summary still held after each update: one row per update. */
	retention: boolean[][];
	summaryChars: number;
}

async function measure(t: Thread): Promise<ThreadResult> {
	let summary: string | null = null;
	let through = -1;
	const retention: boolean[][] = [];
	// Every run of the thread: the user turns after the first.
	for (let user = 2; user < t.messages.length; user += 2) {
		const window = pickHistoryWindow(rowsOf(t.messages.slice(0, user)));
		if (!window.dropped) continue;
		const oldest = t.messages.findIndex((m) => m.id === window.oldestKeptId);
		const behind = t.messages.slice(through + 1, oldest);
		if (behind.length === 0) continue;
		const started = performance.now();
		const text = await chat(
			[{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: summaryPrompt(summary, behind) }],
			SUMMARY_OUTPUT_TOKENS,
		);
		summaryMs.push(performance.now() - started);
		const cleaned = cleanSummary(text);
		if (cleaned) {
			summary = cleaned;
			through = oldest - 1;
		}
		retention.push(recalled(summary ?? '', t.facts));
	}

	const final = pickHistoryWindow(rowsOf(t.messages));
	const windowText = final.messages.map((m) => m.text).join('\n');
	if (recalled(windowText, t.facts).some(Boolean)) throw new Error(`thread ${t.index}: a fact is still in the window, the thread measures nothing`);
	const oldest = t.messages.findIndex((m) => m.id === final.oldestKeptId);
	const history = historyMessages(final.messages) as ChatMessage[];
	const usable = summary !== null && through < oldest;

	const without = await chat([{ role: 'system', content: SYSTEM_FLAG_OFF }, ...history, { role: 'user', content: t.question }], ANSWER_TOKENS);
	const withTurn = usable ? buildUserTurn(t.question, [], [], [], false, { summary: conversationSummaryBlock(summary as string, THROUGH) }) : t.question;
	const withSummary = await chat([{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: withTurn }], ANSWER_TOKENS);
	if (process.env.AI_EVAL_DEBUG) console.log(JSON.stringify({ thread: t.index, summary, without, withSummary }));
	return { index: t.index, without: recalled(without, t.facts), with: recalled(withSummary, t.facts), retention, summaryChars: summary?.length ?? 0 };
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: size }, async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await work(items[index]);
				console.log(`[summary-eval] thread ${index + 1}/${items.length} done`);
			}
		}),
	);
	return results;
}

const share = (rows: boolean[][]) => {
	const all = rows.flat();
	return all.length === 0 ? 0 : all.filter(Boolean).length / all.length;
};
const byKind = (rows: boolean[][], kind: number) => share(rows.map((row) => [row[kind]]));
const fixed = (value: number) => value.toFixed(3);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const started = performance.now();
const results = await pool(Array.from({ length: THREADS }, (_, i) => thread(i)), CONCURRENCY, measure);
const without = share(results.map((r) => r.without));
const withSummary = share(results.map((r) => r.with));
const delta = withSummary - without;
const pass = delta >= GATE_DELTA;
const updates = Math.max(...results.map((r) => r.retention.length));
const retentionRows = Array.from({ length: updates }, (_, step) => {
	const rows = results.flatMap((r) => (r.retention[step] ? [r.retention[step]] : []));
	return `| ${step + 1} | ${rows.length} | ${fixed(share(rows))} |`;
});
const kinds = ['codename', 'budget', 'contact'];

const report = `# Summary recall — context C392

The quality gate of the conversation summary before any public flag: ${THREADS} synthetic threads state three
facts in their first turn, talk long enough that the history window drops it, then ask for the facts.

- Date: ${process.env.AI_EVAL_DATE ?? new Date().toISOString()}
- Commit: ${process.env.AI_EVAL_COMMIT ?? 'unknown'}
- Command: \`${process.env.AI_EVAL_COMMAND ?? 'sh services/osionos-ai/eval/summary-recall.sh'}\`
- Model: ${process.env.AI_EVAL_MODEL_FILE ?? LLM_MODEL} (sha256 ${process.env.AI_EVAL_MODEL_SHA ?? 'unknown'}), llama.cpp ${process.env.AI_EVAL_LLM_BACKEND ?? 'vulkan'}, temperature 0
- Wall time: ${Math.round((performance.now() - started) / 1000)} s; summary call p50 ${Math.round(median(summaryMs))} ms over ${summaryMs.length} calls

## Result

| | Recall of the early facts |
| --- | --- |
| Without the summary (flag off) | ${fixed(without)} |
| With the summary | ${fixed(withSummary)} |
| **Improvement** | **${fixed(delta)}** (gate ≥ ${GATE_DELTA}: **${pass ? 'PASS' : 'FAIL'}**) |

| Fact | Without | With |
| --- | --- | --- |
${kinds.map((kind, i) => `| ${kind} | ${fixed(byKind(results.map((r) => r.without), i))} | ${fixed(byKind(results.map((r) => r.with), i))} |`).join('\n')}

## What the rolling summary keeps

Each run whose window dropped new turns rewrites the summary from the previous one and those turns. The share of
the three facts still in the summary after each rewrite:

| Rewrite | Threads | Facts kept |
| --- | --- | --- |
${retentionRows.join('\n')}

Mean summary length: ${Math.round(results.reduce((sum, r) => sum + r.summaryChars, 0) / results.length)} characters.

## Caveat

The user turn carries no account, view or workspace block, no tools and no retrieval, so a real prompt is longer.
Recall is a substring match of a normalised key (the codename, the digits of the budget, the surname): a model that
spells a surname differently is counted as forgetting it, so the numbers under-report rather than over-report. The
model is the local Qwen3-4B Q4_K_M, smaller than the platform's models.
`;

const here = path.dirname(fileURLToPath(import.meta.url));
writeFileSync(path.join(here, process.env.AI_EVAL_RESULTS_FILE ?? 'RESULTS-summary.md'), report);
console.log(`[summary-eval] without ${fixed(without)} with ${fixed(withSummary)} delta ${fixed(delta)} ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
