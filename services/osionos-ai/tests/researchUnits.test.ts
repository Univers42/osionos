import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { stepCeilingsMicroUsd } from '../src/runs/estimate.ts';
import { stepHasTools, stepsLedger } from '../src/runs/loopBudget.ts';
import type { LoopBudget, StepUsage } from '../src/runs/loopBudget.ts';
import { admitResearch } from '../src/research/admission.ts';
import { createResearchSession } from '../src/research/session.ts';
import { RESEARCH_LIMITS, RESEARCH_WEB_CAPS } from '../src/tools/limits.ts';
import { UrlProvenance } from '../src/web/provenance.ts';
import { WorkspaceTextLedger } from '../src/web/queryGuard.ts';
import { InFlight } from '../src/web/limits.ts';
import { webTools } from '../src/web/tools.ts';
import type { WebRun } from '../src/web/tools.ts';
import type { AnyReadTool } from '../src/tools/types.ts';

/**
 * The research primitives in isolation (h2-research-verdict.md): the caps,
 * the query guard under them, the money rule, the admission and the
 * coalescing. The routes are in research.test.ts.
 */
const redis = new Redis(process.env.OSIONOS_AI_REDIS_URL ?? '');
after(async () => {
	await redis.quit();
});

const PLATFORM = { id: 'p', label: 'p', inputMicroUsdPerMTok: 3_000_000, outputMicroUsdPerMTok: 15_000_000, default: false };
const ctx = {} as Parameters<AnyReadTool['run']>[0];

function webRig(read: string[] = []) {
	const searches: string[] = [];
	const fetches: string[] = [];
	const ledger = new WorkspaceTextLedger();
	for (const text of read) ledger.add(text);
	const provenance = new UrlProvenance();
	provenance.addTyped('https://docs.example.org/guide');
	const noop = { multi: () => ({ incr() { return this; }, incrby() { return this; }, expire() { return this; }, exec: async () => [[null, 1]] }), get: async () => null };
	const run: WebRun = {
		db: { query: async () => ({ rows: [] }) } as unknown as Pool,
		redis: noop as never,
		runId: 'r',
		userId: 'u',
		conversationId: 'c',
		provenance,
		ledger,
		taint: { tainted: false, domains: [] },
		counters: { searches: 0, fetches: 0, bytes: 0 },
		caps: RESEARCH_WEB_CAPS,
		searxngUrl: 'http://searxng.internal:8080',
		inFlight: new InFlight(),
		search: async (query) => (searches.push(query), [{ url: 'https://docs.example.org/guide', title: 'G', content: 'c' }]),
		fetch: async (url) => (fetches.push(url.href), { url: url.href, title: 'G', text: 'abc', links: [], bytes: 3, ms: 1 }),
		log: () => {},
	};
	const [search, fetch] = webTools(run);
	return { run, searches, fetches, search: search as AnyReadTool, fetch: fetch as AnyReadTool };
}

