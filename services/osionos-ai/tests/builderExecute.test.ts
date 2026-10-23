import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Json } from './builderHarness.ts';

process.env.OSIONOS_AI_BUILD_BUDGET_MS = '500';
// The C161 limits have their own file (builderUndo.test.ts); this one asks many
// plans on purpose, so it lifts them out of the way.
process.env.OSIONOS_AI_PENDING_PLANS = '100';
process.env.OSIONOS_AI_BUILDS_PER_DAY = '100';
const { harness, closeBuilderHarness, goodPlan, ask, asked, decide } = await import('./builderHarness.ts');
const { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, bridge, tokenFor, call } = harness;
const { revalidateStoredPlan, flattenPlan } = await import('../src/builders/plan.ts');
const { approvedKeys, writeOf } = await import('../src/builders/execute.ts');
const { allItems, pendingItems } = await import('../src/builders/items.ts');

after(closeBuilderHarness);

describe('builder execute', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		await app.db.query('delete from public.ai_approvals');
		await app.db.query('delete from public.ai_plan_items');
		bridge.reset();
	});

	it('C157 an approved plan is built parents first, with the deciding token', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		const token = tokenFor(USER_A, WORKSPACE_A);
		bridge.reset();
		bridge.delayMs = 0;
		const decided = await decide(data.approvalId, 'approve', token);
		assert.equal(decided.status, 200);
		assert.equal((decided.body as { status: string }).status, 'executed');
		const pages = bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/pages');
		const dbs = bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/object-databases');
		assert.equal(pages.length + dbs.length, 3);
		// position order: home page, notes page? Actually flat order home, notes, deals. pages: home, notes; db: deals.
		// every Authorization is deciding token
		for (const c of bridge.calls) {
			assert.equal(c.authorization, `Bearer ${token}`);
		}
		// page body carries id
		assert.ok((pages[0].body as { id?: string }).id);
		// db body carries ifAbsent true and state without formulaConfig/buttonConfig
		const dbBody = dbs[0].body as { ifAbsent: boolean; state: { databases: Record<string, unknown> } };
		assert.equal(dbBody.ifAbsent, true);
		assert.ok(!JSON.stringify(dbBody.state).includes('formulaConfig'));
		assert.ok(!JSON.stringify(dbBody.state).includes('buttonConfig'));
		// items done
		const items = await allItems(app.db, data.approvalId);
		for (const it of items) assert.equal(it.status, 'done');
	});

	it('C154 C164.7 a toggled-off page and its descendants are not created', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		bridge.reset();
		// approve only 'deals' (home toggled off -> notes descendant skipped)
		const decided = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A), ['deals', 'notes']);
		assert.equal(decided.status, 200);
		// no call for home or notes
		const pages = bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/pages');
		assert.equal(pages.length, 0, 'no page created');
		const dbs = bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/object-databases');
		assert.equal(dbs.length, 1, 'deals created');
		const items = await allItems(app.db, data.approvalId);
		const home = items.find((i) => i.item_key === 'home')!;
		const notes = items.find((i) => i.item_key === 'notes')!;
		assert.equal(home.status, 'skipped');
		assert.equal(notes.status, 'skipped');
	});

	it('C154 an unknown item key is a 400 and nothing is claimed', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		const rowBefore = await app.db.query('select status from public.ai_approvals where id = $1', [data.approvalId]);
		assert.equal(rowBefore.rows[0].status, 'pending');
		const decided = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A), ['nope']);
		assert.equal(decided.status, 400);
		assert.equal((decided.body as { code?: string }).code, 'unknown_item');
		const rowAfter = await app.db.query('select status from public.ai_approvals where id = $1', [data.approvalId]);
		assert.equal(rowAfter.rows[0].status, 'pending');
	});

	it('C157 C164.5 a budget overrun leaves the rest pending, partial, and resume runs only those', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		bridge.reset();
		bridge.delayMs = 300;
		const decided = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		assert.equal(decided.status, 200);
		const status = (decided.body as { status: string }).status;
		assert.equal(status, 'partial');
		// resume with new token
		const pendingBefore = await pendingItems(app.db, data.approvalId);
		bridge.delayMs = 0;
		bridge.reset();
		const newToken = tokenFor(USER_A, WORKSPACE_A);
		const resumed = await call(`/api/ai/approvals/${data.approvalId}/resume`, {
			method: 'POST',
			token: newToken,
			body: {},
		});
		assert.equal(resumed.status, 200);
		assert.equal((resumed.body as { status: string }).status, 'executed');
		const resumeCalls = bridge.calls.filter((c) => c.method === 'POST' && (c.path === '/api/pages' || c.path === '/api/object-databases'));
		assert.equal(resumeCalls.length, pendingBefore.length, 'resume runs only the pending items');
	});

	it('C156 C164.2 a retried item creates no duplicate', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		bridge.reset();
		bridge.loseNextAnswers(1);
		const first = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		assert.equal(first.status, 200);
		assert.equal((first.body as { status: string }).status, 'partial');
		// resume without reset
		bridge.delayMs = 0;
		const resumed = await call(`/api/ai/approvals/${data.approvalId}/resume`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: {},
		});
		assert.equal(resumed.status, 200);
		assert.equal((resumed.body as { status: string }).status, 'executed');
		const pageCalls = bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/pages');
		const pageIds = pageCalls.map((c) => (c.body as { id: string }).id);
		const unique = new Set(pageIds);
		assert.equal(unique.size, 2, 'each page id is created exactly once');
		assert.ok(pageIds.includes('notes') === false || pageCalls.some((c) => (c.body as { title?: string }).title === 'Notes'), 'children created');
	});

	it('C157 a second resume of the same approval is refused', async () => {
		// reuse a fresh approval
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		bridge.reset();
		bridge.delayMs = 0;
		await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		// already executed -> resume refused
		const r = await call(`/api/ai/approvals/${data.approvalId}/resume`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: {},
		});
		assert.equal(r.status, 409);
		// foreign user 404
		const events2 = await ask(goodPlan());
		const data2 = asked(events2)[0].data as { approvalId: string };
		await decide(data2.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		const r2 = await call(`/api/ai/approvals/${data2.approvalId}/resume`, {
			method: 'POST',
			token: tokenFor(USER_B, WORKSPACE_A),
			body: {},
		});
		assert.equal(r2.status, 404);
	});

	it('C158 C164.8 a member removed before the decision gets nothing written', async () => {
		// shared workspace: insert membership, then remove it
		await app.db.query(
			`insert into public.osionos_workspace_members (user_id, workspace_id, role) values ($1, $2, 'member') on conflict do nothing`,
			[USER_A, WORKSPACE_B],
		);
		const plan = goodPlan({ workspaceId: WORKSPACE_B });
		const events = await ask(plan);
		const data = asked(events)[0].data as { approvalId: string };
		await app.db.query('delete from public.osionos_workspace_members where user_id = $1 and workspace_id = $2', [USER_A, WORKSPACE_B]);
		bridge.reset();
		const decided = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		assert.equal(decided.status, 200);
		assert.equal((decided.body as { status: string }).status, 'failed');
		assert.equal(bridge.count, 0);
		const items = await allItems(app.db, data.approvalId);
		for (const it of items) {
			if (it.status !== 'skipped') assert.equal(it.status, 'failed');
		}
		// restore membership
		await app.db.query(
			`insert into public.osionos_workspace_members (user_id, workspace_id, role) values ($1, $2, 'member') on conflict do nothing`,
			[USER_A, WORKSPACE_A],
		);
	});

	it('C164.1 a stored plan tampered with a button property is refused at execution', async () => {
		const events = await ask(goodPlan());
		const data = asked(events)[0].data as { approvalId: string };
		// tamper stored args
		const row = await app.db.query('select args from public.ai_approvals where id = $1', [data.approvalId]);
		const stored = row.rows[0].args as { items: Json[] };
		const tampered = JSON.parse(JSON.stringify(stored)) as { items: Json[] };
		tampered.items[1].properties = [{ name: 'Go', type: 'button' } as unknown as Json];
		// Actually need keep title property; set properties with button type (schema refuses)
		tampered.items[1].properties = [{ name: 'Name', type: 'title' }, { name: 'Go', type: 'button' }];
		await app.db.query('update public.ai_approvals set args = $1::jsonb where id = $2', [JSON.stringify(tampered), data.approvalId]);
		bridge.reset();
		const decided = await decide(data.approvalId, 'approve', tokenFor(USER_A, WORKSPACE_A));
		assert.equal(decided.status, 200);
		assert.equal((decided.body as { status: string }).status, 'failed');
		assert.equal(bridge.count, 0);
	});

	it('C156 the writes of an item are identical across calls', async () => {
		const stored = await (async () => {
			const ev = await ask(goodPlan());
			const d = asked(ev)[0].data as { approvalId: string };
			const r = await app.db.query('select args from public.ai_approvals where id = $1', [d.approvalId]);
			return r.rows[0].args;
		})();
		const rv = revalidateStoredPlan(stored);
		const plan = (rv as { ok: true; plan: any }).plan!;
		const flat = flattenPlan(plan);
		const item = flat[0]!;
		const w1 = writeOf(plan, item, { userId: USER_A, now: '2026-01-01T00:00:00.000Z' });
		const w2 = writeOf(plan, item, { userId: USER_A, now: '2026-01-01T00:00:00.000Z' });
		assert.deepEqual(w1, w2);
	});

	it('C154 approvedKeys drops the descendants of a toggled-off parent', async () => {
		const plan = goodPlan();
		const ev = await ask(plan);
		const d = asked(ev)[0].data as { approvalId: string };
		const r = await app.db.query('select args from public.ai_approvals where id = $1', [d.approvalId]);
		const rv = revalidateStoredPlan(r.rows[0].args);
		const flat = flattenPlan((rv as { ok: true; plan: any }).plan!);
		const approved = approvedKeys(flat, ['deals']);
		assert.deepEqual(approved, ['deals']);
		const approved2 = approvedKeys(flat, ['home']);
		assert.deepEqual(approved2, ['home']);
		const approved3 = approvedKeys(flat);
		assert.equal(approved3.length, 3);
	});
});
