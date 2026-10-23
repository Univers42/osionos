import { randomUUID } from 'node:crypto';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The service with the builders on, and the plan helpers the builder tests share.
 *
 * The service reads its config on import, so a test sets its own environment
 * first and imports this module dynamically after it.
 */
process.env.OSIONOS_AI_BUILDERS = 'on';
const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
export const harness = await startHarness();
const { app, bridge, mock, postRun, createConversation, tokenFor, call } = harness;

export async function closeBuilderHarness(): Promise<void> {
	await app.close();
	await mock.close();
	await bridge.close();
}

export type Json = Record<string, unknown>;

/** A plan within the caps: a page holding a database and a sub-page. */
export function goodPlan(patch: Json = {}): Json {
	return {
		workspaceId: WORKSPACE_A,
		title: 'Sales workspace',
		items: [
			{
				kind: 'page',
				key: 'home',
				title: 'Home',
				blocks: [
					{ type: 'heading_1', content: 'Welcome' },
					{ type: 'database_inline', databaseKey: 'deals' },
				],
				children: [{ kind: 'page', key: 'notes', title: 'Notes' }],
			},
			{
				kind: 'database',
				key: 'deals',
				title: 'Deals',
				properties: [
					{ name: 'Name', type: 'title' },
					{ name: 'Stage', type: 'status', options: ['Open', 'Won'] },
				],
				views: [{ type: 'table', name: 'All' }],
				rows: [{ values: { Name: 'Acme', Stage: 'Open' } }],
			},
		],
		...patch,
	};
}

/** The events of a run in which the model calls build_plan. */
export async function ask(args: Json): Promise<SseEvent[]> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: 'build_plan', arguments: args },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	return collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
}

/** The permission.asked events. */
export function asked(events: SseEvent[]): SseEvent[] {
	return events.filter((event) => event.event === 'permission.asked');
}

/** Decide an approval, as user A by default; `items` are the plan keys kept. */
export async function decide(approvalId: string, decision = 'approve', token = tokenFor(USER_A, WORKSPACE_A), items?: string[]) {
	return call(`/api/ai/approvals/${approvalId}`, {
		method: 'POST',
		token,
		body: { decision, ...(items ? { items } : {}) },
	});
}
