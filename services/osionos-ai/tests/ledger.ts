import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import type { SseEvent } from './sse.ts';

/**
 * The helpers of the spend: what the ledger holds, what the service logged,
 * and what the upstream was sent.
 *
 * The runs and the completions read the same ledger, so they read it with the
 * same helpers.
 */

/** What a subject spent today, in micro-USD. */
export async function spentOf(db: Pool, subject: string): Promise<number> {
	const result = await db.query(
		'select spent_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
		[subject],
	);
	return Number(result.rows[0]?.spent_microusd ?? 0);
}

/**
 * The characters of the prompt the service sent: the messages of the body.
 *
 * The service counts the question, the history, the pages and the system
 * prompt; the body holds the same text, so the two agree.
 */
export function promptCharsOf(body: unknown): number {
	const messages = (body as { messages?: { content?: unknown }[] }).messages ?? [];
	let chars = 0;
	for (const message of messages) {
		const content = message.content;
		if (typeof content === 'string') chars += content.length;
		else if (Array.isArray(content)) {
			for (const part of content) {
				const text = (part as { text?: unknown }).text;
				if (typeof text === 'string') chars += text.length;
			}
		}
	}
	return chars;
}

/** The text of the deltas of a list of events. */
export function textOf(events: SseEvent[]): string {
	return events
		.filter((event) => event.event === 'text.delta')
		.map((event) => (event.data as { text: string }).text)
		.join('');
}

/** The log lines of the service, read while a call happens. */
export async function withLogs<T>(body: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
	const logs: string[] = [];
	const info = console.info;
	console.info = (...args: unknown[]) => {
		logs.push(args.map((arg) => String(arg)).join(' '));
	};
	try {
		const result = await body();
		return { result, logs };
	} finally {
		console.info = info;
	}
}

/** The ids of the runs whose usage was estimated, as the log says it. */
export function estimatedLogs(logs: string[]): string[] {
	const found: string[] = [];
	for (const line of logs) {
		try {
			const parsed = JSON.parse(line) as { usageEstimated?: unknown; runId?: unknown };
			if (parsed.usageEstimated === true) found.push(String(parsed.runId));
		} catch {
			// Not a JSON line: not ours.
		}
	}
	return found;
}

/** The usage of a call: the tokens and the cost of a list of events. */
export function usageOf(events: SseEvent[]): {
	inputTokens: number;
	outputTokens: number;
	costMicroUsd: number;
} {
	const usage = events.find((event) => event.event === 'usage')?.data as
		| { inputTokens: number; outputTokens: number; costMicroUsd: number }
		| undefined;
	assert.ok(usage);
	return usage;
}