describe('research caps and guards', () => {
	it('C400 the 17th search and the 25th fetch get the cap sentence and make no request', async () => {
		const r = webRig();
		for (let n = 0; n < 16; n += 1) assert.equal((await r.search.run(ctx, { query: `topic ${n}` })).ok, true);
		const search = await r.search.run(ctx, { query: 'one too many' });
		assert.equal(search.ok, false);
		assert.match(search.ok ? '' : search.error, /already made 16 web searches/);
		assert.equal(r.searches.length, 16);
		for (let n = 0; n < 24; n += 1) assert.equal((await r.fetch.run(ctx, { url: 'https://docs.example.org/guide' })).ok, true);
		const fetch = await r.fetch.run(ctx, { url: 'https://docs.example.org/guide' });
		assert.match(fetch.ok ? '' : fetch.error, /already read 24 web pages/);
		assert.equal(r.fetches.length, 24);
		assert.equal(r.run.counters.bytes, 72);
	});

	it('C406 a query that carries 40 characters of workspace text is refused with the caps raised', async () => {
		const secret = 'the quarterly revenue of the north region fell by eleven percent';
		const r = webRig([secret]);
		const out = await r.search.run(ctx, { query: `why did ${secret.slice(4, 50)} happen` });
		assert.equal(out.ok, false);
		assert.deepEqual(r.searches, []);
		assert.equal((await r.search.run(ctx, { query: 'north region market trends' })).ok, true);
	});

	it('C403 a run holding the money for two steps makes the third the answer', async () => {
		const step: StepUsage = { usage: { inputTokens: 100, outputTokens: 50 }, content: [{ output: 'x'.repeat(RESEARCH_LIMITS.stepChars) }] };
		const budget: LoopBudget = { reserved: 0, pricing: PLATFORM, baseChars: 200, runId: randomUUID(), limits: RESEARCH_LIMITS };
		const { accrued } = stepsLedger(budget, [step, step]);
		budget.reserved = accrued + stepCeilingsMicroUsd(PLATFORM, { baseChars: 200, pool: 2 * RESEARCH_LIMITS.stepChars, limits: RESEARCH_LIMITS }).needed - 1;
		assert.equal(await stepHasTools(budget, { stepNumber: 1, steps: [step] }), true);
		assert.equal(await stepHasTools(budget, { stepNumber: 2, steps: [step, step] }), false);
		assert.equal(budget.deadlineHit, undefined, 'the money, not the clock, ended it');
	});
});

describe('research admission', () => {
	it('C401 the third run of an instance is busy before Redis is asked; a Redis error is busy too', async () => {
		const down = { eval: async () => { throw new Error('down'); } } as unknown as Redis;
		assert.deepEqual(await admitResearch(down, { userId: randomUUID(), runId: randomUUID(), platformPays: false }), { kind: 'refused', code: 'research_busy' });
		const [one, two] = [
			await admitResearch(redis, { userId: randomUUID(), runId: randomUUID(), platformPays: false }),
			await admitResearch(redis, { userId: randomUUID(), runId: randomUUID(), platformPays: false }),
		];
		assert.equal(one.kind, 'admitted');
		assert.equal(two.kind, 'admitted');
		const third = await admitResearch(redis, { userId: randomUUID(), runId: randomUUID(), platformPays: false });
		assert.deepEqual(third, { kind: 'refused', code: 'research_busy' });
		for (const held of [one, two]) if (held.kind === 'admitted') await held.release();
	});

	it('C404 a user\'s own model takes no seat of the platform quota; the platform model takes one', async () => {
		const userId = randomUUID();
		const own = await admitResearch(redis, { userId, runId: randomUUID(), platformPays: false });
		assert.equal(own.kind, 'admitted');
		if (own.kind === 'admitted') await own.release();
		assert.equal((await redis.keys(`ai:rl:research:${userId}:*`)).length, 0);
		const paid = await admitResearch(redis, { userId, runId: randomUUID(), platformPays: true });
		assert.equal(paid.kind, 'admitted');
		assert.equal((await redis.keys(`ai:rl:research:${userId}:*`)).length, 1);
		if (paid.kind === 'admitted') {
			await paid.refund();
			await paid.release();
		}
		assert.equal(Number(await redis.get((await redis.keys(`ai:rl:research:${userId}:*`))[0] ?? '')), 0, 'a refund gives the seat back');
	});
});

describe('research events', () => {
	it('C402 text is held to 200 characters and flushed before a tool call, in order', async () => {
		const events: [string, unknown][] = [];
		const session = createResearchSession({ emit: async (type, data) => void events.push([type, data]), counters: () => undefined, maxSteps: 12, startedAt: 0 });
		await session.hooks.onText?.('a'.repeat(150));
		assert.equal(events.length, 0);
		await session.hooks.onText?.('b'.repeat(60));
		assert.deepEqual(events.map(([type]) => type), ['text.delta']);
		await session.hooks.onText?.('tail');
		await session.hooks.onToolCall?.({ toolCallId: 't', toolName: 'web_search', input: { query: 'q' } } as never);
		assert.deepEqual(events.map(([type]) => type), ['text.delta', 'text.delta', 'tool.called']);
	});
});
