import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { ApprovalRow, CardReason } from '../src/approvals/types.ts';
import type { Kit } from './autoDecideFixture.ts';

/**
 * The auto verdict (AM4, AM10-AM12, AM17, AM18): one test per card reason, each
 * with every earlier check passing.
 */
const {
	USER_A, USER_B, WORKSPACE_A, WORKSPACE_B, app, bridge, autoVerdict, makeRunCredential, makeWriteBudget, makeStepCounter,
	checkAutoWriteRate, config, user, AUTO, page, kit, row, awayFromMinuteBoundary, append, reasonOf,
} = await import('./autoDecideFixture.ts');

describe('autoVerdict: one card reason each, every earlier check passing', () => {
	beforeEach(async () => {
		const keys = await app.redis.keys('ai:rl:auto*');
		if (keys.length > 0) await app.redis.del(...keys);
		bridge.reset();
	});

	const cases: Array<[CardReason, () => Promise<[Kit, ApprovalRow]>]> = [
		['mode_manual', async () => { const k = await kit({ mode: 'manual', anchorPageId: null }); return [k, await row(k, 'add_blocks', append(await page()))]; }],
		['not_allowlisted', async () => { const k = await kit(AUTO, AUTO, { user: { ...user, userId: USER_B } }); return [k, await row(k, 'add_blocks', append(await page()))]; }],
		['tool_not_eligible', async () => { const k = await kit(); return [k, await row(k, 'archive_page', { pageId: await page() })]; }],
		['mode_changed', async () => {
			const [a, b] = [await page(), await page()];
			const k = await kit({ mode: 'accept_edits', anchorPageId: a }, { mode: 'accept_edits', anchorPageId: b });
			return [k, await row(k, 'add_blocks', append(a))];
		}],
		['tainted', async () => {
			const k = await kit();
			await app.db.query("update public.ai_conversations set provenance_tainted_at = now(), provenance_reason = 'shared_page' where id = $1", [k.conversationId]);
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['outside_workspace', async () => { const k = await kit(); return [k, await row(k, 'add_blocks', append(await page(WORKSPACE_B)))]; }],
		['no_anchor', async () => {
			const anchor = await page();
			const k = await kit({ mode: 'accept_edits', anchorPageId: anchor });
			return [k, await row(k, 'create_page', { title: 'root', workspaceId: WORKSPACE_A })];
		}],
		['outside_anchor', async () => {
			const anchor = await page();
			const k = await kit({ mode: 'accept_edits', anchorPageId: anchor });
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['no_credential', async () => { const k = await kit(AUTO, AUTO, { credential: null }); return [k, await row(k, 'add_blocks', append(await page()))]; }],
		['credential_expiring', async () => {
			const k = await kit(AUTO, AUTO, { credential: makeRunCredential('t', Date.now() + 20_000) });
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['budget_low', async () => {
			const controller = new AbortController();
			controller.abort();
			const k = await kit(AUTO, AUTO, { budget: makeWriteBudget({ startedAtMs: Date.now(), totalMs: 120_000, signal: controller.signal }) });
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['step_cap', async () => {
			const step = makeStepCounter(1);
			step.take();
			const k = await kit(AUTO, AUTO, { step });
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['turn_cap', async () => {
			const k = await kit();
			for (let i = 0; i < config.autoPerTurn; i += 1) {
				await app.db.query("update public.ai_approvals set decided_by = 'auto:auto' where id = $1", [(await row(k, 'add_blocks', append(await page()))).id]);
			}
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['rate_limited', async () => {
			await awayFromMinuteBoundary();
			for (let i = 0; i < config.autoPerMinute; i += 1) await checkAutoWriteRate(app.redis, USER_A);
			const k = await kit();
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['day_cap', async () => {
			await awayFromMinuteBoundary();
			const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
			await app.redis.set(`ai:rl:auto:day:${USER_A}:${day}`, String(config.autoPerDay));
			const k = await kit();
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
	];
	for (const [reason, build] of cases) {
		it(`${reason}`, async () => {
			const [k, r] = await build();
			assert.equal(await reasonOf(k, r), reason);
		});
	}

	it('a write waits for a read of its own step that taints the conversation after it asked', async () => {
		const k = await kit();
		const slowTaint = new Promise<void>((resolve) => setTimeout(resolve, 50)).then(() =>
			app.db.query("update public.ai_conversations set provenance_tainted_at = now(), provenance_reason = 'shared_page' where id = $1", [k.conversationId]));
		k.gate.reads.add(slowTaint);
		assert.equal(await reasonOf(k, await row(k, 'add_blocks', append(await page()))), 'tainted');
	});

	it('a sibling read that outlasts the run-budget margin makes the verdict refuse, not claim on a stale clock', async () => {
		// The budget's clock is anchored on the call, not on the wall clock of the
		// case: 300 ms of room, a read of 600 ms, so the result does not depend on
		// how long the setup took.
		const calledAt = Date.now();
		const real = makeWriteBudget({ startedAtMs: calledAt, totalMs: 120_000, signal: new AbortController().signal });
		const budget = { ...real, canClaim: (nowMs: number) => nowMs - calledAt < 300 };
		const k = await kit(AUTO, AUTO, { budget });
		const r = await row(k, 'add_blocks', append(await page()));
		assert.equal(budget.canClaim(calledAt), true, 'room at the start');
		k.gate.reads.add(new Promise<void>((resolve) => setTimeout(resolve, 600)));
		const verdict = await autoVerdict(k.gate, r, calledAt);
		assert.deepEqual(verdict, { kind: 'card', reason: 'budget_low' });
	});

	it('an unknown write tool is tool_not_eligible even in auto (AM17)', async () => {
		const k = await kit();
		assert.equal(await reasonOf(k, await row(k, 'some_future_write', append(await page()))), 'tool_not_eligible');
	});

	it('a conversation row that is gone narrows to mode_manual', async () => {
		const k = await kit();
		await app.db.query('update public.ai_conversations set owner_id = $2 where id = $1', [k.conversationId, USER_B]);
		assert.equal(await reasonOf(k, await row(k, 'add_blocks', append(await page()))), 'mode_manual');
	});

	it('a widened live mode changes nothing; a narrowed one wins', async () => {
		const wide = await kit({ mode: 'accept_edits', anchorPageId: await page() }, AUTO);
		assert.equal(await reasonOf(wide, await row(wide, 'add_blocks', append(await page()))), 'outside_anchor');
		const narrow = await kit(AUTO, { mode: 'manual', anchorPageId: null });
		assert.equal(await reasonOf(narrow, await row(narrow, 'add_blocks', append(await page()))), 'mode_manual');
	});

	it('applies in auto and in accept_edits under the anchor, naming the decider', async () => {
		const k = await kit();
		assert.equal(await reasonOf(k, await row(k, 'add_blocks', append(await page()))), 'auto:auto');
		const anchor = await page();
		const child = await page(WORKSPACE_A, anchor);
		const e = await kit({ mode: 'accept_edits', anchorPageId: anchor });
		assert.equal(await reasonOf(e, await row(e, 'add_blocks', append(child))), 'auto:accept_edits');
		assert.equal(await reasonOf(e, await row(e, 'create_page', { title: 'n', workspaceId: WORKSPACE_A, parentPageId: child })), 'auto:accept_edits');
	});
});
