/**
 * The auto verdict and the auto apply (AM4, AM10-AM12, AM17, AM18): one test
 * per card reason, each with every earlier check passing, then the apply and
 * its 401 path.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import type { AuthUser } from '../src/auth.ts';
import type { ApprovalRow, CardReason } from '../src/approvals/types.ts';
import type { AutoGate } from '../src/modes/autoGate.ts';
import type { StoredMode } from '../src/modes/mode.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_A;
process.env.OSIONOS_AI_AUTO_PER_TURN = '2';
process.env.OSIONOS_AI_AUTO_PER_MINUTE = '3';

const { startHarness, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, mock, bridge, createConversation } = await startHarness();
const { autoVerdict } = await import('../src/approvals/autoVerdict.ts');
const { autoDecide } = await import('../src/approvals/autoDecide.ts');
const { makeRunCredential } = await import('../src/modes/credential.ts');
const { makeWriteBudget } = await import('../src/modes/writeBudget.ts');
const { makeStepCounter, checkAutoWriteRate } = await import('../src/modes/autoLimits.ts');
const { writeConversationMode } = await import('../src/modes/mode.ts');
const { config } = await import('../src/config.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };
const AUTO: StoredMode = { mode: 'auto', anchorPageId: null };

async function page(workspaceId = WORKSPACE_A, parent: string | null = null): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, parent_page_id, content)
		 values ($1, $2, $3, 't', 'private', $4, '[]'::jsonb)`,
		[id, workspaceId, USER_A, parent],
	);
	bridge.seedPage(id, [], 1);
	return id;
}

interface Kit { gate: AutoGate; conversationId: string; runId: string; turnId: string }

/** A run row, a conversation holding `live`, and a gate whose snapshot is `snapshot`. */
async function kit(snapshot: StoredMode = AUTO, live: StoredMode = snapshot, over: Partial<AutoGate> = {}): Promise<Kit> {
	const conversationId = await createConversation();
	await writeConversationMode(app.db, conversationId, USER_A, live);
	const runId = randomUUID();
	const turnId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model, turn_id) values ($1, $2, $3, 'running', 'm', $4)`,
		[runId, conversationId, USER_A, turnId],
	);
	const gate: AutoGate = {
		db: app.db, redis: app.redis, user, conversationId, workspaceId: WORKSPACE_A, runId, turnId,
		snapshot: { ...snapshot, runKind: 'request' },
		credential: makeRunCredential('the-session-token', Date.now() + 3_600_000),
		budget: makeWriteBudget({ startedAtMs: Date.now(), totalMs: 120_000, signal: new AbortController().signal }),
		step: makeStepCounter(10),
		reads: new Set(),
		...over,
	};
	return { gate, conversationId, runId, turnId };
}

async function row(k: Kit, tool: string, args: Record<string, unknown>): Promise<ApprovalRow> {
	const id = randomUUID();
	const inserted = await app.db.query<ApprovalRow>(
		`insert into public.ai_approvals (id, owner_id, workspace_id, tool, args, args_sha256, status, origin, conversation_id, run_id, expires_at)
		 values ($1, $2, $3, $4, $5::jsonb, $6, 'pending', 'run', $7, $8, now() + interval '10 minutes') returning *`,
		[id, USER_A, WORKSPACE_A, tool, JSON.stringify(args), `ad-${id}`, k.conversationId, k.runId],
	);
	return inserted.rows[0];
}

const append = (pageId: string): Record<string, unknown> => ({ pageId, blocks: [{ type: 'paragraph', content: 'x' }] });
const reasonOf = async (k: Kit, r: ApprovalRow): Promise<string> => {
	const verdict = await autoVerdict(k.gate, r, Date.now());
	return verdict.kind === 'card' ? verdict.reason : verdict.decidedBy;
};

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
			for (let i = 0; i < config.autoPerMinute; i += 1) await checkAutoWriteRate(app.redis, USER_A);
			const k = await kit();
			return [k, await row(k, 'add_blocks', append(await page()))];
		}],
		['day_cap', async () => {
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

describe('autoDecide', () => {
	beforeEach(async () => {
		const keys = await app.redis.keys('ai:rl:auto*');
		if (keys.length > 0) await app.redis.del(...keys);
		bridge.reset();
	});

	it('claims, writes with the credential, records executed with decided_by auto:auto', async () => {
		const k = await kit();
		const target = await page();
		const r = await row(k, 'add_blocks', append(target));
		const outcome = await autoDecide(k.gate, r);
		assert.equal(outcome.kind, 'applied');
		if (outcome.kind !== 'applied') return;
		assert.equal(outcome.event.decidedBy, 'auto:auto');
		assert.equal(outcome.event.target, target);
		assert.equal(outcome.event.undoable, true);
		const stored = (await app.db.query('select status, decided_by from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.deepEqual(stored, { status: 'executed', decided_by: 'auto:auto' });
		assert.equal(bridge.calls.length, 1);
		assert.equal(bridge.calls[0].authorization, 'Bearer the-session-token');
	});

	it('a 401 gives the claim back: pending, no decider, one bridge call, card credential_rejected', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		bridge.failWith = 401;
		try {
			assert.deepEqual(await autoDecide(k.gate, r), { kind: 'card', reason: 'credential_rejected' });
		} finally {
			bridge.failWith = 0;
		}
		const stored = (await app.db.query('select status, decided_by, error from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.deepEqual(stored, { status: 'pending', decided_by: null, error: null });
		assert.equal(bridge.calls.length, 1);
	});

	it('another refusal is recorded failed and told to the model as not applied', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		bridge.failWith = 500;
		try {
			const outcome = await autoDecide(k.gate, r);
			assert.equal(outcome.kind, 'refused');
		} finally {
			bridge.failWith = 0;
		}
		const stored = (await app.db.query('select status from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.equal(stored.status, 'failed');
	});

	it('a row someone else already decided is refused, never written twice', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		await app.db.query("update public.ai_approvals set status = 'declined' where id = $1", [r.id]);
		assert.equal((await autoDecide(k.gate, r)).kind, 'refused');
		assert.equal(bridge.calls.length, 0);
	});

	it('a card leaves the row pending and calls nothing', async () => {
		const k = await kit({ mode: 'manual', anchorPageId: null });
		const r = await row(k, 'add_blocks', append(await page()));
		assert.deepEqual(await autoDecide(k.gate, r), { kind: 'card', reason: 'mode_manual' });
		assert.equal(bridge.calls.length, 0);
	});
});

describe('AM1: an applied write leaves the token nowhere', () => {
	it('an applied write leaves no row, event or bridge-visible field holding the token', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		const outcome = await autoDecide(k.gate, r);
		const stored = await app.db.query('select * from public.ai_approvals where id = $1', [r.id]);
		assert.ok(!JSON.stringify([outcome, stored.rows]).includes('the-session-token'));
		assert.ok((await app.redis.keys('*')).every((key) => !key.includes('the-session-token')));
	});
});
